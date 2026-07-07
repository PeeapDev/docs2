# NSI (National Student Identifier) - Complete API Documentation

Base URL: `https://api.peeap.com/api/v1`

External School System: `https://gov.school.edu.sl/api/peeap`

---

## Table of Contents

1. [What is NSI?](#1-what-is-nsi)
2. [NSI Format](#2-nsi-format)
3. [Database Schema](#3-database-schema)
4. [API Endpoints](#4-api-endpoints)
   - [4.1 Verify Student](#41-verify-student)
   - [4.2 Get Student Financials](#42-get-student-financials)
   - [4.3 Get Fees Breakdown](#43-get-fees-breakdown)
   - [4.4 Create Student Wallet](#44-create-student-wallet)
   - [4.5 Link Existing Peeap Account to Student](#45-link-existing-peeap-account-to-student)
   - [4.6 Get Wallet Balance by NSI](#46-get-wallet-balance-by-nsi)
   - [4.7 Top Up Student Wallet](#47-top-up-student-wallet)
   - [4.8 Pay School Fee](#48-pay-school-fee)
   - [4.9 Get Linked Children](#49-get-linked-children)
   - [4.10 Link Child to Parent](#410-link-child-to-parent)
   - [4.11 Unlink Child](#411-unlink-child)
5. [Complete Flows](#5-complete-flows)
   - [5.1 Parent Links a Child](#51-parent-links-a-child)
   - [5.2 School Creates a Student Wallet](#52-school-creates-a-student-wallet)
   - [5.3 Parent Pays School Fee](#53-parent-pays-school-fee)
   - [5.4 Student Wallet Top-up via Mobile Money](#54-student-wallet-top-up-via-mobile-money)
6. [Database Tables](#6-database-tables)
7. [Error Codes](#7-error-codes)
8. [Integration Examples](#8-integration-examples)

---

## 1. What is NSI?

**NSI (National Student Identifier)** is the primary unique identifier for students in the Sierra Leone education system. It replaces the legacy `index_number` field and serves as the canonical identifier across all Peeap student-related services.

**Key Properties:**
- Unique per student nationally
- Used to verify students against the government school system (`gov.school.edu.sl`)
- Used to look up student wallets, fee records, and parent-student links
- Both `nsi` and `index_number` fields are kept in sync via database triggers for backward compatibility

---

## 2. NSI Format

```
L######
```

A single uppercase letter followed by exactly 6 digits.

| Segment | Description                     | Example  |
|---------|---------------------------------|----------|
| `L`     | Series letter (A–Z)             | `A`      |
| `######`| 6-digit sequential number       | `123456` |

**Full example:** `A123456`

> **v1 discontinued.** The legacy v1 format (`SL-YYYY-MM-NNNNN`) is no longer
> issued or accepted. All NSI inputs are normalized to canonical v2 (`A123456`)
> at every API boundary — case, spaces and hyphens are tolerated (`a123456`,
> `A 123456`, `A-123456` all normalize to `A123456`), but any non-v2 value is
> rejected with a `400`/invalid-NSI error.

---

## 3. Database Schema

### 3.1 NSI Columns

NSI exists in three tables, all kept in sync:

| Table                  | Column         | Type         | Constraint          |
|------------------------|----------------|--------------|---------------------|
| `student_accounts`     | `nsi`          | VARCHAR(50)  | UNIQUE, INDEXED     |
| `student_accounts`     | `index_number` | VARCHAR(50)  | (legacy, synced)    |
| `student_wallets`      | `nsi`          | VARCHAR(50)  | UNIQUE, INDEXED     |
| `student_wallets`      | `index_number` | VARCHAR(50)  | (legacy, synced)    |
| `school_transactions`  | `nsi`          | VARCHAR(50)  | INDEXED (not unique) |
| `school_transactions`  | `index_number` | VARCHAR(50)  | (legacy, synced)    |
| `student_wallet_links` | `nsi`          | VARCHAR(50)  | INDEXED             |
| `student_wallet_links` | `index_number` | VARCHAR(50)  | (legacy, synced)    |

### 3.2 Sync Trigger

A PostgreSQL trigger `sync_nsi_index_number()` runs BEFORE INSERT OR UPDATE on all three tables:

```sql
-- Trigger logic:
-- 1. If nsi is set but index_number is not → copy nsi to index_number
-- 2. If index_number is set but nsi is not → copy index_number to nsi
-- 3. If both are set but differ → nsi wins (newer standard)
```

**This means:** You can write to either `nsi` or `index_number` and the other will be populated automatically. When they conflict, `nsi` takes precedence.

### 3.3 Query Pattern

All NSI lookups use an OR query to support both fields:

```sql
-- Supabase/PostgREST pattern:
.or(`nsi.eq.${identifier},index_number.eq.${identifier}`)
```

---

## 4. API Endpoints

### 4.1 Verify Student

Verifies that a student exists in the government school system. This is the first step before creating wallets or linking parents.

**Peeap Proxy Endpoint:**
```
POST /api/school/peeap/verify-student
```

**Upstream (Gov School System):**
```
POST https://gov.school.edu.sl/api/peeap/verify-student
```

#### Request

```json
{
  "nsi": "SL-2025-02-00406",
  "index_number": "SL-2025-02-00406"
}
```

| Field          | Type   | Required | Description                                    |
|----------------|--------|----------|------------------------------------------------|
| `nsi`          | string | Yes      | National Student Identifier                    |
| `index_number` | string | No       | Same value as `nsi` (sent for backward compat) |

#### Success Response (200)

```json
{
  "success": true,
  "found": true,
  "data": {
    "student_id": 1234,
    "first_name": "Ahmed",
    "last_name": "Kabba",
    "full_name": "Ahmed Sahid Alex Kabba",
    "school_id": 2,
    "school_name": "National Secondary School",
    "class_name": "Grade 10A",
    "section_name": "Science",
    "gender": "male",
    "date_of_birth": "2008-05-15",
    "admission_no": "ADM-2024-001",
    "profile_photo_url": "https://..."
  }
}
```

#### Error Responses

**Student not found (200 with found=false):**
```json
{
  "success": true,
  "found": false,
  "message": "Student not found with the provided index number."
}
```

**Server error (500):**
```json
{
  "success": false,
  "found": false,
  "message": "Failed to connect to school system: <error details>"
}
```

---

### 4.2 Get Student Financials

Retrieves a student's financial records (fees, balances, payment history) from the school system.

**Peeap Proxy Endpoint:**
```
POST /api/school/peeap/student-financials
```

**Upstream:**
```
POST https://gov.school.edu.sl/api/peeap/student-financials
```

#### Request

```json
{
  "student_id": 1234,
  "school_id": 2
}
```

| Field       | Type    | Required | Description                                        |
|-------------|---------|----------|----------------------------------------------------|
| `student_id`| integer | Yes      | Numeric student ID (from verify-student response)  |
| `school_id` | integer | Yes      | Numeric school ID                                  |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "student": {
      "id": 1234,
      "name": "Ahmed Sahid Alex Kabba",
      "class": "Grade 10A"
    },
    "fees": [
      {
        "fee_id": 32,
        "fee_type": "Tuition",
        "term": "Term 1",
        "total_amount": 7268.00,
        "paid_amount": 500.00,
        "balance": 6768.00,
        "due_date": "2025-03-15",
        "status": "partial"
      }
    ],
    "total_fees": 7268.00,
    "total_paid": 500.00,
    "total_balance": 6768.00,
    "currency": "NLE"
  }
}
```

---

### 4.3 Get Fees Breakdown

Returns a detailed fee breakdown per term/installment for term-specific payments.

**Endpoint (Frontend call via parentStudent.service.ts):**
```
GET /api/school/peeap/student-fees-breakdown?nsi={nsi}&school_id={schoolId}
```

#### Query Parameters

| Parameter   | Type    | Required | Description              |
|-------------|---------|----------|--------------------------|
| `nsi`       | string  | Yes      | Student's NSI            |
| `school_id` | integer | Yes      | Numeric school ID        |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "student": {
      "id": 1234,
      "name": "Ahmed Sahid Alex Kabba",
      "nsi": "SL-2025-02-00406",
      "class": "Grade 10A",
      "section": "Science"
    },
    "summary": {
      "total_fees": 21804.00,
      "total_paid": 500.00,
      "balance_due": 21304.00,
      "status": "partial",
      "currency": "NLE"
    },
    "installments": [
      {
        "installment_id": 101,
        "term_name": "Term 1",
        "fee_type": "Tuition",
        "amount": 7268.00,
        "paid": 500.00,
        "balance": 6768.00,
        "due_date": "2025-03-15",
        "status": "partial",
        "is_overdue": true
      },
      {
        "installment_id": 102,
        "term_name": "Term 2",
        "fee_type": "Tuition",
        "amount": 7268.00,
        "paid": 0.00,
        "balance": 7268.00,
        "due_date": "2025-06-15",
        "status": "unpaid",
        "is_overdue": false
      },
      {
        "installment_id": 103,
        "term_name": "Term 3",
        "fee_type": "Tuition",
        "amount": 7268.00,
        "paid": 0.00,
        "balance": 7268.00,
        "due_date": "2025-09-15",
        "status": "unpaid",
        "is_overdue": false
      }
    ]
  }
}
```

---

### 4.4 Create Student Wallet

Creates a brand new Peeap wallet and user account for a student directly from the school dashboard.

```
POST /api/school/wallets/create
```

#### Request

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

| Field            | Type    | Required | Description                               |
|------------------|---------|----------|-------------------------------------------|
| `nsi`            | string  | **Yes**  | National Student Identifier               |
| `student_name`   | string  | **Yes**  | Full name of the student                  |
| `school_id`      | string  | **Yes**  | School's unique ID                        |
| `pin`            | string  | **Yes**  | 4-6 digit PIN for wallet transactions     |
| `student_phone`  | string  | No       | Student's phone number                    |
| `student_email`  | string  | No       | Student's email address                   |
| `class_name`     | string  | No       | Class/grade name                          |
| `section`        | string  | No       | Section or stream                         |
| `parent_phone`   | string  | No       | Parent's phone number                     |
| `parent_email`   | string  | No       | Parent's email address                    |
| `daily_limit`    | integer | No       | Daily spending limit (default: 50000 SLE) |

#### What Happens Internally

1. Validates required fields and PIN format (4-6 digits)
2. Checks `student_wallet_links` for existing wallet with this NSI
3. Creates a `users` row with `account_type: 'student'`
4. Creates a `wallets` row with `wallet_type: 'student'`
5. Creates a `student_wallet_links` row linking NSI → user → wallet
6. If any step fails, rolls back (deletes user/wallet)

#### Success Response (201)

```json
{
  "success": true,
  "data": {
    "peeap_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "wallet_id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
    "nsi": "SL-2025-02-00406",
    "student_name": "Ahmed Sahid Alex Kabba",
    "daily_limit": 50000
  }
}
```

#### Error Responses

| Code | Body                                                                  | Cause                          |
|------|-----------------------------------------------------------------------|--------------------------------|
| 400  | `{ "success": false, "error": "Missing required fields: nsi, student_name, school_id, pin" }` | Missing required field         |
| 400  | `{ "success": false, "error": "PIN must be 4-6 digits" }`            | Invalid PIN format             |
| 409  | `{ "success": false, "error": "A wallet already exists for this student NSI", "existing_wallet_id": "..." }` | Duplicate NSI |
| 500  | `{ "success": false, "error": "Failed to create user account: ..." }` | Database error                |

---

### 4.5 Link Existing Peeap Account to Student

Links an existing Peeap user account (found by phone or email) to a student NSI. Requires the user's wallet PIN for verification.

```
POST /api/school/wallets/link
```

#### Request

```json
{
  "nsi": "SL-2025-02-00406",
  "phone_or_email": "23276123456",
  "pin": "1234",
  "school_id": "sch_900e6e7f"
}
```

| Field            | Type   | Required | Description                                     |
|------------------|--------|----------|-------------------------------------------------|
| `nsi`            | string | **Yes**  | National Student Identifier to link              |
| `phone_or_email` | string | **Yes**  | Phone number or email of existing Peeap account  |
| `pin`            | string | **Yes**  | The user's 4-digit wallet PIN                    |
| `school_id`      | string | **Yes**  | School's unique ID                               |

#### What Happens Internally

1. Finds user by phone (tries multiple formats) or email (case-insensitive)
2. Verifies the wallet PIN (checks both hashed and plain text for backward compat)
3. Gets the user's primary wallet (oldest active wallet)
4. Checks if NSI is already linked in `student_wallet_links`
5. Creates the `student_wallet_links` record

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "peeap_user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "wallet_id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
    "nsi": "SL-2025-02-00406",
    "student_name": "John Doe",
    "balance": 15000,
    "currency": "SLE"
  }
}
```

#### Error Responses

| Code | Body                                                                                    | Cause                        |
|------|-----------------------------------------------------------------------------------------|------------------------------|
| 400  | `{ "success": false, "error": "Missing required fields: nsi, phone_or_email, pin, school_id" }` | Missing required field |
| 400  | `{ "success": false, "error": "This account does not have a wallet PIN set..." }`      | No PIN on account            |
| 401  | `{ "success": false, "error": "Invalid PIN. Please check your PIN and try again." }`   | Wrong PIN                    |
| 404  | `{ "success": false, "error": "No Peeap account found with this phone or email..." }`  | User not found               |
| 404  | `{ "success": false, "error": "No wallet found for this account" }`                    | User has no wallet           |
| 409  | `{ "success": false, "error": "This NSI is already linked to a wallet" }`              | NSI already linked           |

---

### 4.6 Get Wallet Balance by NSI

Retrieves the wallet balance for a student. Accepts either an NSI or a wallet UUID as the identifier.

```
GET /api/school/wallets/{identifier}/balance
```

#### URL Parameters

| Parameter    | Type   | Description                                |
|--------------|--------|--------------------------------------------|
| `identifier` | string | NSI (e.g., `SL-2025-02-00406`) or wallet UUID |

#### What Happens Internally

1. Tries to find the identifier in `student_wallet_links` by NSI or index_number
2. If found, uses the linked `peeap_wallet_id`; otherwise treats identifier as a wallet UUID
3. Fetches wallet balance from `wallets` table
4. Calculates today's spending from `transactions` table (PURCHASE, TRANSFER, PAYMENT, FEE_PAYMENT types)
5. Returns balance with daily spending info

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "wallet_id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
    "owner_name": "Ahmed Sahid Alex Kabba",
    "owner_type": "student",
    "nsi": "SL-2025-02-00406",
    "balance": 15000.00,
    "currency": "SLE",
    "daily_limit": 50000,
    "daily_spent": 5000.00,
    "available_today": 10000.00,
    "status": "active"
  }
}
```

| Field             | Type   | Description                                                  |
|-------------------|--------|--------------------------------------------------------------|
| `wallet_id`       | string | UUID of the wallet                                           |
| `owner_name`      | string | Student's full name                                          |
| `owner_type`      | string | Always `"student"`                                           |
| `nsi`             | string | The identifier used in the request                           |
| `balance`         | number | Total wallet balance in SLE                                  |
| `currency`        | string | Currency code (always `"SLE"`)                               |
| `daily_limit`     | number | Maximum daily spend                                          |
| `daily_spent`     | number | Amount spent today                                           |
| `available_today` | number | `min(daily_limit - daily_spent, balance)` — what can be spent today |
| `status`          | string | Wallet status (`"active"`, etc.)                             |

#### Error Responses

| Code | Body | Cause |
|------|------|-------|
| 400  | `{ "success": false, "error": "Missing identifier (NSI or wallet ID)" }` | No identifier in URL |
| 404  | `{ "success": false, "error": "Wallet not found" }` | NSI/wallet ID not found |

---

### 4.7 Top Up Student Wallet

Credits a student's wallet directly (school-to-wallet transfer, refunds, etc.).

```
POST /api/school/wallets/topup
```

#### Request

```json
{
  "wallet_id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
  "amount": 5000,
  "currency": "SLE",
  "source": "school_wallet",
  "payment_method": "wallet_transfer",
  "reference": "FEE-REFUND-001",
  "initiated_by": "admin-user-uuid"
}
```

| Field            | Type   | Required | Description                                         |
|------------------|--------|----------|-----------------------------------------------------|
| `wallet_id`      | string | **Yes**  | Student's wallet ID                                 |
| `amount`         | number | **Yes**  | Amount to credit (must be > 0)                      |
| `source`         | string | **Yes**  | Source of funds (`"school_wallet"`, `"cash"`, `"bank"`) |
| `initiated_by`   | string | **Yes**  | ID of the user initiating the transfer              |
| `currency`       | string | No       | Currency code (default: `"SLE"`)                    |
| `payment_method` | string | No       | Payment method description                          |
| `reference`      | string | No       | Custom reference string                             |

#### Success Response (200)

```json
{
  "success": true,
  "data": {
    "transaction_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "wallet_id": "f0e1d2c3-b4a5-6789-0123-456789abcdef",
    "amount": 5000,
    "currency": "SLE",
    "new_balance": 20000
  }
}
```

---

### 4.8 Pay School Fee

Pays school fees from a parent's wallet. Debits the parent wallet, credits the school wallet, and notifies the school system.

**This is called from the frontend** (`parentStudent.service.ts`), not a public API endpoint.

#### Internal Function Signature

```typescript
paySchoolFee(request: SchoolFeePaymentRequest): Promise<{
  success: boolean;
  transactionId: string;
  message: string;
}>
```

#### Request Shape

```typescript
{
  parentWalletId: string;   // Parent's Peeap wallet UUID
  studentNsi: string;       // NSI e.g., "SL-2025-02-00406"
  amount: number;           // Amount in SLE (whole numbers)
  schoolId: number;         // Numeric school ID
  installmentId?: number;   // For term-specific payments (preferred)
  feeId?: number;           // Legacy fee ID
}
```

#### What Happens (7 Steps)

1. **Validate parent wallet** — check balance and active status
2. **Find school wallet** — look up `school_connections` by school_id, get or create school wallet
3. **Notify school system** — `POST gov.school.edu.sl/api/peeap/pay-fee` with:
   ```json
   {
     "student_index": "SL-2025-02-00406",
     "amount": 500,
     "transaction_id": "FEE-1738333000-ABC123",
     "payment_method": "peeap_wallet",
     "school_id": 2,
     "installment_id": 101
   }
   ```
4. **Debit parent wallet** — subtract amount from parent's balance
5. **Credit school wallet** — add amount to school's balance (refunds parent on failure)
6. **Create transaction records** — `SCHOOL_FEE` (parent debit) + `FEE_RECEIVED` (school credit)
7. **Record in student wallet transactions** — if student has a wallet, logs in `student_wallet_transactions`

#### Success Response

```json
{
  "success": true,
  "transactionId": "FEE-1738333000-ABC123",
  "message": "Payment successful! School has been notified."
}
```

---

### 4.9 Get Linked Children

Returns all children linked to a parent user.

**Frontend service call** (not a direct API route — queries Supabase directly):

```typescript
parentStudentService.getLinkedChildren(userId: string): Promise<LinkedChild[]>
```

#### Internal Query

```sql
SELECT
  psl.id, psl.relationship, psl.is_primary,
  psl.can_pay_fees, psl.can_topup_wallet, psl.can_view_transactions,
  psl.created_at, psl.student_account_id,
  sa.id, sa.nsi, sa.index_number, sa.first_name, sa.last_name,
  sa.full_name, sa.school_id, sa.school_name, sa.class_name,
  sa.section_name, sa.gender, sa.date_of_birth,
  sa.profile_photo_url, sa.username, sa.wallet_id
FROM parent_student_links psl
JOIN student_accounts sa ON sa.id = psl.student_account_id
WHERE psl.parent_user_id = {userId}
  AND psl.is_active = true
ORDER BY psl.created_at DESC
```

#### Response Shape

```json
[
  {
    "id": "link-uuid",
    "studentAccountId": "student-uuid",
    "relationship": "parent",
    "isPrimary": false,
    "canPayFees": true,
    "canTopupWallet": true,
    "canViewTransactions": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "student": {
      "id": "student-uuid",
      "nsi": "SL-2025-02-00406",
      "indexNumber": "SL-2025-02-00406",
      "firstName": "Ahmed",
      "lastName": "Kabba",
      "fullName": "Ahmed Sahid Alex Kabba",
      "schoolId": "2",
      "schoolName": "National Secondary School",
      "className": "Grade 10A",
      "sectionName": "Science",
      "gender": "male",
      "dateOfBirth": "2008-05-15",
      "profilePhotoUrl": "https://...",
      "username": "ahmed.kabba",
      "walletId": "wallet-uuid"
    }
  }
]
```

---

### 4.10 Link Child to Parent

Links a student to a parent's account using the student's NSI. Verifies the student through the government school system first.

**Frontend service call:**

```typescript
parentStudentService.linkChild(userId: string, request: LinkChildRequest): Promise<LinkedChild>
```

#### Request

```typescript
{
  nsi: string;                                           // "SL-2025-02-00406"
  relationship?: 'parent' | 'guardian' | 'sponsor' | 'other';  // default: 'parent'
}
```

#### What Happens (4 Steps)

1. **Verify student** — `POST /api/school/peeap/verify-student` with `{ nsi, index_number: nsi }`
   - If not found → throws `"Student not found. Please check the index number."`
2. **Find or create student account** — queries `student_accounts` table by `.or(nsi.eq.X, index_number.eq.X)`
   - If not found, creates:
     - A `wallets` row (`wallet_type: 'student'`, 50K daily limit, 500K monthly limit)
     - A `student_accounts` row (maps all fields from verify-student response)
     - A `username_registry` entry
3. **Check for duplicate link** — queries `parent_student_links` for existing active link
   - If found → throws `"This child is already linked to your account."`
4. **Create link** — inserts into `parent_student_links` with full permissions

#### Success Response

Returns a `LinkedChild` object (same shape as in [4.9](#49-get-linked-children)).

---

### 4.11 Unlink Child

Soft-deletes a parent-student link (sets `is_active = false`).

**Frontend service call:**

```typescript
parentStudentService.unlinkChild(userId: string, linkId: string): Promise<void>
```

---

## 5. Complete Flows

### 5.1 Parent Links a Child

```
┌──────────┐     ┌────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Parent   │     │  Peeap API │     │  gov.school.edu  │     │   Supabase   │
│  (Web/    │────>│  (router)  │────>│  /verify-student │     │   Database   │
│  Mobile)  │     │            │<────│                  │     │              │
│           │     │            │────────────────────────────>│ student_accts │
│           │     │            │────────────────────────────>│ wallets       │
│           │     │            │────────────────────────────>│ parent_links  │
│           │<────│            │     │                  │     │              │
└──────────┘     └────────────┘     └──────────────────┘     └──────────────┘

1. Parent enters NSI: "SL-2025-02-00406"
2. Peeap calls gov.school.edu.sl/api/peeap/verify-student
3. School system returns student data (name, class, school)
4. Peeap creates student_account + wallet in Supabase (if new)
5. Peeap creates parent_student_link
6. Parent sees child on dashboard
```

### 5.2 School Creates a Student Wallet

```
┌──────────┐     ┌────────────┐     ┌──────────────┐
│  School   │     │  Peeap API │     │   Supabase   │
│  Admin    │────>│  /school/  │────>│   Database   │
│           │     │  wallets/  │     │              │
│           │     │  create    │     │ - users      │
│           │     │            │     │ - wallets    │
│           │<────│            │     │ - wallet_    │
│           │     │            │     │   links      │
└──────────┘     └────────────┘     └──────────────┘

1. School admin enters NSI + student name + PIN
2. API checks for existing wallet (by NSI)
3. Creates user account (account_type: 'student')
4. Creates wallet (wallet_type: 'student', daily_limit: 50K)
5. Creates student_wallet_links record
6. Returns wallet_id for future operations
```

### 5.3 Parent Pays School Fee

```
┌──────────┐     ┌────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Parent   │     │  Peeap     │     │  gov.school.edu  │     │   Supabase   │
│  (Web)    │────>│  Service   │────>│  /pay-fee        │     │   Database   │
│           │     │            │<────│                  │     │              │
│           │     │            │────────────────────────────>│ Debit parent │
│           │     │            │────────────────────────────>│ Credit school│
│           │     │            │────────────────────────────>│ Transactions │
│           │<────│            │     │                  │     │              │
└──────────┘     └────────────┘     └──────────────────┘     └──────────────┘

1. Parent selects child (by NSI) and fee amount
2. Service checks parent wallet balance
3. Finds school wallet via school_connections
4. Notifies school system: POST /pay-fee with student_index (NSI)
5. Debits parent wallet
6. Credits school wallet (refunds parent if credit fails)
7. Creates transaction records for both sides
8. Logs in student_wallet_transactions
```

### 5.4 Student Wallet Top-up via Mobile Money

```
┌──────────┐     ┌────────────┐     ┌──────────────┐     ┌──────────┐
│  Parent/  │     │  Peeap API │     │   Monime     │     │  Supabase│
│  Student  │────>│  /monime/  │────>│  Checkout    │     │          │
│           │     │  deposit   │     │              │     │          │
│           │     │            │<────│  sessionId   │     │          │
│           │     │            │     │              │     │          │
│  Opens ──────────────────────────>│  Payment     │     │          │
│  Monime   │     │            │     │  Page        │     │          │
│  page     │     │            │     │              │     │          │
│           │     │  /status   │     │  Webhook ───────>│  Wallet  │
│  Polls ──────>│  poll      │────────────────────────>│  Balance │
│           │<────│            │     │              │     │          │
└──────────┘     └────────────┘     └──────────────┘     └──────────┘

1. POST /monime/deposit with wallet_id + amount
2. Returns paymentUrl + monimeSessionId
3. User opens paymentUrl (Monime checkout)
4. User pays via Orange Money / mobile money
5. Poll GET /transactions/status?reference={sessionId} every 4-5 seconds
6. On COMPLETED → wallet is credited
```

---

## 6. Database Tables

### 6.1 student_accounts

Core student identity table.

| Column              | Type         | Description                            |
|---------------------|--------------|----------------------------------------|
| `id`                | UUID (PK)    | Primary key                            |
| `nsi`               | VARCHAR(50)  | National Student Identifier (unique)   |
| `index_number`      | VARCHAR(50)  | Legacy identifier (synced with nsi)    |
| `school_id`         | VARCHAR      | School identifier                      |
| `school_name`       | VARCHAR      | School name                            |
| `student_id_in_school` | VARCHAR   | Student's ID within the school system  |
| `admission_number`  | VARCHAR      | Admission number                       |
| `first_name`        | VARCHAR      | First name                             |
| `last_name`         | VARCHAR      | Last name                              |
| `full_name`         | VARCHAR      | Full name                              |
| `class_name`        | VARCHAR      | Class/grade name                       |
| `section_name`      | VARCHAR      | Section or stream                      |
| `gender`            | VARCHAR      | Gender                                 |
| `date_of_birth`     | DATE         | Date of birth                          |
| `profile_photo_url` | TEXT         | Profile photo URL                      |
| `username`          | VARCHAR      | Generated username                     |
| `wallet_id`         | UUID (FK)    | Linked Peeap wallet                    |
| `status`            | VARCHAR      | `active`, `inactive`                   |

### 6.2 student_wallet_links

Links NSI to Peeap wallets (used by school wallet API).

| Column             | Type         | Description                           |
|--------------------|--------------|---------------------------------------|
| `id`               | UUID (PK)    | Primary key                           |
| `nsi`              | VARCHAR(50)  | National Student Identifier           |
| `index_number`     | VARCHAR(50)  | Legacy identifier (synced)            |
| `peeap_user_id`    | UUID (FK)    | Peeap user account                    |
| `peeap_wallet_id`  | UUID (FK)    | Peeap wallet                          |
| `school_id`        | INTEGER      | School ID (numeric)                   |
| `current_school_id`| VARCHAR      | School ID (string)                    |
| `student_name`     | VARCHAR      | Student's full name                   |
| `student_phone`    | VARCHAR      | Student's phone                       |
| `class_name`       | VARCHAR      | Class name                            |
| `section`          | VARCHAR      | Section                               |
| `daily_limit`      | INTEGER      | Daily spending limit                  |
| `is_active`        | BOOLEAN      | Whether link is active                |
| `status`           | VARCHAR      | `active`, `inactive`                  |
| `linked_at`        | TIMESTAMP    | When the link was created             |

### 6.3 parent_student_links

Links parents to student accounts.

| Column                 | Type      | Description                          |
|------------------------|-----------|--------------------------------------|
| `id`                   | UUID (PK) | Primary key                          |
| `parent_user_id`       | UUID (FK) | Parent's Peeap user ID              |
| `student_account_id`   | UUID (FK) | Student account ID                   |
| `relationship`         | VARCHAR   | `parent`, `guardian`, `sponsor`, `other` |
| `is_primary`           | BOOLEAN   | Whether this is the primary guardian |
| `can_view_fees`        | BOOLEAN   | Permission: view fee details         |
| `can_pay_fees`         | BOOLEAN   | Permission: pay fees                 |
| `can_topup_wallet`     | BOOLEAN   | Permission: top up student wallet    |
| `can_view_transactions`| BOOLEAN   | Permission: view transactions        |
| `is_active`            | BOOLEAN   | Soft delete flag                     |

---

## 7. Error Codes

### HTTP Status Codes

| Code | Meaning                                                      |
|------|--------------------------------------------------------------|
| 200  | Success                                                      |
| 201  | Created (new wallet/account)                                 |
| 400  | Bad request (missing fields, invalid PIN format)             |
| 401  | Unauthorized (invalid PIN)                                   |
| 404  | Not found (student, wallet, or Peeap account)                |
| 405  | Method not allowed (wrong HTTP method)                       |
| 409  | Conflict (wallet/NSI already exists, child already linked)   |
| 500  | Internal server error                                        |

### School System Error Codes (from gov.school.edu.sl)

| Code                    | Description                              |
|-------------------------|------------------------------------------|
| `STUDENT_NOT_FOUND`     | Student not found by NSI/index_number    |
| `FEE_NOT_FOUND`         | Fee assignment not found for student     |
| `AMOUNT_EXCEEDS_BALANCE`| Payment amount exceeds fee balance due   |
| `DUPLICATE_TRANSACTION` | Transaction ID already processed         |
| `MISSING_PARAMS`        | Required fields missing from request     |
| `SERVER_ERROR`          | Internal school system error             |

---

## 8. Integration Examples

### 8.1 JavaScript/TypeScript — Verify and Fetch Student

```typescript
const PEEAP_API = 'https://api.peeap.com/api/v1';

/**
 * Verify a student by NSI and get their data
 */
async function verifyStudent(nsi: string): Promise<StudentData | null> {
  const response = await fetch(`${PEEAP_API}/school/peeap/verify-student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nsi, index_number: nsi }),
  });

  const result = await response.json();

  if (!response.ok || !result.success || !result.found) {
    console.error('Student not found:', result.message);
    return null;
  }

  return result.data;
}

/**
 * Create a wallet for a verified student
 */
async function createStudentWallet(
  nsi: string,
  studentName: string,
  schoolId: string,
  pin: string
) {
  const response = await fetch(`${PEEAP_API}/school/wallets/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nsi,
      student_name: studentName,
      school_id: schoolId,
      pin,
    }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.data;
}

/**
 * Get wallet balance by NSI
 */
async function getStudentBalance(nsi: string) {
  const response = await fetch(
    `${PEEAP_API}/school/wallets/${encodeURIComponent(nsi)}/balance`
  );

  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.data;
}

// --- Usage ---

async function onboardStudent(nsi: string) {
  // Step 1: Verify student in school system
  const student = await verifyStudent(nsi);
  if (!student) {
    alert('Student not found. Please check the NSI.');
    return;
  }

  console.log(`Found: ${student.first_name} ${student.last_name} at ${student.school_name}`);

  // Step 2: Create wallet
  const wallet = await createStudentWallet(
    nsi,
    `${student.first_name} ${student.last_name}`,
    student.school_id.toString(),
    '0000'  // Default PIN — student should change this
  );

  console.log(`Wallet created: ${wallet.wallet_id}`);

  // Step 3: Check balance
  const balance = await getStudentBalance(nsi);
  console.log(`Balance: ${balance.balance} ${balance.currency}`);
  console.log(`Available today: ${balance.available_today} ${balance.currency}`);
}
```

### 8.2 Dart/Flutter — Mobile App Integration

```dart
import 'package:dio/dio.dart';

class SchoolApiService {
  static const String _apiBase = 'https://api.peeap.com/school/peeap';
  final Dio _dio = Dio();

  /// Verify student exists in school system by NSI
  Future<Map<String, dynamic>?> verifyStudent(String nsi) async {
    try {
      final response = await _dio.post(
        '$_apiBase/verify-student',
        data: {'nsi': nsi, 'index_number': nsi},
      );

      if (response.statusCode == 200 &&
          response.data['success'] == true &&
          response.data['found'] == true) {
        return response.data['data'];
      }
      return null;
    } catch (e) {
      print('Error verifying student: $e');
      return null;
    }
  }

  /// Get student financials (fees, balances)
  Future<Map<String, dynamic>?> getStudentFinancials(
    int studentId,
    int schoolId,
  ) async {
    try {
      final response = await _dio.post(
        '$_apiBase/student-financials',
        data: {'student_id': studentId, 'school_id': schoolId},
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        return response.data['data'];
      }
      return null;
    } catch (e) {
      print('Error fetching financials: $e');
      return null;
    }
  }

  /// Get wallet balance by NSI
  Future<Map<String, dynamic>?> getWalletBalance(String nsi) async {
    try {
      final response = await _dio.get(
        'https://api.peeap.com/api/v1/school/wallets/$nsi/balance',
      );

      if (response.statusCode == 200 && response.data['success'] == true) {
        return response.data['data'];
      }
      return null;
    } catch (e) {
      print('Error fetching balance: $e');
      return null;
    }
  }
}
```

### 8.3 School System (PHP/Laravel) — Implementing verify-student

This is what the school system (`gov.school.edu.sl`) needs to implement:

```php
<?php
// POST /api/peeap/verify-student

Route::post('/api/peeap/verify-student', function (Request $request) {
    $nsi = $request->input('nsi') ?? $request->input('index_number');

    if (!$nsi) {
        return response()->json([
            'success' => false,
            'found' => false,
            'message' => 'NSI or index_number is required',
        ], 400);
    }

    // Find student by NSI (index_number in school DB)
    $student = DB::table('sm_students')
        ->where(function ($query) use ($nsi) {
            $query->where('index_number', $nsi)
                  ->orWhere('national_id', $nsi);
        })
        ->where('active_status', 1)
        ->first();

    if (!$student) {
        return response()->json([
            'success' => true,
            'found' => false,
            'message' => 'Student not found with the provided index number.',
        ]);
    }

    return response()->json([
        'success' => true,
        'found' => true,
        'data' => [
            'student_id' => $student->id,
            'first_name' => $student->first_name,
            'last_name' => $student->last_name,
            'full_name' => $student->full_name,
            'school_id' => $student->school_id,
            'school_name' => $student->school_name ?? 'Unknown',
            'class_name' => $student->class_name ?? '',
            'section_name' => $student->section_name ?? '',
            'gender' => $student->gender ?? '',
            'date_of_birth' => $student->date_of_birth,
            'admission_no' => $student->admission_no,
            'profile_photo_url' => $student->student_photo,
        ],
    ]);
});
```

---

## Mobile App Endpoints Reference

The Flutter mobile app (`apps/mobile`) uses these endpoints via `api_endpoints.dart`:

| Dart Constant                        | Endpoint                                |
|--------------------------------------|-----------------------------------------|
| `schoolWalletsCreate`                | `POST /school/wallets/create`           |
| `schoolWalletsLink`                  | `POST /school/wallets/link`             |
| `schoolWalletsTopup`                 | `POST /school/wallets/topup`            |
| `schoolWalletsBalance(id)`           | `GET /school/wallets/{id}/balance`      |
| `schoolPeeapVerifyStudent`           | `POST /school/peeap/verify-student`     |
| `schoolPeeapStudentFinancials`       | `POST /school/peeap/student-financials` |
| `schoolPeeapPayFee`                  | `POST /school/peeap/pay-fee`           |
