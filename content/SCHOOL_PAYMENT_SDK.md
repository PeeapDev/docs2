# School payments — Peeap Pay SDK integration

> 📌 **Cross-check before integrating.** This SDK doc describes the browser
> drop-in. For the underlying server flow, routing, confirmation, and the
> (working) school webhooks, the canonical source is the integration book at
> **[`guide/`](guide/overview.mdx)** — start with `guide/recipe-school-fees.mdx`.
> Confirm any endpoint paths here against that book, which is reconciled to the
> live handler code.

The SaaS does **not** need to build its own popup, postMessage handler, or
callback wiring. Peeap ships a ready-made browser SDK that handles all of
it. The SaaS just embeds it and calls `createPayment(...)`.

This replaces the earlier plan to call `/api/school/wallets/test-payment`
from the SaaS button. (`/api/school/wallets/credit` still exists as a
server-to-server deposit path — use it only when funds were already
collected out-of-band, like a cash drop. For user-authorized payments,
always use the SDK.)

---

## 1. Embed the SDK

Drop this on every page in the school admin where you want to open a
payment popup (typically the settings panel and any fee-collection page):

```html
<script src="https://checkout.peeap.com/embed/peeap-sdk.js"></script>
```

## 2. Initialize once per page load

```html
<script>
  PeeapSDK.init({
    publicKey: 'pk_live_0972143cf609c99f36950bbb0fa5a1aa99501d890ac1bc2d',
    mode: 'live',
    currency: 'SLE',
    onSuccess: function (payment) {
      // Fires after the user completes the payment in the popup.
      // Persist payment.reference / payment.paymentId on your side.
      console.log('Paid!', payment);
    },
    onError: function (error) {
      console.error('Payment error', error);
    },
    onCancel: function () {
      console.log('User closed the popup');
    },
  });
</script>
```

The `pk_live_…` key above is the public key of the **Gov School
Education SL** platform merchant. It's safe to expose in the browser
(that's what public keys are for). All school SaaS instances share this
same key — per-school routing happens via metadata in step 3.

## 3. Open the popup for a payment

```js
PeeapSDK.createPayment({
  amount: 1,                  // in SLE (whole units, integer)
  currency: 'SLE',
  description: 'Post-pair test from SDSL',

  // Optional payer info — surfaces as "Received from <payer_name>"
  // in the school's mini-app transaction list.
  customer: {
    email: 'parent@example.com',
    phone: '+23278123456',
  },

  // THIS IS THE IMPORTANT BIT: route the payment to a specific school's
  // Peeap wallet. The slug = the school's subdomain (`dada` for
  // dada.gov.school.edu.sl, `sdsl_1` for the apex school 1).
  metadata: {
    school_subdomain: 'sdsl_1',
    payer_name: 'Mariama Bangura',
    invoice_id: 'INV-2026-04-0042',
    fee_type: 'tuition',
  },
});
```

That's the whole call. The SDK:

1. Hits `POST https://api.peeap.com/api/checkout/create` with the public
   key.
2. Gets back a `paymentUrl`.
3. Opens it as a 420×700 popup centered on screen.
4. Listens for the popup's success/cancel message via `postMessage`.
5. Fires your `onSuccess` / `onError` / `onCancel` callbacks.

The user authorizes the payment from inside the popup (Peeap wallet /
Orange Money / Africell / card). When the popup closes, money has
already landed in the school's Peeap wallet via the existing
payment-completion handler — it reads `metadata.school_subdomain` and
credits the matching `school_connections.wallet_id`.

## 4. End-to-end example for the SDSL test button

```html
<button id="peeap-test-pay">Send 1 SLE test payment</button>

<script src="https://checkout.peeap.com/embed/peeap-sdk.js"></script>
<script>
  PeeapSDK.init({
    publicKey: 'pk_live_0972143cf609c99f36950bbb0fa5a1aa99501d890ac1bc2d',
    onSuccess: function (payment) {
      // Update the SaaS UI / DB
      fetch('/desktop-api/peeap/test-payment/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: payment.reference,
          paymentId: payment.paymentId,
        }),
      });
      alert('Test payment succeeded. Check the school wallet in Peeap.');
    },
    onError: function (e) { alert('Payment failed: ' + e.message); },
    onCancel: function () { /* user closed the popup, no action needed */ },
  });

  document.getElementById('peeap-test-pay').addEventListener('click', function () {
    PeeapSDK.createPayment({
      amount: 1,
      currency: 'SLE',
      description: 'Post-pair test from SDSL',
      metadata: {
        // For school 1 (the apex tenant), use the apex slug here.
        // For tenants on dada.gov.school.edu.sl, use 'dada'. Etc.
        school_subdomain: window.PEEAP_SCHOOL_SUBDOMAIN || 'sdsl_1',
      },
    });
  });
</script>
```

`window.PEEAP_SCHOOL_SUBDOMAIN` is whatever the SaaS injects from the
current tenant — same value as the leftmost label of the current
domain (`dada.gov.school.edu.sl` → `dada`).

## 5. Where the money lands

After a successful popup payment for `school_subdomain: 'sdsl_1'`:

| Table | Row | What changes |
|---|---|---|
| `wallets` | the row with `external_id='SCH-sdsl_1'` | `balance` increments by `amount` |
| `transactions` | new row with `wallet_id` = the school wallet | `type='PAYMENT_RECEIVED'`, `metadata.payer_name`/`payer_phone`/`invoice_id`/`fee_type` populated from the SDK call |
| (school mini-app) | "Recent Activity" | shows "Received from Mariama Bangura" live (Realtime subscription) |

## 6. Auth keys

| Key | Where it goes | Used for |
|---|---|---|
| `pk_live_0972143cf609c99f36950bbb0fa5a1aa99501d890ac1bc2d` | SaaS frontend (this doc) | SDK init — safe to expose |
| `sk_live_…` | Only if the SaaS needs to call `/api/checkout/create` directly from its backend | Server-side. **Don't ship this in the browser bundle.** |
| `X-Client-ID` / `X-Client-Secret` (the `school_saas` pair) | SaaS backend | Calls to `/api/school/connection/*` and `/api/school/wallets/credit` |

If the SaaS backend needs the `sk_live_…`, ask the Peeap team for it
through a private channel — don't paste it in chat / git.

## 7. Things you do NOT need to do

- ❌ Build your own popup, postMessage handler, or window manager — SDK handles it.
- ❌ Call `/api/school/wallets/test-payment` for user-authorized flows — it's an S2S deposit path, not a popup creator.
- ❌ Track payment state on your side via polling — use the `onSuccess` callback.
- ❌ Deal with `redirect`/`return_url` plumbing — the SDK manages the round-trip.

## 8. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `SDK not initialized` | `PeeapSDK.init()` wasn't called before `createPayment(...)`. |
| Popup blocked by browser | `createPayment` must be invoked from a *direct user gesture* (click handler). Don't call it from a `setTimeout` or async-resolved promise. |
| `Invalid public key or business not active` | Wrong `publicKey`. Use the platform `pk_live_…` above, not a different merchant's key. |
| Money lands but not on the right school | `metadata.school_subdomain` was missing or wrong. Pass it on every call. |
| Popup opens but money doesn't show in Peeap | Check `school_connections` for the matching `peeap_school_id` — if there's no active row, the routing falls back to the platform merchant's wallet. |
