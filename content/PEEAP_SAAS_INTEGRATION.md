# Peeap Payment Integration for School SaaS

Complete technical documentation for integrating Peeap Pay into your Laravel School Management System.

---

## Table of Contents

1. [Overview](#1-overview)
2. [SSO/OAuth Integration](#2-ssooauth-integration)
3. [School Shared Wallet](#3-school-shared-wallet)
4. [Payment SDK Integration](#4-payment-sdk-integration)
5. [Webhook Handlers](#5-webhook-handlers)
6. [Chat/Messaging API](#6-chatmessaging-api)
7. [Wallet Management API](#7-wallet-management-api)
8. [Database Migrations](#8-database-migrations)
9. [Laravel Implementation](#9-laravel-implementation)

---

## 1. Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SCHOOL SaaS (Laravel)                    │
│  schoolname.gov.school.edu.sl                               │
├─────────────────────────────────────────────────────────────┤
│  • Student Management (sm_students)                         │
│  • Fee Assignment (sm_fees_assigns)                         │
│  • Payment Recording (sm_fees_payments)                     │
│  • School Wallet Display                                    │
│  • Staff Wallet Permissions                                 │
└─────────────────────────────────────────────────────────────┘
                    │                    ▲
        REST APIs   │                    │ Webhooks
                    ▼                    │
┌─────────────────────────────────────────────────────────────┐
│                    PEEAP PAY (my.peeap.com)                 │
│  api.peeap.com                                              │
├─────────────────────────────────────────────────────────────┤
│  • SSO/OAuth Authentication                                 │
│  • School Shared Wallets                                    │
│  • Payment Processing                                       │
│  • Parent Chat/Receipts                                     │
│  • Bank Transfers (via Monime)                              │
└─────────────────────────────────────────────────────────────┘
```

### Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.peeap.com` |
| Sandbox | `https://sandbox.api.peeap.com` |
| OAuth | `https://my.peeap.com/oauth` |

---

## 2. SSO/OAuth Integration

### Purpose
Allow school admins to connect their Peeap account to the SaaS. This creates/links a School Shared Wallet.

### OAuth Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SaaS Admin  │────▶│  Peeap OAuth │────▶│  SaaS Callback│
│  Clicks      │     │  Login Page  │     │  Stores Token │
│  "Connect"   │     │              │     │  Creates Wallet│
└──────────────┘     └──────────────┘     └──────────────┘
```

### Step 1: Register OAuth Client (One-time)

Your SaaS is already registered:
- **Client ID**: `school-saas`
- **Redirect URI**: `https://*.gov.school.edu.sl/peeap/callback`

### Step 2: Authorization Request

Redirect admin to Peeap OAuth:

```
GET https://my.peeap.com/oauth/authorize
  ?client_id=school-saas
  &redirect_uri=https://schoolname.gov.school.edu.sl/peeap/callback
  &response_type=code
  &scope=school_wallet,chat,payments
  &state={csrf_token}
```

**Scopes:**
| Scope | Permission |
|-------|------------|
| `school_wallet` | Create/manage school shared wallet |
| `chat` | Send messages to parents |
| `payments` | Process and view payments |
| `bank_transfer` | Transfer to bank accounts |

### Step 3: Exchange Code for Tokens

```
POST https://api.peeap.com/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "school-saas",
  "client_secret": "{your_client_secret}",
  "code": "{authorization_code}",
  "redirect_uri": "https://schoolname.gov.school.edu.sl/peeap/callback"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@school.edu.sl",
    "phone": "+23276123456"
  },
  "school_wallet": {
    "id": "wallet_uuid",
    "balance": 0,
    "currency": "SLE",
    "created": true
  }
}
```

### Step 4: Store Connection

Store in your `peeap_connections` table (see migrations below).

---

## 3. School Shared Wallet

### Concept

Each school gets ONE shared wallet that:
- Receives all fee payments
- Can have multiple staff with different permissions
- Supports bank transfers via Monime
- Owner can transfer to personal wallet

### Wallet Permissions

| Role | View Balance | View Transactions | Transfer to Bank | Transfer to Personal | Add Staff |
|------|--------------|-------------------|------------------|---------------------|-----------|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| Accountant | ✅ | ✅ | ✅ | ❌ | ❌ |
| Staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Viewer | ✅ | ❌ | ❌ | ❌ | ❌ |

### Get Wallet Balance

```
GET https://api.peeap.com/api/school-wallet/{wallet_id}/balance
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "wallet_id": "uuid",
  "balance": 15000000,
  "currency": "SLE",
  "formatted": "SLE 150,000.00",
  "pending_incoming": 500000,
  "pending_outgoing": 0,
  "last_updated": "2025-01-26T10:30:00Z"
}
```

### Get Wallet Transactions

```
GET https://api.peeap.com/api/school-wallet/{wallet_id}/transactions
  ?page=1
  &per_page=20
  &type=credit|debit|all
  &from_date=2025-01-01
  &to_date=2025-01-31
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "data": [
    {
      "id": "txn_uuid",
      "type": "credit",
      "amount": 50000,
      "currency": "SLE",
      "description": "Fee payment - John Doe (STU001)",
      "reference": "FEE-2025-001",
      "student_index": "STU001",
      "payer": {
        "id": "parent_uuid",
        "name": "Jane Doe",
        "phone": "+23276123456"
      },
      "status": "completed",
      "created_at": "2025-01-26T10:30:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "total": 150,
    "per_page": 20
  }
}
```

### Add Staff to Wallet

```
POST https://api.peeap.com/api/school-wallet/{wallet_id}/members
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "email": "accountant@school.edu.sl",
  "phone": "+23276123456",
  "role": "accountant",
  "name": "Mary Smith"
}
```

**Response:**
```json
{
  "id": "member_uuid",
  "user_id": "user_uuid",
  "role": "accountant",
  "status": "pending_acceptance",
  "invited_at": "2025-01-26T10:30:00Z"
}
```

### Transfer to Bank (via Monime)

```
POST https://api.peeap.com/api/school-wallet/{wallet_id}/transfer-to-bank
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "amount": 10000000,
  "bank_code": "SLCB",
  "account_number": "1234567890",
  "account_name": "School Name",
  "description": "Monthly withdrawal",
  "pin": "1234"
}
```

**Response:**
```json
{
  "transfer_id": "txn_uuid",
  "status": "processing",
  "amount": 10000000,
  "fee": 50000,
  "total_deducted": 10050000,
  "estimated_arrival": "2025-01-27T10:00:00Z"
}
```

### Transfer to Personal Wallet (Owner only)

```
POST https://api.peeap.com/api/school-wallet/{wallet_id}/transfer-to-personal
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "amount": 500000,
  "description": "Owner withdrawal",
  "pin": "1234"
}
```

---

## 4. Payment SDK Integration

### Option A: Redirect to Peeap Checkout

Simple redirect - parent completes payment on Peeap.

```php
// In your Laravel Controller
public function payFee(Request $request, $assignId)
{
    $feeAssign = SmFeesAssign::findOrFail($assignId);
    $student = $feeAssign->student;
    $school = SmSchool::find($student->school_id);

    $checkoutUrl = "https://my.peeap.com/checkout?" . http_build_query([
        'school_id' => $school->peeap_school_id,
        'wallet_id' => $school->peeap_wallet_id,
        'student_index' => $student->index_number,
        'amount' => $feeAssign->fees_amount * 100, // in cents
        'reference' => "FEE-{$assignId}",
        'description' => "School fees for {$student->full_name}",
        'callback_url' => route('peeap.callback'),
        'success_url' => route('fees.success', $assignId),
        'cancel_url' => route('fees.index'),
    ]);

    return redirect($checkoutUrl);
}
```

### Option B: Embedded Checkout (Recommended)

Embed Peeap checkout in your fees page.

**1. Include SDK:**
```html
<script src="https://my.peeap.com/embed/peeap-sdk.js"></script>
```

**2. Create Checkout Button:**
```html
<button id="pay-fee-btn"
        data-amount="{{ $feeAssign->fees_amount * 100 }}"
        data-student="{{ $student->index_number }}"
        data-reference="FEE-{{ $feeAssign->id }}">
    Pay with Peeap
</button>

<script>
document.getElementById('pay-fee-btn').addEventListener('click', function() {
    PeeapCheckout.open({
        schoolWalletId: '{{ $school->peeap_wallet_id }}',
        amount: this.dataset.amount,
        studentIndex: this.dataset.student,
        reference: this.dataset.reference,
        description: 'School fees payment',
        onSuccess: function(transaction) {
            // Payment successful
            window.location.href = '/fees/success/' + transaction.reference;
        },
        onCancel: function() {
            console.log('Payment cancelled');
        },
        onError: function(error) {
            alert('Payment failed: ' + error.message);
        }
    });
});
</script>
```

### Option C: Server-Side Payment Request

For automated or bulk payments.

```
POST https://api.peeap.com/api/payments/request
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "school_wallet_id": "wallet_uuid",
  "payer_phone": "+23276123456",
  "amount": 50000,
  "currency": "SLE",
  "reference": "FEE-2025-001",
  "description": "School fees for John Doe",
  "student_index": "STU001",
  "metadata": {
    "student_id": 123,
    "fee_assign_id": 456,
    "fee_type": "tuition"
  },
  "notify_payer": true,
  "callback_url": "https://school.edu.sl/api/peeap/webhook"
}
```

**Response:**
```json
{
  "payment_request_id": "req_uuid",
  "status": "pending",
  "checkout_url": "https://my.peeap.com/pay/req_uuid",
  "expires_at": "2025-01-26T11:30:00Z"
}
```

---

## 5. Webhook Handlers

### Webhook Events

| Event | Description |
|-------|-------------|
| `payment.completed` | Payment successfully processed |
| `payment.failed` | Payment failed |
| `payment.refunded` | Payment was refunded |
| `wallet.credit` | Money added to school wallet |
| `wallet.debit` | Money deducted from school wallet |
| `transfer.completed` | Bank transfer completed |
| `transfer.failed` | Bank transfer failed |

### Webhook Payload

```json
{
  "event": "payment.completed",
  "timestamp": "2025-01-26T10:30:00Z",
  "data": {
    "transaction_id": "txn_uuid",
    "payment_request_id": "req_uuid",
    "reference": "FEE-2025-001",
    "amount": 50000,
    "currency": "SLE",
    "school_wallet_id": "wallet_uuid",
    "payer": {
      "id": "user_uuid",
      "name": "Jane Doe",
      "phone": "+23276123456"
    },
    "student": {
      "index_number": "STU001",
      "name": "John Doe"
    },
    "metadata": {
      "student_id": 123,
      "fee_assign_id": 456,
      "fee_type": "tuition"
    },
    "receipt": {
      "number": "RCP-2025-001234",
      "url": "https://my.peeap.com/receipts/RCP-2025-001234"
    }
  },
  "signature": "sha256_hmac_signature"
}
```

### Verify Webhook Signature

```php
public function verifyWebhookSignature(Request $request): bool
{
    $payload = $request->getContent();
    $signature = $request->header('X-Peeap-Signature');
    $secret = config('peeap.webhook_secret');

    $expectedSignature = hash_hmac('sha256', $payload, $secret);

    return hash_equals($expectedSignature, $signature);
}
```

### Laravel Webhook Controller

```php
// app/Http/Controllers/PeeapWebhookController.php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SmFeesPayment;
use App\Models\SmFeesAssign;

class PeeapWebhookController extends Controller
{
    public function handle(Request $request)
    {
        // Verify signature
        if (!$this->verifyWebhookSignature($request)) {
            return response()->json(['error' => 'Invalid signature'], 401);
        }

        $event = $request->input('event');
        $data = $request->input('data');

        switch ($event) {
            case 'payment.completed':
                return $this->handlePaymentCompleted($data);
            case 'payment.failed':
                return $this->handlePaymentFailed($data);
            case 'transfer.completed':
                return $this->handleTransferCompleted($data);
            default:
                return response()->json(['status' => 'ignored']);
        }
    }

    protected function handlePaymentCompleted(array $data)
    {
        $reference = $data['reference'];

        // Parse reference: FEE-{assign_id}
        if (preg_match('/^FEE-(\d+)$/', $reference, $matches)) {
            $assignId = $matches[1];

            $feeAssign = SmFeesAssign::find($assignId);
            if (!$feeAssign) {
                return response()->json(['error' => 'Fee assignment not found'], 404);
            }

            // Record payment
            SmFeesPayment::create([
                'student_id' => $feeAssign->student_id,
                'assign_id' => $assignId,
                'fees_type_id' => $feeAssign->fees_master->fees_type_id ?? null,
                'amount' => $data['amount'] / 100, // Convert from cents
                'payment_date' => now(),
                'payment_mode' => 'Peeap',
                'transaction_id' => $data['transaction_id'],
                'paid_by' => $data['payer']['name'] ?? 'Parent',
                'note' => "Paid via Peeap. Receipt: {$data['receipt']['number']}",
                'school_id' => $feeAssign->school_id,
                'academic_id' => $feeAssign->academic_id,
            ]);

            // Store receipt info
            $feeAssign->update([
                'peeap_transaction_id' => $data['transaction_id'],
                'peeap_receipt_url' => $data['receipt']['url'],
                'paid_at' => now(),
            ]);

            return response()->json(['status' => 'recorded']);
        }

        return response()->json(['error' => 'Invalid reference format'], 400);
    }

    protected function handlePaymentFailed(array $data)
    {
        // Log failed payment for debugging
        \Log::warning('Peeap payment failed', $data);
        return response()->json(['status' => 'logged']);
    }

    protected function handleTransferCompleted(array $data)
    {
        // Record bank transfer in your accounting
        // ...
        return response()->json(['status' => 'recorded']);
    }
}
```

---

## 6. Chat/Messaging API

### Send Receipt to Parent

Automatically send receipt when payment is completed.

```
POST https://api.peeap.com/api/chat/send-receipt
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "recipient_phone": "+23276123456",
  "school_name": "Sample High School",
  "receipt": {
    "number": "RCP-2025-001234",
    "student_name": "John Doe",
    "student_index": "STU001",
    "amount": 50000,
    "currency": "SLE",
    "description": "School Fees - Term 1",
    "items": [
      {"name": "Tuition", "amount": 40000},
      {"name": "Library", "amount": 10000}
    ],
    "paid_at": "2025-01-26T10:30:00Z",
    "transaction_id": "txn_uuid"
  }
}
```

### Send Fee Reminder

```
POST https://api.peeap.com/api/chat/send-message
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "recipient_phone": "+23276123456",
  "school_name": "Sample High School",
  "message_type": "fee_reminder",
  "content": {
    "student_name": "John Doe",
    "student_index": "STU001",
    "amount_due": 50000,
    "due_date": "2025-02-01",
    "fee_type": "Term 2 Fees"
  },
  "action_button": {
    "label": "Pay Now",
    "url": "https://my.peeap.com/pay?ref=FEE-456"
  }
}
```

### Send General Message

```
POST https://api.peeap.com/api/chat/send-message
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "recipient_phone": "+23276123456",
  "school_name": "Sample High School",
  "message_type": "announcement",
  "content": "School will be closed on Monday for public holiday.",
  "metadata": {
    "category": "announcement",
    "priority": "normal"
  }
}
```

---

## 7. Wallet Management API

### Get School Info

```
GET https://api.peeap.com/api/school/{school_id}
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "id": "school_uuid",
  "name": "Sample High School",
  "domain": "sample.gov.school.edu.sl",
  "wallet": {
    "id": "wallet_uuid",
    "balance": 15000000,
    "currency": "SLE"
  },
  "owner": {
    "id": "user_uuid",
    "name": "Principal Name",
    "email": "principal@school.edu.sl"
  },
  "members": [
    {
      "id": "member_uuid",
      "name": "Accountant Name",
      "role": "accountant",
      "status": "active"
    }
  ],
  "stats": {
    "total_students": 500,
    "total_payments_this_month": 12500000,
    "total_payments_count": 150
  }
}
```

### Refresh Access Token

```
POST https://api.peeap.com/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "client_id": "school-saas",
  "client_secret": "{your_client_secret}",
  "refresh_token": "{refresh_token}"
}
```

---

## 8. Database Migrations

### Migration: Create Peeap Connection Tables

```php
// database/migrations/xxxx_create_peeap_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreatePeeapTables extends Migration
{
    public function up()
    {
        // School Peeap Connection
        Schema::create('peeap_connections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('school_id');
            $table->string('peeap_user_id')->nullable();
            $table->string('peeap_wallet_id')->nullable();
            $table->string('peeap_school_id')->nullable();
            $table->text('access_token')->nullable();
            $table->text('refresh_token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->string('status')->default('pending'); // pending, connected, disconnected
            $table->unsignedBigInteger('connected_by')->nullable(); // user who connected
            $table->timestamps();

            $table->foreign('school_id')->references('id')->on('sm_schools')->onDelete('cascade');
            $table->foreign('connected_by')->references('id')->on('users')->onDelete('set null');
        });

        // Staff Wallet Permissions
        Schema::create('peeap_wallet_permissions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('school_id');
            $table->unsignedBigInteger('user_id');
            $table->string('peeap_member_id')->nullable();
            $table->string('role'); // owner, accountant, staff, viewer
            $table->boolean('can_view_balance')->default(true);
            $table->boolean('can_view_transactions')->default(false);
            $table->boolean('can_transfer_bank')->default(false);
            $table->boolean('can_transfer_personal')->default(false);
            $table->boolean('can_manage_members')->default(false);
            $table->string('status')->default('pending'); // pending, active, revoked
            $table->timestamps();

            $table->foreign('school_id')->references('id')->on('sm_schools')->onDelete('cascade');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // Payment Transactions Log
        Schema::create('peeap_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('school_id');
            $table->string('peeap_transaction_id')->unique();
            $table->string('type'); // payment, transfer_bank, transfer_personal, refund
            $table->decimal('amount', 12, 2);
            $table->string('currency', 3)->default('SLE');
            $table->string('status'); // pending, completed, failed, refunded
            $table->string('reference')->nullable();
            $table->text('description')->nullable();
            $table->json('payer_info')->nullable();
            $table->json('metadata')->nullable();
            $table->unsignedBigInteger('student_id')->nullable();
            $table->unsignedBigInteger('fee_assign_id')->nullable();
            $table->string('receipt_number')->nullable();
            $table->string('receipt_url')->nullable();
            $table->timestamps();

            $table->foreign('school_id')->references('id')->on('sm_schools')->onDelete('cascade');
            $table->foreign('student_id')->references('id')->on('sm_students')->onDelete('set null');
        });
    }

    public function down()
    {
        Schema::dropIfExists('peeap_transactions');
        Schema::dropIfExists('peeap_wallet_permissions');
        Schema::dropIfExists('peeap_connections');
    }
}
```

### Add Peeap Fields to Existing Tables

```php
// database/migrations/xxxx_add_peeap_fields.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPeeapFields extends Migration
{
    public function up()
    {
        // Add to sm_students
        Schema::table('sm_students', function (Blueprint $table) {
            $table->string('index_number')->nullable()->after('roll_no');
            $table->boolean('peeap_connected')->default(false)->after('index_number');
            $table->string('peeap_wallet_id')->nullable()->after('peeap_connected');
        });

        // Add to sm_fees_assigns
        Schema::table('sm_fees_assigns', function (Blueprint $table) {
            $table->string('peeap_transaction_id')->nullable();
            $table->string('peeap_receipt_url')->nullable();
            $table->timestamp('paid_at')->nullable();
        });

        // Add to sm_fees_payments
        Schema::table('sm_fees_payments', function (Blueprint $table) {
            $table->string('peeap_receipt_number')->nullable();
            $table->string('peeap_receipt_url')->nullable();
        });
    }

    public function down()
    {
        Schema::table('sm_students', function (Blueprint $table) {
            $table->dropColumn(['index_number', 'peeap_connected', 'peeap_wallet_id']);
        });

        Schema::table('sm_fees_assigns', function (Blueprint $table) {
            $table->dropColumn(['peeap_transaction_id', 'peeap_receipt_url', 'paid_at']);
        });

        Schema::table('sm_fees_payments', function (Blueprint $table) {
            $table->dropColumn(['peeap_receipt_number', 'peeap_receipt_url']);
        });
    }
}
```

---

## 9. Laravel Implementation

### Config File

```php
// config/peeap.php

return [
    'base_url' => env('PEEAP_BASE_URL', 'https://api.peeap.com'),
    'oauth_url' => env('PEEAP_OAUTH_URL', 'https://my.peeap.com/oauth'),
    'client_id' => env('PEEAP_CLIENT_ID', 'school-saas'),
    'client_secret' => env('PEEAP_CLIENT_SECRET'),
    'webhook_secret' => env('PEEAP_WEBHOOK_SECRET'),
    'sdk_url' => env('PEEAP_SDK_URL', 'https://my.peeap.com/embed/peeap-sdk.js'),
];
```

### Service Class

```php
// app/Services/PeeapService.php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use App\Models\PeeapConnection;

class PeeapService
{
    protected $baseUrl;
    protected $connection;

    public function __construct()
    {
        $this->baseUrl = config('peeap.base_url');
    }

    public function setSchool($schoolId)
    {
        $this->connection = PeeapConnection::where('school_id', $schoolId)
            ->where('status', 'connected')
            ->first();

        return $this;
    }

    protected function getAccessToken()
    {
        if (!$this->connection) {
            throw new \Exception('No Peeap connection found');
        }

        // Refresh token if expired
        if ($this->connection->token_expires_at < now()) {
            $this->refreshToken();
        }

        return $this->connection->access_token;
    }

    protected function refreshToken()
    {
        $response = Http::post(config('peeap.oauth_url') . '/token', [
            'grant_type' => 'refresh_token',
            'client_id' => config('peeap.client_id'),
            'client_secret' => config('peeap.client_secret'),
            'refresh_token' => $this->connection->refresh_token,
        ]);

        if ($response->successful()) {
            $data = $response->json();
            $this->connection->update([
                'access_token' => $data['access_token'],
                'refresh_token' => $data['refresh_token'],
                'token_expires_at' => now()->addSeconds($data['expires_in']),
            ]);
        }
    }

    public function getWalletBalance()
    {
        $walletId = $this->connection->peeap_wallet_id;

        $response = Http::withToken($this->getAccessToken())
            ->get("{$this->baseUrl}/api/school-wallet/{$walletId}/balance");

        return $response->json();
    }

    public function getTransactions($params = [])
    {
        $walletId = $this->connection->peeap_wallet_id;

        $response = Http::withToken($this->getAccessToken())
            ->get("{$this->baseUrl}/api/school-wallet/{$walletId}/transactions", $params);

        return $response->json();
    }

    public function createPaymentRequest($data)
    {
        $response = Http::withToken($this->getAccessToken())
            ->post("{$this->baseUrl}/api/payments/request", array_merge($data, [
                'school_wallet_id' => $this->connection->peeap_wallet_id,
            ]));

        return $response->json();
    }

    public function sendReceipt($recipientPhone, $receipt)
    {
        $response = Http::withToken($this->getAccessToken())
            ->post("{$this->baseUrl}/api/chat/send-receipt", [
                'recipient_phone' => $recipientPhone,
                'school_name' => $this->connection->school->school_name,
                'receipt' => $receipt,
            ]);

        return $response->json();
    }

    public function sendMessage($recipientPhone, $messageType, $content)
    {
        $response = Http::withToken($this->getAccessToken())
            ->post("{$this->baseUrl}/api/chat/send-message", [
                'recipient_phone' => $recipientPhone,
                'school_name' => $this->connection->school->school_name,
                'message_type' => $messageType,
                'content' => $content,
            ]);

        return $response->json();
    }

    public function transferToBank($amount, $bankDetails, $pin)
    {
        $walletId = $this->connection->peeap_wallet_id;

        $response = Http::withToken($this->getAccessToken())
            ->post("{$this->baseUrl}/api/school-wallet/{$walletId}/transfer-to-bank", [
                'amount' => $amount,
                'bank_code' => $bankDetails['bank_code'],
                'account_number' => $bankDetails['account_number'],
                'account_name' => $bankDetails['account_name'],
                'description' => $bankDetails['description'] ?? 'Bank transfer',
                'pin' => $pin,
            ]);

        return $response->json();
    }
}
```

### Routes

```php
// routes/web.php

Route::prefix('peeap')->middleware('auth')->group(function () {
    // OAuth
    Route::get('/connect', [PeeapController::class, 'connect'])->name('peeap.connect');
    Route::get('/callback', [PeeapController::class, 'callback'])->name('peeap.callback');
    Route::post('/disconnect', [PeeapController::class, 'disconnect'])->name('peeap.disconnect');

    // Wallet
    Route::get('/wallet', [PeeapWalletController::class, 'index'])->name('peeap.wallet');
    Route::get('/wallet/transactions', [PeeapWalletController::class, 'transactions'])->name('peeap.transactions');
    Route::post('/wallet/transfer-bank', [PeeapWalletController::class, 'transferToBank'])->name('peeap.transfer.bank');

    // Permissions
    Route::get('/permissions', [PeeapPermissionController::class, 'index'])->name('peeap.permissions');
    Route::post('/permissions', [PeeapPermissionController::class, 'store'])->name('peeap.permissions.store');
    Route::delete('/permissions/{id}', [PeeapPermissionController::class, 'destroy'])->name('peeap.permissions.destroy');
});

// Webhook (no auth - verified by signature)
Route::post('/api/peeap/webhook', [PeeapWebhookController::class, 'handle']);
```

### Blade Component for Pay Button

```php
// resources/views/components/peeap-pay-button.blade.php

@props(['feeAssign', 'student'])

@php
$school = \App\Models\SmSchool::find($student->school_id);
$connection = \App\Models\PeeapConnection::where('school_id', $school->id)->where('status', 'connected')->first();
@endphp

@if($connection)
<button
    class="btn btn-success peeap-pay-btn"
    data-wallet-id="{{ $connection->peeap_wallet_id }}"
    data-amount="{{ $feeAssign->fees_amount * 100 }}"
    data-student-index="{{ $student->index_number }}"
    data-reference="FEE-{{ $feeAssign->id }}"
    data-description="School fees for {{ $student->full_name }}"
>
    <i class="fa fa-credit-card"></i> Pay with Peeap
</button>

@push('scripts')
<script src="{{ config('peeap.sdk_url') }}"></script>
<script>
document.querySelectorAll('.peeap-pay-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        PeeapCheckout.open({
            schoolWalletId: this.dataset.walletId,
            amount: parseInt(this.dataset.amount),
            studentIndex: this.dataset.studentIndex,
            reference: this.dataset.reference,
            description: this.dataset.description,
            onSuccess: function(transaction) {
                toastr.success('Payment successful!');
                window.location.reload();
            },
            onCancel: function() {
                toastr.info('Payment cancelled');
            },
            onError: function(error) {
                toastr.error('Payment failed: ' + error.message);
            }
        });
    });
});
</script>
@endpush
@else
<span class="text-muted">Peeap not connected</span>
@endif
```

---

## Summary

### What to Build on SaaS:

1. **OAuth Connection** - "Connect Peeap" button for school admin
2. **Wallet Dashboard** - Show balance, transactions
3. **Pay Button** - Embed Peeap SDK on fees page
4. **Webhook Handler** - Record payments automatically
5. **Staff Permissions** - UI to add/manage wallet access
6. **Bank Transfer** - Form to transfer to bank

### What Peeap Provides:

1. **OAuth Endpoints** - For SSO connection
2. **School Wallet APIs** - Balance, transactions, transfers
3. **Payment SDK** - Embeddable checkout
4. **Webhooks** - Real-time payment notifications
5. **Chat API** - Send receipts/messages to parents

### Environment Variables for SaaS:

```env
PEEAP_BASE_URL=https://api.peeap.com
PEEAP_OAUTH_URL=https://my.peeap.com/oauth
PEEAP_CLIENT_ID=school-saas
PEEAP_CLIENT_SECRET=your_secret_here
PEEAP_WEBHOOK_SECRET=your_webhook_secret
PEEAP_SDK_URL=https://my.peeap.com/embed/peeap-sdk.js
```
