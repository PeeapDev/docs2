# School Parent Chat Integration

## Overview

This document describes the integration between Peeap and School SaaS systems for parent-school communication.

## Two Access Paths

### Path 1: Any Peeap User (No Relationship)
Simple fee payment without parent-child relationship.

```
User Journey:
1. Open Peeap app
2. Go to "School Fees" section
3. Enter student NSI
4. View outstanding fees
5. Pay fees

Features:
✓ View student fees by NSI
✓ Pay fees
✗ No chat with school
✗ No wallet topup for student
✗ No parent-child relationship
✗ No school notifications
```

### Path 2: Parent from School SaaS (Full Relationship)
Complete integration with chat and notifications.

```
User Journey:
1. Parent logs into School SaaS
2. Goes to parent dashboard
3. Clicks "Connect to Peeap"
4. Redirected to Peeap OAuth
5. Login or create Peeap account
6. Returns to school with connection
7. Chat channel opens
8. Receives school notifications

Features:
✓ Full parent-child relationship
✓ Bidirectional chat with school
✓ Top up student wallet
✓ School notifications in Peeap chat
✓ Pay fees with receipt in chat
✓ Class group messaging
```

---

## SSO Flow for Parent Connection

### Step 1: School SaaS Initiates OAuth

```
GET https://my.peeap.com/auth/authorize
  ?client_id=school_saas
  &redirect_uri=https://{school}.gov.school.edu.sl/parent/peeap-callback
  &response_type=code
  &scope=profile wallet:read wallet:write school:connect
  &state={random_state}

  # Parent-specific parameters
  &user_type=parent
  &school_id={school_id}
  &school_name={school_name}
  &school_logo_url={logo_url}
  &school_domain={school}.gov.school.edu.sl
  &parent_id={parent_id_in_school}
  &parent_name={parent_name}
  &parent_email={email}
  &parent_phone={phone}
  &children={url_encoded_json}
```

### Children JSON Structure

```json
[
  {
    "nsi": "SL-2025-02-00368",
    "name": "John Doe",
    "student_id": "12345",
    "class_id": "10A",
    "class_name": "Grade 10A",
    "section_name": "Science",
    "profile_photo_url": "https://..."
  },
  {
    "nsi": "SL-2025-02-00369",
    "name": "Jane Doe",
    "student_id": "12346",
    "class_id": "8B",
    "class_name": "Grade 8B"
  }
]
```

### Step 2: Peeap Creates Connection

After OAuth approval, Peeap:
1. Creates `school_parent_connections` record
2. Creates `school_parent_children` for each child
3. Creates initial chat thread (optional)
4. Returns token with connection info

### Step 3: Token Response

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer",
  "user": {
    "peeap_id": "usr_abc123",
    "email": "parent@email.com"
  },
  "parent_connection": {
    "connection_id": "uuid",
    "peeap_school_id": "ses",
    "chat_enabled": true,
    "children": [
      {
        "nsi": "SL-2025-02-00368",
        "name": "John Doe",
        "wallet_id": "wal_xyz"
      }
    ]
  }
}
```

---

## Chat System

### Message Types

| Type | Description | Rich Content |
|------|-------------|--------------|
| `text` | Plain text message | No |
| `invoice` | Fee invoice with pay button | Yes - invoice details |
| `receipt` | Payment receipt | Yes - transaction details |
| `announcement` | School announcement | Optional - event details |
| `fee_reminder` | Fee due reminder | Yes - fee summary |
| `report_card` | Academic report | Yes - grades |
| `event` | School event | Yes - event details |
| `attendance` | Attendance notification | Yes - attendance data |
| `image` | Image attachment | Yes - image URL |
| `document` | Document attachment | Yes - document URL |

### Invoice Message Example

```json
{
  "message_type": "invoice",
  "content": "Fee invoice for Term 2, 2025",
  "rich_content": {
    "invoice_id": "INV-2025-001",
    "invoice_number": "INV-2025-001",
    "student_nsi": "SL-2025-02-00368",
    "student_name": "John Doe",
    "class_name": "Grade 10A",
    "items": [
      {"name": "Tuition Fee", "amount": 300000},
      {"name": "Library Fee", "amount": 50000},
      {"name": "Lab Fee", "amount": 100000}
    ],
    "subtotal": 450000,
    "paid_amount": 0,
    "total_due": 450000,
    "currency": "SLE",
    "due_date": "2025-02-15",
    "status": "unpaid",
    "actions": [
      {
        "type": "pay",
        "label": "Pay Now",
        "url": "peeap://pay/invoice/INV-2025-001"
      },
      {
        "type": "view",
        "label": "View Details",
        "url": "peeap://invoice/INV-2025-001"
      }
    ]
  }
}
```

### Receipt Message Example

```json
{
  "message_type": "receipt",
  "content": "Payment received - Thank you!",
  "rich_content": {
    "receipt_number": "RCP-2025-001",
    "transaction_id": "txn_abc123",
    "student_nsi": "SL-2025-02-00368",
    "student_name": "John Doe",
    "amount_paid": 450000,
    "currency": "SLE",
    "payment_method": "Peeap Wallet",
    "paid_at": "2025-01-30T10:30:00Z",
    "items_paid": [
      {"name": "Tuition Fee", "amount": 300000},
      {"name": "Library Fee", "amount": 50000},
      {"name": "Lab Fee", "amount": 100000}
    ],
    "balance_remaining": 0,
    "actions": [
      {
        "type": "download",
        "label": "Download Receipt",
        "url": "https://api.peeap.com/receipts/RCP-2025-001.pdf"
      }
    ]
  }
}
```

---

## API Endpoints

### For School SaaS to Call

#### Send Message to Parent
```
POST /school/chat/send
Authorization: Bearer {school_access_token}

