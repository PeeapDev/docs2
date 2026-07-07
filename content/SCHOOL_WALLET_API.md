# School Wallet API Documentation

Base URL: `https://api.peeap.com/api/v1`

## 1. Create Student Wallet

Creates a new Peeap wallet for a student using their NSI (National Student Identifier).

```
POST /school/wallets/create
```

**Request Body:**
```json
{
  "nsi": "SL-2025-02-00406",
  "student_name": "Ahmed Sahid Alex Kabba",
  "school_id": "sch_900e6e7f",
  "pin": "0000",
  "student_phone": "08089",
  "student_email": "student@example.com",
  "class_name": "Grade 10A",
  "section": "Science",
  "parent_phone": "23276123456",
  "parent_email": "parent@example.com",
  "daily_limit": 50000
}
```

**Required Fields:**
- `nsi` - National Student Identifier
- `student_name` - Full name of the student
- `school_id` - Your school's unique ID
- `pin` - 4-6 digit PIN for wallet transactions

**Optional Fields:**
- `student_phone` - Student's phone number
- `student_email` - Student's email
- `class_name` - Class/Grade name
- `section` - Section or stream
- `parent_phone` - Parent's phone number
- `parent_email` - Parent's email
- `daily_limit` - Daily spending limit (default: 50000 SLE)

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "peeap_user_id": "uuid-here",
    "wallet_id": "uuid-here",
    "nsi": "SL-2025-02-00406",
    "student_name": "Ahmed Sahid Alex Kabba",
    "daily_limit": 50000
  }
}
```

**Error Responses:**
- `400` - Missing required fields or invalid PIN format
- `409` - Wallet already exists for this NSI
- `500` - Server error

---

## 2. Link Existing Peeap Account to Student

Links an existing Peeap account (by phone/email) to a student NSI.

```
POST /school/wallets/link
```

**Request Body:**
```json
{
  "nsi": "SL-2025-02-00406",
  "phone_or_email": "23276123456",
  "pin": "1234",
  "school_id": "sch_900e6e7f"
}
```

**Required Fields:**
- `nsi` - National Student Identifier to link
- `phone_or_email` - Phone number or email of existing Peeap account
- `pin` - The user's 4-digit wallet PIN
- `school_id` - Your school's unique ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "peeap_user_id": "uuid-here",
    "wallet_id": "uuid-here",
    "nsi": "SL-2025-02-00406",
    "student_name": "John Doe",
    "balance": 15000,
    "currency": "SLE"
  }
}
```

**Error Responses:**
- `400` - Missing required fields or no PIN set on account
- `401` - Invalid PIN
- `404` - No Peeap account found with this phone/email
- `409` - NSI already linked to a wallet

---

## 3. Top Up Student Wallet (Monime Mobile Money)

Initiates a mobile money deposit to a student's wallet.

```
POST /monime/deposit
```

**Request Body:**
```json
{
  "walletId": "wallet-uuid-here",
  "amount": 5000,
  "currency": "SLE",
  "description": "Top-up for Ahmed Sahid"
}
```

**Required Fields:**
- `walletId` - The student's wallet ID (from create/link response)
- `amount` - Amount in SLE (whole numbers)

**Optional Fields:**
- `currency` - Currency code (default: "SLE")
- `description` - Description for the transaction

**Success Response (200):**
```json
{
  "paymentUrl": "https://checkout.monime.io/session/xxx",
  "monimeSessionId": "cs_xxx",
  "expiresAt": "2025-01-31T15:30:00Z",
  "amount": 5000,
  "currency": "SLE"
}
```

**Usage:**
1. Open `paymentUrl` in a new browser tab/window
2. User completes payment on Monime checkout page
3. Poll `/transactions/status?reference={monimeSessionId}` to check completion
4. Wallet balance is credited automatically when payment completes

---

## 4. Check Transaction Status

Poll this endpoint to check if a deposit has completed.

```
GET /transactions/status?reference={monimeSessionId}
```

**Query Parameters:**
- `reference` - The Monime session ID from the deposit response

