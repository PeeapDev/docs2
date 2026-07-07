# School System Pay-Fee Endpoint Implementation

This document provides the complete implementation for the `/api/peeap/pay-fee` endpoint that school systems must implement to receive payments from Peeap.

---

## API Specification

### Endpoint
```
POST /api/peeap/pay-fee
Content-Type: application/json
```

### Request Body
```json
{
  "student_index": "SL-2025-02-00222",
  "fee_id": 32,
  "amount": 500.00,
  "transaction_id": "FEE-1738333000-ABC123",
  "payment_method": "peeap_wallet",
  "school_id": 54
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `student_index` | string | Yes | Student's NSI (National Student Identifier) e.g., "SL-2025-02-00222" |
| `fee_id` | integer | Yes | The fee assignment ID from `/student-financials` response |
| `amount` | number | Yes | Payment amount in NLE |
| `transaction_id` | string | Yes | Unique Peeap transaction reference |
| `payment_method` | string | Yes | Always "peeap_wallet" |
| `school_id` | integer | Yes | School ID |

### Success Response
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "receipt_number": "RCP-2025-001234",
    "amount_paid": 500.00,
    "previous_paid": 0.00,
    "new_total_paid": 500.00,
    "new_balance": 6768.00,
    "fee_status": "partial"
  }
}
```

### Error Responses
```json
{
  "success": false,
  "error": "Student not found",
  "code": "STUDENT_NOT_FOUND"
}
```

```json
{
  "success": false,
  "error": "Fee not found for this student",
  "code": "FEE_NOT_FOUND"
}
```

```json
{
  "success": false,
  "error": "Payment amount exceeds balance due",
  "code": "AMOUNT_EXCEEDS_BALANCE"
}
```

```json
{
  "success": false,
  "error": "Duplicate transaction",
  "code": "DUPLICATE_TRANSACTION"
}
```

---

## Laravel/PHP Implementation

### 1. Create the Controller

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\SmStudent;
use App\Models\SmFeesAssign;
use App\Models\SmFeesPayment;
use App\Models\FmFeesTransaction;

