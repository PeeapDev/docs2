# School SaaS - Wallet Top-up Integration Guide

This document explains how to integrate wallet top-up (deposit) functionality for students using Peeap's Monime USSD payment system.

## Overview

The flow is:
1. School SaaS calls Peeap API to create a deposit request
2. Peeap returns a USSD code for the user to dial
3. User dials the code on their phone and completes payment
4. School SaaS polls Peeap API to detect completion
5. When complete, show success message and update UI

---

## API Endpoints

### Base URL
```
https://api.peeap.com/api/v1
```

### 1. Create Deposit (Get USSD Code)

**Request:**
```http
POST /monime/deposit
Content-Type: application/json

{
  "walletId": "student-wallet-uuid",
  "amount": 100,
  "currency": "SLE",
  "description": "Top-up for Student Name",
  "studentName": "Ahmed Sahid",
  "schoolName": "Fransrie Junior Academy"
}
```

**Response:**
```json
{
  "ussdCode": "*715*1234567890#",
  "paymentCodeId": "pmc-k6MZ5BE8VN6QkpxHzXSLWVFH6xB",
  "monimeSessionId": "pmc-k6MZ5BE8VN6QkpxHzXSLWVFH6xB",
  "expiresAt": "2026-02-01T07:00:00Z",
  "amount": 100,
  "currency": "SLE",
  "method": "ussd"
}
```

### 2. Poll Transaction Status

**IMPORTANT:** You MUST poll this endpoint to detect when payment completes.

**Request:**
```http
GET /transactions/status?reference={paymentCodeId}
```

**Response (Pending):**
```json
{
  "status": "PENDING",
  "amount": 100,
  "currency": "SLE",
  "type": "DEPOSIT"
}
```

**Response (Completed):**
```json
{
  "status": "COMPLETED",
  "grossAmount": 100,
  "monimeFee": 2,
  "netAmount": 98,
  "currency": "SLE",
  "type": "DEPOSIT",
  "updatedAt": "2026-02-01T06:45:00Z"
}
```

**Response (Expired):**
```json
{
  "status": "EXPIRED",
  "amount": 100,
  "currency": "SLE",
  "type": "DEPOSIT"
}
```

---

## Implementation Guide

### Step 1: Create the Deposit Request

```typescript
async function initiateTopup(walletId: string, amount: number, studentName: string) {
  const response = await fetch('https://api.peeap.com/api/v1/monime/deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletId,
      amount,
      currency: 'SLE',
      studentName,
    }),
  });

  const data = await response.json();
  return {
    ussdCode: data.ussdCode,
    paymentCodeId: data.paymentCodeId,
    expiresAt: data.expiresAt,
  };
}
```

### Step 2: Display USSD Code to User

Show the USSD code in a modal/popup:

```tsx
<div className="ussd-display">
  <h3>Dial this code on your phone</h3>
  <p className="ussd-code">{ussdCode}</p>
  <button onClick={() => window.location.href = `tel:${ussdCode.replace('#', '%23')}`}>
    Dial Now
  </button>
</div>
```

### Step 3: Poll for Payment Completion

**This is the critical part.** You must poll the status endpoint every 3-5 seconds.

```typescript
interface TransactionStatus {
  status: 'PENDING' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
  grossAmount?: number;
  monimeFee?: number;
  netAmount?: number;
  currency?: string;
}

async function pollPaymentStatus(
  paymentCodeId: string,
  onComplete: (result: TransactionStatus) => void,
  onExpired: () => void,
  maxAttempts: number = 120 // 10 minutes at 5-second intervals
): Promise<void> {
  let attempts = 0;

  const poll = async () => {
    attempts++;

    try {
      const response = await fetch(
        `https://api.peeap.com/api/v1/transactions/status?reference=${paymentCodeId}`
      );
      const data: TransactionStatus = await response.json();

      console.log(`[Poll ${attempts}] Status:`, data.status);

      switch (data.status) {
        case 'COMPLETED':
          onComplete(data);
          return; // Stop polling

        case 'EXPIRED':
        case 'FAILED':
          onExpired();
          return; // Stop polling

        case 'PENDING':
        default:
          // Continue polling
          if (attempts < maxAttempts) {
            setTimeout(poll, 5000); // Poll every 5 seconds
          } else {
            onExpired(); // Timeout
          }
      }
    } catch (error) {
      console.error('Poll error:', error);
      // Continue polling on network errors
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      }
    }
  };

  poll();
}
```

### Step 4: Handle Completion

When payment completes, show success and update the UI:

```typescript
function handlePaymentComplete(result: TransactionStatus) {
  // Stop polling (already stopped)

  // Show success message with animation
  showSuccessModal({
    title: 'Payment Successful!',
    message: `${result.netAmount} ${result.currency} has been added to the wallet`,
    feeInfo: `(Fee: ${result.monimeFee} ${result.currency})`,
  });

  // Refresh wallet balance
  refreshWalletBalance();

  // Close the USSD modal
  closeUssdModal();
}
```

---

## Complete React Example

```tsx
import React, { useState, useRef, useEffect } from 'react';