**Response (200):**
```json
{
  "status": "COMPLETED",
  "amount": 5000,
  "currency": "SLE",
  "type": "DEPOSIT",
  "updatedAt": "2025-01-31T15:25:00Z"
}
```

**Status Values:**
- `PENDING` - Payment not yet confirmed
- `COMPLETED` - Payment successful, wallet credited
- `FAILED` - Payment failed
- `EXPIRED` - Payment session expired

---

## 5. Get Student Wallet Balance

Get the current balance of a student's wallet.

```
GET /school/wallets/{walletId}/balance
```

**URL Parameters:**
- `walletId` - The student's wallet ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "wallet_id": "uuid-here",
    "balance": 15000,
    "available_balance": 15000,
    "currency": "SLE",
    "status": "ACTIVE"
  }
}
```

---

## 6. Direct Wallet Top-up (School-to-Wallet Transfer)

For schools that want to directly credit student wallets from their own Peeap wallet.

```
POST /school/wallets/topup
```

**Request Body:**
```json
{
  "wallet_id": "student-wallet-uuid",
  "amount": 5000,
  "currency": "SLE",
  "source": "school_wallet",
  "payment_method": "wallet_transfer",
  "reference": "FEE-REFUND-001",
  "initiated_by": "school-admin-uuid"
}
```

**Required Fields:**
- `wallet_id` - Student's wallet ID
- `amount` - Amount to credit
- `source` - Source of funds (e.g., "school_wallet", "cash", "bank")
- `initiated_by` - ID of the user initiating the transfer

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction_id": "uuid-here",
    "wallet_id": "uuid-here",
    "amount": 5000,
    "new_balance": 20000,
    "currency": "SLE"
  }
}
```

---

## Example Integration (JavaScript/TypeScript)

```typescript
const PEEAP_API = 'https://api.peeap.com/api/v1';

// Create wallet for new student
async function createStudentWallet(student: {
  nsi: string;
  name: string;
  schoolId: string;
  pin: string;
  phone?: string;
}) {
  const response = await fetch(`${PEEAP_API}/school/wallets/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nsi: student.nsi,
      student_name: student.name,
      school_id: student.schoolId,
      pin: student.pin,
      student_phone: student.phone,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.data;
}

// Initiate mobile money top-up
async function initiateTopup(walletId: string, amount: number) {
  const response = await fetch(`${PEEAP_API}/monime/deposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletId,
      amount,
      currency: 'SLE',
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error);

  // Open payment page
  window.open(data.paymentUrl, '_blank');

  // Return session ID for status polling
  return data.monimeSessionId;
}

// Poll for payment completion
async function pollPaymentStatus(sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${PEEAP_API}/transactions/status?reference=${sessionId}`
        );
        const data = await response.json();

        if (data.status === 'COMPLETED') {
          clearInterval(interval);
          resolve('completed');
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          clearInterval(interval);
          reject(new Error(data.status));
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 4000); // Poll every 4 seconds

    // Timeout after 10 minutes
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('timeout'));
    }, 10 * 60 * 1000);
  });
}

// Usage example
async function topUpStudentWallet(walletId: string, amount: number) {
  try {
    const sessionId = await initiateTopup(walletId, amount);
    console.log('Payment page opened. Waiting for completion...');

    await pollPaymentStatus(sessionId);
    console.log('Payment completed! Wallet credited.');

  } catch (error) {
    console.error('Top-up failed:', error);
  }
}
```

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Missing required fields | Request body is missing required parameters |
| 401 | Invalid PIN | The PIN provided doesn't match the account |
| 404 | Wallet not found | The wallet ID doesn't exist |
| 404 | No Peeap account found | No account with the given phone/email |
| 409 | Wallet already exists | A wallet already exists for this NSI |
| 500 | Server error | Internal server error |

---

## Webhooks (Coming Soon)

Configure webhooks to receive real-time notifications for:
- Wallet deposits completed
- Wallet withdrawals
- Transaction status changes

Contact support@peeap.com to set up webhooks for your school.
