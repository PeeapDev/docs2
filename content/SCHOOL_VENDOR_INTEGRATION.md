# School-District Platform — Vendor Charge Integration Spec

What the school SaaS (`*.gov.school.edu.sl`) must provide for the Peeap
"vendor scans a student's card and charges their wallet" flow to work end to end.

Peeap side is built + deployed (2026-07-02). The items below are the **school
platform's responsibilities**. Some may already be done — each is marked with how
Peeap verifies it.

---

## 1. Register vendors — now REQUIRES an address

`POST https://api.peeap.com/school/vendors`
Auth: `Authorization: Bearer <school OAuth access_token>` (the token issued to the school connection).

```json
{
  "vendor_name": "Aunty Kadi Canteen",   // required — becomes the merchant business name
  "vendor_type": "canteen",               // canteen | bookshop | uniform | transport
  "contact_phone": "+23288001122",        // the phone the vendor will sign up on Peeap with
  "contact_email": "kadi@example.com",     // OR the email — at least one is required
  "address": "12 School Road, Bo",        // NEW — copied onto the vendor's merchant business
  "city": "Bo"                             // NEW
}
```

**What changed:** `address` and `city` are new. They are attached to the merchant
business Peeap auto-creates when the vendor signs up (so the business carries the
school's address). Send them.

**Critical:** `contact_phone` / `contact_email` MUST be exactly what the vendor will
use to sign up on Peeap. Matching is by normalized phone (+232…) and case-insensitive
email. If they don't match, the vendor is never linked and cannot be paid.
→ *Verify:* the response returns `status: "pending"`; after the vendor signs up it
flips to `active`.

---

## 2. Student card resolver — `/s/<token>/peeap.json`

The student ID card QR encodes `https://<school>.gov.school.edu.sl/s/<token>`.
Peeap's scanner fetches `https://<school>.gov.school.edu.sl/s/<token>/peeap.json`.

**Required response today (you said this is done — please confirm the wallet is the RIGHT one):**
```json
{
  "ok": true,
  "name": "Fatima Kamara",
  "has_wallet": true,
  "peeap_wallet_id": "<uuid>",   // MUST equal the student's student_wallets.wallet_id
  "peeap_user_id": "<uuid>"
}
```

**THE critical requirement:** `peeap_wallet_id` must be the student's **spending
wallet** — the same wallet row Peeap holds as `student_wallets.wallet_id` (the one
that carries the PIN, daily limit, and shows in the parent's purchase history). If
the card resolves to any other wallet, the charge fails with `student_not_found` or
debits the wrong balance. This is the single most common thing to get wrong.

**Recommended addition:** include the NSI so receipts/history can show it:
```json
{ "...": "...", "nsi": "A123456" }
```
(Peeap can charge without it — it resolves the student by `peeap_wallet_id` — but the
NSI improves receipts and reconciliation.)

---

## 3. Every chargeable student must have a Peeap student wallet WITH a PIN

For a charge to succeed the student needs a `student_wallets` row that has:
- `wallet_id` — matching the card's `peeap_wallet_id` (see §2)
- `nsi` — the student's NSI (letter + 6 digits, e.g. `A123456`)
- `peeap_school_id` — your school's Peeap id (`sch_…`)
- `pin_hash` — a PIN set (see below)
- `status = 'active'`

**PIN:** by default a purchase requires the **student's PIN** (entered on the
vendor's phone). So each student must have set a PIN. If a student has no PIN, the
charge returns `pin_not_set` (`412`). Ensure your student onboarding either (a)
prompts the student/parent to set a PIN, or (b) tells them to set it in the Peeap
app. *Underage students:* a parent can turn the PIN requirement OFF per-child in the
Peeap app (spending stays capped by the daily limit) — that's handled on Peeap's side,
you don't need to build it.

→ *Verify:* a test charge to a synced student returns `200` (or `412 pin_not_set` if
no PIN — which tells you the wallet exists but the PIN step is missing).

---

## 4. Keep the student sync current

Vendors can only charge students whose `student_wallets` row exists and is `active`
under your `peeap_school_id`. Ensure your enrollment/sync keeps students provisioned
(new students get wallets; graduated/withdrawn students are deactivated). A vendor at
your school can only charge students of the **same** `peeap_school_id`
(cross-school charges are rejected with `wrong_school`).

---

## Quick end-to-end test checklist
1. `POST /school/vendors` with a real phone+address → `status: pending`.
2. That vendor signs up on Peeap with the same phone → becomes a merchant
   automatically; in the Peeap app they see a **"Charge Student"** button.
3. A synced student with a wallet + PIN presents their card.
4. Vendor enters an amount → scans the card → student enters PIN (or not, if the
   parent disabled it) → money moves student → vendor.
5. The charge appears in the parent's **Purchase History** for that child.

If step 4 fails: check the card's `peeap_wallet_id` equals `student_wallets.wallet_id`
(§2) — that's almost always the cause.
