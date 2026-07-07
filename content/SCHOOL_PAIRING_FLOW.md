# School ↔ Peeap Pairing Flow — Step 1 / 2 / 3

This is the contract the SaaS uses to pair a school user (superadmin, staff,
parent, student) with their existing Peeap account.

All three calls are **server-to-server from the SaaS to Peeap**. The user does
not see Peeap during this flow — they stay in the SaaS UI, except they
*read* the OTP from inside the Peeap app's in-app inbox.

## Auth

All three endpoints are S2S. Send these headers on every request:

```
X-Client-ID: school_saas
X-Client-Secret: <your PEEAP_CLIENT_SECRET>
Content-Type: application/json
```

Base URL: `https://api.peeap.com`

---

## Step 0 — Register the school (one-time, at school creation)

**This must run once when the SaaS creates the school, well before any user
tries to pair.** Without this, every `send-otp` call returns
`404 School not found`, which is why the OTP notifications were never
arriving in the Peeap app.

```
POST /api/school/register
```

Body:

```json
{
  "school_id": "sdsl_1",
  "school_name": "School District Sierra Leone",
  "subdomain": "sdsl_1",
  "domain": "sdsl_1.gov.school.edu.sl",
  "admin_email": "dev@school.edu.sl",
  "admin_name": "Superadmin Name",
  "currency": "SLE",
  "link_admin": true
}
```

| Field | Required | Notes |
|---|---|---|
| `school_id` | yes | Your SaaS's own tenant ID. `school_saas_id` is also accepted as an alias for back-compat. |
| `school_name` | yes | Display name. |
| `subdomain` *or* `domain` | recommended | If you only send `school_id`, Peeap stores `peeap_school_id` as `saas_<school_id>`. If you also send a subdomain (e.g. `sdsl_1`) or a real domain like `sdsl_1.gov.school.edu.sl`, Peeap stores the bare subdomain as the `peeap_school_id`, which is nicer. |
| `admin_email` | **yes for connect-school OTP** | The superadmin email. Stored as `connected_by_email`. Without this, Step 2 with `purpose: "connect-school"` will 403 ("Only the superadmin email can connect the school"). |
| `link_admin` | yes if backfilling | Setting this on a retry lets Peeap fill in `connected_by_user_id` / `connected_by_email` for a row that was created without them. |

Response:

```json
{
  "success": true,
  "data": {
    "peeap_school_id": "sdsl_1",
    "school_saas_id": "sdsl_1",
    "school_name": "School District Sierra Leone",
    "school_domain": "sdsl_1.gov.school.edu.sl",
    "status": "active",
    "connected_at": "2026-05-28T20:00:00.000Z"
  }
}
```

The call is idempotent. Safe to call again on every SaaS boot/school edit;
Peeap will find the existing row and only update missing fields.

> **Heads-up on placeholder rows:** earlier today the register handler had
> a fallback that bucketed any S2S request lacking a usable identifier
> under a single placeholder `peeap_school_id: "sch_s2s"`. That fallback
> is gone — invalid payloads now return 400 instead of silently corrupting
> the table. Any existing `sch_s2s` row is automatically re-keyed to the
> real `school_id` the next time `/school/register` is called with the
> correct payload.

---

## Step 1 — Verify Email (does the user have a Peeap account?)

