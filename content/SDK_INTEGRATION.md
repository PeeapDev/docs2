# Peeap Payment SDK - Integration Guide

> ✅ **Accurate (2026-06-26)** — the `POST .../checkout/create` + `publicKey`-in-body
> model here matches the live API. For the full teaching guide (confirmation,
> idempotency, reconciliation, recipes), see the canonical integration book at
> **[`guide/`](guide/overview.mdx)**.

## Overview

The Peeap Payment SDK allows merchants to accept payments through:
- **Mobile Money** (via Monime) - Orange Money, Africell Money
- **Peeap Cards** - Closed-loop prepaid cards
- **QR Code** - Scan with Peeap mobile app

## Quick Start

### 1. Get Your API Keys

Login to your merchant dashboard at `https://my.peeap.com/merchant/developer` to get your keys:

| Key Type | Format | Usage |
|----------|--------|-------|
| Live Public Key | `pk_live_xxxxx` | Production payments (real money) |
| Test Public Key | `pk_test_xxxxx` | Sandbox testing (no real money) |
| Live Secret Key | `sk_live_xxxxx` | Server-side only (NEVER expose) |
| Test Secret Key | `sk_test_xxxxx` | Server-side testing only |

### 2. Add the SDK

```html
<script src="https://checkout.peeap.com/embed/peeap-sdk.js"></script>
```

### 3. Initialize

```javascript
PeeapSDK.init({
  publicKey: 'pk_live_YOUR_PUBLIC_KEY', // or pk_test_xxx for sandbox
  onSuccess: function(payment) {
    console.log('Payment successful!', payment.reference);
    // Redirect to success page or update UI
  },
  onError: function(error) {
    console.error('Payment failed:', error.message);
  },
  onCancel: function() {
    console.log('Payment cancelled');
  }
});
```

### 4. Create Payment

```javascript
PeeapSDK.createPayment({
  amount: 50,              // New Leone (SLE): 50 = Le 50.00
  currency: 'SLE',         // Currency code
  description: 'Order #12345',
  reference: 'your-order-id'  // Optional: your reference
});
```

---

## Live Mode vs Sandbox Mode

### Live Mode (`pk_live_xxx`)
- Real payments processed
- Real money charged
- **All payment methods available:**
  - ✅ Mobile Money (Monime)
  - ✅ Peeap Card
  - ✅ QR Code

### Sandbox Mode (`pk_test_xxx`)
- Test payments only
- No real money charged
- **Limited payment methods:**
  - ❌ Mobile Money (DISABLED - shows "Live Only" badge)
  - ✅ Peeap Card (test cards)
  - ✅ QR Code (simulated)

---

## Complete Integration Examples

### HTML/JavaScript (Recommended)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Checkout</title>
</head>
<body>
  <div id="checkout">
    <h2>Complete Your Purchase</h2>
    <p>Total: Le 50.00</p>
    <button id="payButton">Pay Now</button>
  </div>

  <script src="https://checkout.peeap.com/embed/peeap-sdk.js"></script>
  <script>
    // Initialize SDK
    PeeapSDK.init({
      publicKey: 'pk_live_YOUR_PUBLIC_KEY',
      onSuccess: function(payment) {
        alert('Payment successful! Reference: ' + payment.reference);
        window.location.href = '/order-complete?ref=' + payment.reference;
      },
      onError: function(error) {
        alert('Payment failed: ' + error.message);
      }
    });

    // Handle payment button click
    document.getElementById('payButton').addEventListener('click', function() {
      PeeapSDK.createPayment({
        amount: 50,  // New Leone (SLE)
        currency: 'SLE',
        description: 'Order #12345'
      });
    });
  </script>
</body>
</html>
```

### React/Next.js

```jsx
import { useEffect } from 'react';

export default function CheckoutPage({ order }) {
  useEffect(() => {
    // Load SDK
    const script = document.createElement('script');
    script.src = 'https://checkout.peeap.com/embed/peeap-sdk.js';
    script.onload = () => {
      window.PeeapSDK.init({
        publicKey: process.env.NEXT_PUBLIC_PEEAP_KEY,
        onSuccess: (payment) => {
          console.log('Payment success:', payment);
          router.push(`/order-complete?ref=${payment.reference}`);
        },
        onError: (error) => {
          console.error('Payment error:', error);
          setError(error.message);
        }
      });
    };
    document.body.appendChild(script);

    return () => document.body.removeChild(script);
  }, []);

  const handlePay = () => {
    window.PeeapSDK.createPayment({
      amount: order.total,
      currency: 'SLE',
      description: `Order #${order.id}`,
      reference: order.id,
      metadata: {
        orderId: order.id,
        customerId: order.customerId
      }
    });
  };

  return (
    <div>
      <h1>Order #{order.id}</h1>
      <p>Total: Le {order.total.toLocaleString()}</p>
      <button onClick={handlePay}>Pay with Peeap</button>
    </div>
  );
}
```

### Node.js/Express (Server-side)

```javascript
const express = require('express');
const app = express();