interface TopupModalProps {
  walletId: string;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function TopupModal({ walletId, studentName, onClose, onSuccess }: TopupModalProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [ussdCode, setUssdCode] = useState('');
  const [paymentCodeId, setPaymentCodeId] = useState('');
  const [status, setStatus] = useState<'input' | 'pending' | 'completed' | 'expired'>('input');
  const [creditedAmount, setCreditedAmount] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setLoading(true);
    try {
      // Step 1: Create deposit
      const response = await fetch('https://api.peeap.com/api/v1/monime/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId,
          amount: parseFloat(amount),
          currency: 'SLE',
          studentName,
        }),
      });

      const data = await response.json();

      if (data.ussdCode) {
        setUssdCode(data.ussdCode);
        setPaymentCodeId(data.paymentCodeId);
        setStatus('pending');

        // Step 2: Start polling
        startPolling(data.paymentCodeId);
      } else {
        alert('Failed to generate payment code');
      }
    } catch (error) {
      alert('Error initiating payment');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (refId: string) => {
    let attempts = 0;
    const maxAttempts = 120;

    pollRef.current = setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(
          `https://api.peeap.com/api/v1/transactions/status?reference=${refId}`
        );
        const data = await response.json();

        if (data.status === 'COMPLETED') {
          clearInterval(pollRef.current!);
          setCreditedAmount(data.netAmount || parseFloat(amount));
          setStatus('completed');
          onSuccess();
        } else if (data.status === 'EXPIRED' || data.status === 'FAILED') {
          clearInterval(pollRef.current!);
          setStatus('expired');
        } else if (attempts >= maxAttempts) {
          clearInterval(pollRef.current!);
          setStatus('expired');
        }
      } catch (error) {
        // Continue polling on error
      }
    }, 3000); // Poll every 3 seconds
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {status === 'input' && (
          <>
            <h2>Top-up Wallet</h2>
            <p>Adding funds for {studentName}</p>

            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
            />

            <div className="buttons">
              <button onClick={onClose}>Cancel</button>
              <button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Generating...' : 'Generate USSD Code'}
              </button>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <h2>Complete Payment</h2>
            <p>Dial this code on your phone:</p>

            <div className="ussd-code-display">
              <code>{ussdCode}</code>
            </div>

            <button onClick={() => window.location.href = `tel:${ussdCode.replace('#', '%23')}`}>
              Dial Now
            </button>

            <p className="waiting-text">
              <span className="spinner" /> Waiting for payment...
            </p>

            <button onClick={onClose}>Cancel</button>
          </>
        )}

        {status === 'completed' && (
          <div className="success-view">
            <div className="success-icon">✓</div>
            <h2>Payment Successful!</h2>
            <p className="credited-amount">
              SLE {creditedAmount?.toFixed(2)} credited
            </p>
            <p>The wallet has been updated.</p>
            <button onClick={onClose}>Done</button>
          </div>
        )}

        {status === 'expired' && (
          <>
            <h2>Payment Expired</h2>
            <p>The payment code has expired. Please try again.</p>
            <button onClick={() => setStatus('input')}>Try Again</button>
            <button onClick={onClose}>Close</button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Fee Structure

- **Monime Fee:** 2% deducted from the deposit amount
- **Example:** User deposits 100 SLE → Wallet receives 98 SLE (2 SLE fee)

The fee is automatically calculated and deducted by Peeap. The `netAmount` in the response shows what was actually credited.

---

## Important Notes

1. **Polling is Required:** The webhook system is not 100% reliable. You MUST implement polling.

2. **Poll Interval:** 3-5 seconds is recommended. Too fast may hit rate limits.

3. **Timeout:** Stop polling after 10-15 minutes (payment codes expire in 30 minutes).

4. **Error Handling:** Continue polling on network errors. Only stop on definitive statuses.

5. **User Experience:** Show a spinner/loading state while polling. Let users know payment is being detected.

6. **Refresh Balance:** After successful payment, refresh the wallet balance from your backend.

---

## Troubleshooting

### Payment shows completed on phone but wallet not updated?

The `/transactions/status` endpoint auto-credits when it detects completion. If still not working:

1. Check the `reference` parameter matches the `paymentCodeId`
2. Call `POST /deposits/credit` with the reference to manually credit
3. Check Peeap logs for errors

### USSD code not working?

1. Ensure user is dialing the exact code including `*` and `#`
2. Check if the code has expired (30-minute validity)
3. Verify the user has sufficient mobile money balance

---

## Support

For issues contact: support@peeap.com