{
  "parent_connection_id": "uuid",
  // OR
  "parent_nsi_list": ["SL-2025-02-00368"],  // Send to parents of these students

  "message_type": "text",
  "content": "Hello, this is a message from the school",

  // For rich messages
  "rich_content": {...},

  // Sender info
  "sender_name": "Mrs. Smith",
  "sender_role": "Class Teacher"
}
```

#### Send Invoice Notification
```
POST /school/chat/invoice
Authorization: Bearer {school_access_token}

{
  "student_nsi": "SL-2025-02-00368",
  "invoice": {
    "invoice_id": "INV-2025-001",
    "items": [...],
    "total": 450000,
    "due_date": "2025-02-15"
  }
}
```

#### Send Class Announcement
```
POST /school/chat/announcement
Authorization: Bearer {school_access_token}

{
  "class_id": "10A",
  // OR
  "school_wide": true,

  "title": "Parent-Teacher Meeting",
  "content": "...",
  "event_date": "2025-02-10",
  "attachments": [...]
}
```

### For Peeap App

#### Get Parent's School Threads
```
GET /api/school/threads
Authorization: Bearer {user_token}

Response:
{
  "threads": [
    {
      "id": "uuid",
      "school_name": "Freetown Secondary School",
      "school_logo_url": "...",
      "is_verified": true,
      "thread_type": "direct",
      "last_message": "...",
      "last_message_at": "...",
      "unread_count": 3,
      "children": [
        {"nsi": "SL-2025-02-00368", "name": "John Doe"}
      ]
    }
  ]
}
```

#### Get Thread Messages
```
GET /api/school/threads/{thread_id}/messages
Authorization: Bearer {user_token}

Response:
{
  "messages": [
    {
      "id": "uuid",
      "sender_type": "school",
      "sender_name": "Mrs. Smith",
      "sender_role": "Class Teacher",
      "message_type": "invoice",
      "content": "...",
      "rich_content": {...},
      "created_at": "...",
      "is_verified": true
    }
  ]
}
```

#### Send Message (Parent Reply)
```
POST /api/school/threads/{thread_id}/messages
Authorization: Bearer {user_token}

{
  "content": "Thank you, I will pay today."
}
```

#### Mark Messages as Read
```
POST /api/school/threads/{thread_id}/read
Authorization: Bearer {user_token}
```

---

## Chat UI Components

### School Message Bubble (Verified)

```
┌─────────────────────────────────────────────────┐
│  🏫 ✓ Freetown Secondary School                 │  ← Verified badge
│  Mrs. Smith • Class Teacher                     │  ← Sender info
├─────────────────────────────────────────────────┤
│                                                 │
│  [Message content or invoice card here]         │
│                                                 │
├─────────────────────────────────────────────────┤
│  10:30 AM                              ✓✓ Read  │
└─────────────────────────────────────────────────┘
```

### Invoice Card in Chat

```
┌─────────────────────────────────────────────────┐
│  📋 FEE INVOICE                                 │
├─────────────────────────────────────────────────┤
│  Student: John Doe (SL-2025-02-00368)           │
│  Class: Grade 10A                               │
├─────────────────────────────────────────────────┤
│  Tuition Fee                      SLE 300,000   │
│  Library Fee                       SLE 50,000   │
│  Lab Fee                          SLE 100,000   │
├─────────────────────────────────────────────────┤
│  TOTAL DUE                        SLE 450,000   │
│  Due: Feb 15, 2025                              │
├─────────────────────────────────────────────────┤
│         [ Pay Now ]    [ View Details ]         │
└─────────────────────────────────────────────────┘
```

---

## Webhook Notifications

School SaaS can receive webhooks for:

```
POST {school_webhook_url}

{
  "event": "parent.message.sent",
  "data": {
    "thread_id": "uuid",
    "message_id": "uuid",
    "parent_id": "school_parent_id",
    "content": "...",
    "sent_at": "..."
  }
}
```

Events:
- `parent.connected` - Parent connected Peeap wallet
- `parent.message.sent` - Parent sent a message
- `payment.completed` - Parent paid a fee
- `payment.failed` - Payment failed

---

## Security Considerations

1. **Verified Badge**: Only school messages through official integration get verified badge
2. **RLS Policies**: Parents can only see their own threads
3. **School Authentication**: Schools must use valid OAuth tokens
4. **Message Signing**: Consider signing school messages for extra verification
5. **Rate Limiting**: Limit message frequency to prevent spam