app.post('/api/create-checkout', async (req, res) => {
  const { amount, orderId } = req.body;

  try {
    const response = await fetch('https://api.peeap.com/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: process.env.PEEAP_PUBLIC_KEY,
        amount: amount,
        currency: 'SLE',
        description: `Order #${orderId}`,
        reference: orderId,
        redirectUrl: `https://yoursite.com/order-complete/${orderId}`
      })
    });

    const data = await response.json();
    res.json({ paymentUrl: data.paymentUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Python/Flask

```python
import requests
from flask import Flask, request, jsonify, redirect

app = Flask(__name__)
PEEAP_PUBLIC_KEY = 'pk_live_YOUR_PUBLIC_KEY'

@app.route('/pay/<order_id>')
def create_payment(order_id):
    order = get_order(order_id)  # Your function to get order

    response = requests.post('https://api.peeap.com/checkout/create',
        json={
            'publicKey': PEEAP_PUBLIC_KEY,
            'amount': order.total,
            'currency': 'SLE',
            'description': f'Order #{order_id}',
            'reference': order_id,
            'redirectUrl': f'https://yoursite.com/order-complete/{order_id}'
        }
    )

    data = response.json()
    if data.get('paymentUrl'):
        return redirect(data['paymentUrl'])
    return jsonify({'error': 'Failed to create payment'}), 500
```

### PHP

```php
<?php
function createPeeapCheckout($orderId, $amount) {
    $data = [
        'publicKey' => 'pk_live_YOUR_PUBLIC_KEY',
        'amount' => $amount,
        'currency' => 'SLE',
        'description' => "Order #$orderId",
        'reference' => $orderId,
        'redirectUrl' => "https://yoursite.com/order-complete/$orderId"
    ];

    $ch = curl_init('https://api.peeap.com/checkout/create');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true
    ]);

    $response = json_decode(curl_exec($ch), true);
    curl_close($ch);

    if (isset($response['paymentUrl'])) {
        header('Location: ' . $response['paymentUrl']);
        exit;
    }

    throw new Exception($response['error'] ?? 'Payment failed');
}

// Usage - New Leone (SLE): 50 = Le 50.00
createPeeapCheckout($_GET['order_id'], 50);
?>
```

---

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://api.peeap.com/checkout/create` | POST | Create checkout session |
| `https://checkout.peeap.com/checkout/pay/{sessionId}` | GET | Hosted checkout page |

### Create Checkout Request

```json
{
  "publicKey": "pk_live_xxxxx",
  "amount": 50,
  "currency": "SLE",
  "description": "Order #12345",
  "reference": "your-order-id",
  "redirectUrl": "https://yoursite.com/complete",
  "metadata": {
    "orderId": "12345",
    "customerId": "cust_123"
  }
}
```

> **Note:** Amount is in New Leone (SLE). Example: `50` = Le 50.00

### Create Checkout Response

```json
{
  "sessionId": "cs_live_abc123def456",
  "paymentUrl": "https://checkout.peeap.com/checkout/pay/cs_live_abc123def456",
  "amount": 50,
  "currency": "SLE",
  "expiresAt": "2025-01-20T15:30:00Z",
  "isTestMode": false
}
```

---

## Webhooks (Optional)

Receive payment notifications on your server:

```javascript
// Node.js/Express
app.post('/webhooks/peeap', (req, res) => {
  const { event, data } = req.body;

  switch (event) {
    case 'payment.completed':
      // Update order status
      updateOrder(data.reference, 'paid');
      break;
    case 'payment.failed':
      // Handle failure
      updateOrder(data.reference, 'failed');
      break;
  }

  res.json({ received: true });
});
```

---

## Testing in Sandbox

1. Use `pk_test_xxx` key instead of `pk_live_xxx`
2. Mobile Money will be disabled (grayed out)
3. Use test card numbers for Peeap Card testing
4. No real money is charged

### Test Cards

| Card Number | Result |
|-------------|--------|
| 6200 1234 5678 9012 | Success |
| 6200 0000 0000 0000 | Decline |

---

## Support

- Dashboard: https://my.peeap.com/merchant
- Documentation: https://docs.peeap.com
- Email: support@peeap.com