**You were calling `/api/school/connection/verify-email`. That endpoint is a
*domain* check (does the email's domain belong to a registered school) and
will return `verified: false` for accounts like `dev@school.edu.sl` even
when the user exists in Peeap. Switch to the endpoint below.**

```
GET /api/school/connection/check-account?email=<url-encoded-email>
```

Response — found:

```json
{
  "success": true,
  "hasAccount": true,
  "peeapUserId": "eb975af4-29ea-4deb-ab1a-538826d9af7b"
}
```

Response — not found:

```json
{ "success": true, "hasAccount": false }
```

**Cache the `peeapUserId`** — Step 2 and Step 3 both need it.

If `hasAccount: false`, tell the user to create their Peeap account first
(`https://my.peeap.com/register`) using the same email as their SaaS account,
then come back to this Connect screen.

---

## Step 2 — Send OTP (Peeap pushes a 6-digit code to the user's in-app inbox)

```
POST /api/school/connection/send-otp
```

Body:

```json
{
  "schoolId": "<your school_id>",
  "peeapUserId": "<uuid from Step 1>",
  "purpose": "connect-staff"
}
```

`purpose` values:

| Value | Use when |
|---|---|
| `connect-school` | The superadmin is linking the school itself for the first time (must match `connected_by_email` on the school's Peeap connection) |
| `connect-staff` | A staff member / teacher is pairing |
| `connect-parent` | A parent is pairing |
| `connect-student` | A student is pairing |

Response:

```json
{ "success": true, "message": "OTP sent to Peeap inbox.", "expiresIn": 300 }
```

> ⚠️ The OTP code is **not** returned in the HTTP response. The user reads it
> from a notification inside the Peeap app and types it back into your UI.
> If you previously had logic that picked `otpCode` off the response, remove
> it — that field is gone.

Limits: max 3 active OTPs per (user, school, purpose). Codes expire in 5 minutes.

---

## Step 3 — Verify OTP

```
POST /api/school/connection/verify-otp
```

Body:

```json
{
  "schoolId": "<your school_id>",
  "peeapUserId": "<uuid from Step 1>",
  "otpCode": "123456",
  "purpose": "connect-staff",
  "role": "staff"
}
```

`role` is whatever your SaaS already knows about the user (`staff`, `teacher`,
`parent`, `student`, `admin`). Peeap stores it on the user as
`school_verified_role` and uses it for permission checks downstream.

Response:

```json
{ "success": true }
```

After this, the user is marked `school_verified_by: <peeap_school_id>` on the
Peeap side and the pairing is complete. Update your local
`peeap_user_id` / `peeap_paired_at` columns and flip the UI to "Connected".

---

## Step 3.5 — Depositing funds into the school's Peeap wallet

This is the production "money lands in the school's Peeap wallet" endpoint.
Every time the SaaS collects a payment (parent fee, vendor settlement, the
1-SLE post-pair confidence check, etc.) it calls this. **Not** a test-only
sandbox — same path for every real deposit.

```
POST /api/school/wallets/credit
POST /api/school/wallets/test-payment   (alias — same handler, kept for back-compat with SaaS code that already calls this URL)
```

Body:

```json
{
  "schoolId": "sdsl_1",
  "amount": 1,
  "currency": "SLE",
  "note": "Post-pair test from SDSL",
  "reference": "saas-tx-9182734",
  "payerName": "Mariama Bangura",
  "payerPhone": "+23278123456",
  "invoiceId": "INV-2026-04-0042",
  "feeType": "tuition"
}
```

| Field | Required | Notes |
|---|---|---|
| `schoolId` | yes | The SaaS's own tenant ID. |
| `amount` | yes | Positive number. Peeap credits this to `school_connections.wallet_id`. |
| `currency` | yes | Must match the wallet's currency (mismatched returns 400). |
| `note` / `description` | recommended | Shows up as the transaction's description in the school mini-app. |
| `reference` | **strongly recommended** | Your SaaS-side transaction ID. Used for idempotency — retrying the same `reference` returns the original credit, no double-spend. |
| `payerName`, `payerPhone`, `invoiceId`, `feeType` | optional | Stored on `transactions.metadata` for audit and analytics. |

Response:

```json
{
  "success": true,
  "transactionId": "uuid",
  "walletId": "uuid",
  "reference": "saas-tx-9182734",
  "status": "completed",
  "balance": 12345,
  "createdAt": "2026-05-29T00:12:34.567Z"
}
```

Idempotent retry response (same `reference`):

```json
{
  "success": true,
  "idempotent": true,
  "transactionId": "uuid",  // same as the first call
  ...
}
```

Peeap-side effect: `wallets.balance` increments and a `transactions` row is
written with `type='DEPOSIT'`, `status='COMPLETED'`, `metadata.source='school_saas'`.
The mini-app's Recent Activity surfaces it immediately (or live if Supabase
Realtime is on).

---

## Step 4a (optional) — Disconnect a single staff member / parent / student

When the SaaS removes one user's Peeap link from their portal — without
touching the school-level connection — call this. Example: a teacher
quits, or a parent revokes their pairing.

```
POST /api/school/connection/disconnect-staff
```

Body (provide at least one identifier alongside `schoolId`):

```json
{ "schoolId": "sdsl_1", "peeapUserId": "eb975af4-…" }
```

Alternatives that also work:

```json
{ "schoolId": "sdsl_1", "saasUserId": "teacher_42" }
{ "schoolId": "sdsl_1", "email": "teacher@example.com" }
```

Response:

```json
{ "success": true, "disconnected": 1, "matched": 1, "schoolId": "sdsl_1" }
```

Or, if there was nothing active to disconnect (idempotent retry, wrong
identifier, etc.):

```json
{ "success": true, "alreadyDisconnected": true,
  "message": "No active mapping found for this user on this school." }
```

What happens on Peeap:

- `school_user_mappings.status` flips to `disconnected` for every row
  matching (school, identifier). The Peeap user account itself stays
  intact and continues to work for other schools they're paired with.
- All pending OTPs for that user on that school are invalidated.
- The school-level connection is **not** touched.

> ⚠️ This is the right endpoint for "remove just this person." The
> school-level `/disconnect` below disconnects the ENTIRE school — don't
> reach for that to remove a single staff member.

---

## Step 4b (optional) — Disconnect the entire school

When a school admin removes the Peeap link from your portal, call:

```
POST /api/school/connection/disconnect
```

Body:

```json
{ "schoolId": "sdsl_1" }
```

Response:

```json
{ "success": true, "schoolId": "sdsl_1" }
```

(`{ "success": true, "alreadyDisconnected": true }` if it was already off.)

What happens on Peeap:

- `school_connections.status` flips to `disconnected` so `/school/status` and
  `send-otp` will stop responding for this school until you reconnect.
- All unused OTPs for the school are invalidated so a stale code can't be
  used to silently re-pair.
- The wallet, balances, mappings, and audit history are **kept** — this is
  a soft disconnect, not a delete. The school's funds are not at risk.

**Reconnecting:** just call `POST /api/school/register` again with the same
`school_id`. Peeap finds the disconnected row and flips it back to `active`,
preserving everything.

---

## Error responses (all steps)

| HTTP | `error` | Meaning |
|---|---|---|
| 401 | `unauthorized` | Missing or wrong `X-Client-ID` / `X-Client-Secret` |
| 400 | `schoolId, peeapUserId, purpose required` (etc.) | Missing body field |
| 403 | `Only the superadmin email can connect the school` | `purpose: connect-school` but the user's email doesn't match `connected_by_email` |
| 404 | `School not found` | `schoolId` doesn't map to an active row in `school_connections` |
| 404 | `User not found` | `peeapUserId` doesn't exist |
| 429 | `Too many active codes. Wait for expiry.` | 3 unused OTPs already outstanding for this (user, school, purpose) |
| 400 | `Invalid or expired OTP` / `OTP expired` / `Too many failed attempts` | Self-explanatory; show the user "wrong code, try again" |

---

## Summary of the change you need to ship

1. Step 1 button → switch URL from `verify-email` to `check-account`.
2. Step 2 button → remove any code that reads `otpCode` off the response; it's no longer returned.
3. Steps 2 and 3 → ensure `X-Client-ID` and `X-Client-Secret` headers are set (Step 1 doesn't require them today, but it's harmless to send them, and we may require them on Step 1 soon).