class PeeapPaymentController extends Controller
{
    /**
     * Handle fee payment from Peeap
     * POST /api/peeap/pay-fee
     */
    public function payFee(Request $request)
    {
        // Validate required fields
        $validated = $request->validate([
            'student_index' => 'required|string',
            'fee_id' => 'required|integer',
            'amount' => 'required|numeric|min:0.01',
            'transaction_id' => 'required|string',
            'payment_method' => 'required|string',
            'school_id' => 'required|integer',
        ]);

        try {
            // Check for duplicate transaction
            $existingPayment = FmFeesTransaction::where('transaction_id', $validated['transaction_id'])->first();
            if ($existingPayment) {
                return response()->json([
                    'success' => false,
                    'error' => 'Duplicate transaction',
                    'code' => 'DUPLICATE_TRANSACTION'
                ], 400);
            }

            // Find student by index number (NSI)
            $student = SmStudent::where('index_number', $validated['student_index'])
                ->where('school_id', $validated['school_id'])
                ->where('active_status', 1)
                ->first();

            if (!$student) {
                // Also try searching in national_id field
                $student = SmStudent::where('national_id', $validated['student_index'])
                    ->where('school_id', $validated['school_id'])
                    ->where('active_status', 1)
                    ->first();
            }

            if (!$student) {
                Log::warning('Peeap payment: Student not found', [
                    'student_index' => $validated['student_index'],
                    'school_id' => $validated['school_id']
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Student not found',
                    'code' => 'STUDENT_NOT_FOUND'
                ], 404);
            }

            // Find the fee assignment
            // The fee_id from Peeap is the sm_fees_assigns.id
            $feeAssign = SmFeesAssign::where('id', $validated['fee_id'])
                ->where('student_id', $student->id)
                ->where('school_id', $validated['school_id'])
                ->first();

            if (!$feeAssign) {
                // Try alternate lookup - maybe fee_id is fees_master_id
                $feeAssign = SmFeesAssign::where('fees_master_id', $validated['fee_id'])
                    ->where('student_id', $student->id)
                    ->where('school_id', $validated['school_id'])
                    ->first();
            }

            if (!$feeAssign) {
                Log::warning('Peeap payment: Fee not found', [
                    'fee_id' => $validated['fee_id'],
                    'student_id' => $student->id,
                    'school_id' => $validated['school_id']
                ]);

                return response()->json([
                    'success' => false,
                    'error' => 'Fee not found for this student',
                    'code' => 'FEE_NOT_FOUND'
                ], 404);
            }

            // Calculate current balance
            $totalFees = $feeAssign->fees_amount ?? 0;
            $totalPaid = $this->getTotalPaid($feeAssign->id);
            $currentBalance = $totalFees - $totalPaid;

            // Validate payment amount
            $paymentAmount = floatval($validated['amount']);

            if ($paymentAmount > $currentBalance) {
                return response()->json([
                    'success' => false,
                    'error' => 'Payment amount exceeds balance due',
                    'code' => 'AMOUNT_EXCEEDS_BALANCE',
                    'data' => [
                        'balance_due' => $currentBalance,
                        'payment_attempted' => $paymentAmount
                    ]
                ], 400);
            }

            // Begin transaction
            DB::beginTransaction();

            try {
                // Generate receipt number
                $receiptNumber = $this->generateReceiptNumber($validated['school_id']);

                // Record the payment in fm_fees_transactions (or your payment table)
                $transaction = FmFeesTransaction::create([
                    'fees_assign_id' => $feeAssign->id,
                    'student_id' => $student->id,
                    'school_id' => $validated['school_id'],
                    'amount' => $paymentAmount,
                    'payment_mode' => 'Peeap Wallet',
                    'transaction_id' => $validated['transaction_id'],
                    'receipt_number' => $receiptNumber,
                    'payment_date' => now(),
                    'status' => 'completed',
                    'notes' => 'Payment received via Peeap',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Also record in sm_fees_payments if using that table
                SmFeesPayment::create([
                    'fees_assign_id' => $feeAssign->id,
                    'student_id' => $student->id,
                    'fees_master_id' => $feeAssign->fees_master_id,
                    'fees_type_id' => $feeAssign->fees_type_id ?? null,
                    'amount' => $paymentAmount,
                    'payment_mode' => 'Peeap Wallet',
                    'payment_date' => now()->format('Y-m-d'),
                    'note' => 'Peeap Transaction: ' . $validated['transaction_id'],
                    'school_id' => $validated['school_id'],
                    'academic_id' => $feeAssign->academic_id ?? $this->getCurrentAcademicYear($validated['school_id']),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                // Update fees_assign paid status if fully paid
                $newTotalPaid = $totalPaid + $paymentAmount;
                $newBalance = $totalFees - $newTotalPaid;

                $feeStatus = 'unpaid';
                if ($newBalance <= 0) {
                    $feeStatus = 'paid';
                    $feeAssign->fees_status = 1; // Mark as paid
                } elseif ($newTotalPaid > 0) {
                    $feeStatus = 'partial';
                    $feeAssign->fees_status = 2; // Mark as partial
                }
                $feeAssign->save();

                DB::commit();

                Log::info('Peeap payment successful', [
                    'transaction_id' => $validated['transaction_id'],
                    'student_index' => $validated['student_index'],
                    'amount' => $paymentAmount,
                    'receipt' => $receiptNumber
                ]);

                return response()->json([
                    'success' => true,
                    'message' => 'Payment recorded successfully',
                    'data' => [
                        'receipt_number' => $receiptNumber,
                        'amount_paid' => $paymentAmount,
                        'previous_paid' => $totalPaid,
                        'new_total_paid' => $newTotalPaid,
                        'new_balance' => max(0, $newBalance),
                        'fee_status' => $feeStatus
                    ]
                ]);

            } catch (\Exception $e) {
                DB::rollBack();
                throw $e;
            }

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'error' => 'Missing required fields: ' . implode(', ', array_keys($e->errors())),
                'code' => 'MISSING_PARAMS'
            ], 400);

        } catch (\Exception $e) {
            Log::error('Peeap payment error', [
                'error' => $e->getMessage(),
                'request' => $request->all()
            ]);

            return response()->json([
                'success' => false,
                'error' => 'Internal server error',
                'code' => 'SERVER_ERROR'
            ], 500);
        }
    }

    /**
     * Get total amount paid for a fee assignment
     */
    private function getTotalPaid($feesAssignId)
    {
        // Sum from fm_fees_transactions
        $fromTransactions = FmFeesTransaction::where('fees_assign_id', $feesAssignId)
            ->where('status', 'completed')
            ->sum('amount');

        // Also check sm_fees_payments if you use both tables
        $fromPayments = SmFeesPayment::where('fees_assign_id', $feesAssignId)
            ->sum('amount');

        // Return the higher value (avoid double counting if data is in both)
        return max($fromTransactions, $fromPayments);
    }

    /**
     * Generate a unique receipt number
     */
    private function generateReceiptNumber($schoolId)
    {
        $prefix = 'RCP';
        $year = date('Y');
        $count = FmFeesTransaction::where('school_id', $schoolId)
            ->whereYear('created_at', $year)
            ->count() + 1;

        return sprintf('%s-%s-%06d', $prefix, $year, $count);
    }

    /**
     * Get current academic year
     */
    private function getCurrentAcademicYear($schoolId)
    {
        // Adjust this based on your academic year table
        return DB::table('sm_academic_years')
            ->where('school_id', $schoolId)
            ->where('active_status', 1)
            ->value('id') ?? 1;
    }
}
```

### 2. Create the Route

Add to `routes/api.php`:

```php
<?php

use App\Http\Controllers\Api\PeeapPaymentController;

// Peeap Integration Routes
Route::prefix('peeap')->group(function () {
    Route::post('/pay-fee', [PeeapPaymentController::class, 'payFee']);
});
```

### 3. Create Migration for Transactions Table (if not exists)

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateFmFeesTransactionsTable extends Migration
{
    public function up()
    {
        Schema::create('fm_fees_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('fees_assign_id');
            $table->unsignedBigInteger('student_id');
            $table->unsignedBigInteger('school_id');
            $table->decimal('amount', 10, 2);
            $table->string('payment_mode', 50);
            $table->string('transaction_id', 100)->unique();
            $table->string('receipt_number', 50)->unique();
            $table->date('payment_date');
            $table->string('status', 20)->default('completed');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('fees_assign_id');
            $table->index('student_id');
            $table->index('school_id');
            $table->index('transaction_id');
        });
    }

    public function down()
    {
        Schema::dropIfExists('fm_fees_transactions');
    }
}
```

---

## Alternative: Raw SQL Implementation

If you're not using Laravel, here's the raw SQL approach:

### Check and Record Payment

```sql
-- 1. First, find the student
SELECT id, full_name, school_id
FROM sm_students
WHERE (index_number = 'SL-2025-02-00222' OR national_id = 'SL-2025-02-00222')
  AND school_id = 54
  AND active_status = 1;

-- 2. Find the fee assignment (assuming student_id = 230)
SELECT
    fa.id,
    fa.fees_amount,
    fa.fees_master_id,
    COALESCE(SUM(fp.amount), 0) as total_paid,
    (fa.fees_amount - COALESCE(SUM(fp.amount), 0)) as balance
FROM sm_fees_assigns fa
LEFT JOIN sm_fees_payments fp ON fp.fees_assign_id = fa.id
WHERE fa.id = 32  -- fee_id from request
  AND fa.student_id = 230
  AND fa.school_id = 54
GROUP BY fa.id, fa.fees_amount, fa.fees_master_id;

-- 3. Check for duplicate transaction
SELECT id FROM fm_fees_transactions
WHERE transaction_id = 'FEE-1738333000-ABC123';

-- 4. Record the payment
INSERT INTO fm_fees_transactions (
    fees_assign_id,
    student_id,
    school_id,
    amount,
    payment_mode,
    transaction_id,
    receipt_number,
    payment_date,
    status,
    notes,
    created_at,
    updated_at
) VALUES (
    32,                              -- fees_assign_id
    230,                             -- student_id
    54,                              -- school_id
    500.00,                          -- amount
    'Peeap Wallet',                  -- payment_mode
    'FEE-1738333000-ABC123',         -- transaction_id (unique from Peeap)
    'RCP-2025-000001',               -- receipt_number (generate unique)
    CURDATE(),                       -- payment_date
    'completed',                     -- status
    'Payment received via Peeap',    -- notes
    NOW(),                           -- created_at
    NOW()                            -- updated_at
);

-- 5. Also insert into sm_fees_payments for Smart School compatibility
INSERT INTO sm_fees_payments (
    fees_assign_id,
    student_id,
    fees_master_id,
    amount,
    payment_mode,
    payment_date,
    note,
    school_id,
    academic_id,
    created_at,
    updated_at
) VALUES (
    32,                                          -- fees_assign_id
    230,                                         -- student_id
    5,                                           -- fees_master_id
    500.00,                                      -- amount
    'Peeap Wallet',                              -- payment_mode
    CURDATE(),                                   -- payment_date
    'Peeap Transaction: FEE-1738333000-ABC123',  -- note
    54,                                          -- school_id
    1,                                           -- academic_id (current)
    NOW(),                                       -- created_at
    NOW()                                        -- updated_at
);

-- 6. Update fee status if fully paid
UPDATE sm_fees_assigns
SET fees_status = CASE
    WHEN (SELECT SUM(amount) FROM sm_fees_payments WHERE fees_assign_id = 32) >= fees_amount THEN 1  -- paid
    ELSE 2  -- partial
END,
updated_at = NOW()
WHERE id = 32;
```

---

## Node.js/Express Implementation

```javascript
const express = require('express');
const router = express.Router();
const db = require('../db'); // Your database connection

router.post('/api/peeap/pay-fee', async (req, res) => {
  const { student_index, fee_id, amount, transaction_id, payment_method, school_id } = req.body;

  // Validate required fields
  if (!student_index || !fee_id || !amount || !transaction_id || !school_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: ' +
        [!student_index && 'student_index', !fee_id && 'fee_id', !amount && 'amount']
          .filter(Boolean).join(', '),
      code: 'MISSING_PARAMS'
    });
  }

  try {
    // Check for duplicate transaction
    const [existing] = await db.query(
      'SELECT id FROM fm_fees_transactions WHERE transaction_id = ?',
      [transaction_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate transaction',
        code: 'DUPLICATE_TRANSACTION'
      });
    }

    // Find student by index number
    const [students] = await db.query(
      `SELECT id, full_name FROM sm_students
       WHERE (index_number = ? OR national_id = ?)
       AND school_id = ? AND active_status = 1`,
      [student_index, student_index, school_id]
    );

    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND'
      });
    }

    const student = students[0];

    // Find fee assignment
    const [fees] = await db.query(
      `SELECT fa.id, fa.fees_amount, fa.fees_master_id,
              COALESCE(SUM(fp.amount), 0) as total_paid
       FROM sm_fees_assigns fa
       LEFT JOIN sm_fees_payments fp ON fp.fees_assign_id = fa.id
       WHERE fa.id = ? AND fa.student_id = ? AND fa.school_id = ?
       GROUP BY fa.id`,
      [fee_id, student.id, school_id]
    );

    if (fees.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Fee not found for this student',
        code: 'FEE_NOT_FOUND'
      });
    }

    const fee = fees[0];
    const currentBalance = fee.fees_amount - fee.total_paid;

    // Validate amount
    if (amount > currentBalance) {
      return res.status(400).json({
        success: false,
        error: 'Payment amount exceeds balance due',
        code: 'AMOUNT_EXCEEDS_BALANCE'
      });
    }

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    // Begin transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Insert payment record
      await connection.query(
        `INSERT INTO fm_fees_transactions
         (fees_assign_id, student_id, school_id, amount, payment_mode,
          transaction_id, receipt_number, payment_date, status, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Peeap Wallet', ?, ?, CURDATE(), 'completed', 'Payment via Peeap', NOW(), NOW())`,
        [fee_id, student.id, school_id, amount, transaction_id, receiptNumber]
      );

      // Insert into sm_fees_payments
      await connection.query(
        `INSERT INTO sm_fees_payments
         (fees_assign_id, student_id, fees_master_id, amount, payment_mode,
          payment_date, note, school_id, academic_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Peeap Wallet', CURDATE(), ?, ?, 1, NOW(), NOW())`,
        [fee_id, student.id, fee.fees_master_id, amount, `Peeap: ${transaction_id}`, school_id]
      );

      // Update fee status
      const newTotalPaid = parseFloat(fee.total_paid) + parseFloat(amount);
      const newBalance = fee.fees_amount - newTotalPaid;
      const feeStatus = newBalance <= 0 ? 1 : 2; // 1 = paid, 2 = partial

      await connection.query(
        'UPDATE sm_fees_assigns SET fees_status = ?, updated_at = NOW() WHERE id = ?',
        [feeStatus, fee_id]
      );

      await connection.commit();

      return res.json({
        success: true,
        message: 'Payment recorded successfully',
        data: {
          receipt_number: receiptNumber,
          amount_paid: parseFloat(amount),
          previous_paid: parseFloat(fee.total_paid),
          new_total_paid: newTotalPaid,
          new_balance: Math.max(0, newBalance),
          fee_status: newBalance <= 0 ? 'paid' : 'partial'
        }
      });

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Peeap payment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;
```

---

## Testing the Implementation

After implementing, test with:

```bash
curl -X POST "https://gov.school.edu.sl/api/peeap/pay-fee" \
  -H "Content-Type: application/json" \
  -d '{
    "student_index": "SL-2025-02-00222",
    "fee_id": 32,
    "amount": 1,
    "transaction_id": "TEST-1738333999-TEST01",
    "payment_method": "peeap_wallet",
    "school_id": 54
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "data": {
    "receipt_number": "RCP-2025-000001",
    "amount_paid": 1.00,
    "previous_paid": 0.00,
    "new_total_paid": 1.00,
    "new_balance": 7267.00,
    "fee_status": "partial"
  }
}
```

---

## Important Notes

1. **Idempotency**: Always check for duplicate `transaction_id` before processing
2. **Atomic Updates**: Use database transactions to ensure consistency
3. **Logging**: Log all payment attempts for debugging and audit
4. **Field Mapping**: The `fee_id` from Peeap maps to `sm_fees_assigns.id` (not `fees_master_id`)
5. **Student Lookup**: Try both `index_number` and `national_id` fields when finding students
