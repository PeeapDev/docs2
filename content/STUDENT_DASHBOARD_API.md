# Student Dashboard API Documentation

Base URL: `https://api.peeap.com/api/v1`

This document covers the APIs for the Student Dashboard including Chat, Wallet Top-up, and Connections.

---

## 1. Chat API

### 1.1 Widget Session - Initialize Chat

Before using chat, initialize a widget session.

```
POST /widget/sessions
```

**Request Body:**
```json
{
  "platform_id": "your-platform-id",
  "visitor_name": "Ahmed Sahid Alex Kabba",
  "visitor_email": "student@example.com",
  "metadata": {
    "nsi": "SL-2025-02-00406",
    "school_id": "sch_900e6e7f"
  }
}
```

**Success Response (201):**
```json
{
  "sessionToken": "ws_xxx...",
  "sessionId": "uuid",
  "expiresAt": "2025-02-01T12:00:00Z"
}
```

### 1.2 Get Conversations

```
GET /widget/conversations
```

**Headers:**
```
X-Widget-Session: {sessionToken}
```

**Success Response (200):**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "type": "general",
      "subject": "Chat from app",
      "status": "open",
      "participantIds": ["uuid"],
      "lastMessage": {
        "id": "uuid",
        "content": "Hello!",
        "createdAt": "2025-01-31T12:00:00Z"
      },
      "lastMessageAt": "2025-01-31T12:00:00Z",
      "unreadCount": 0,
      "createdAt": "2025-01-31T11:00:00Z"
    }
  ]
}
```

### 1.3 Start New Conversation

```
POST /widget/conversations
```

**Headers:**
```
X-Widget-Session: {sessionToken}
```

**Request Body:**
```json
{
  "targetUserId": "uuid-of-recipient",
  "subject": "Question about fees",
  "message": "Hi, I have a question about my school fees."
}
```

**Success Response (200):**
```json
{
  "conversation": {
    "id": "uuid",
    "type": "general",
    "subject": "Question about fees",
    "status": "open",
    "participantIds": ["uuid"],
    "createdAt": "2025-01-31T12:00:00Z"
  }
}
```

### 1.4 Get Messages

```
GET /widget/conversations/{conversationId}/messages
```

**Headers:**
```
X-Widget-Session: {sessionToken}
```

**Query Parameters:**
- `cursor` - Pagination cursor (optional)
- `limit` - Number of messages (default: 50, max: 100)

**Success Response (200):**
```json
{
  "messages": [
    {
      "id": "uuid",
      "content": "Hello!",
      "senderType": "user",
      "senderName": "Ahmed",
      "createdAt": "2025-01-31T12:00:00Z"
    }
  ],
  "hasMore": false,
  "cursor": null
}
```

### 1.5 Send Message

```
POST /widget/conversations/{conversationId}/messages
```

**Headers:**
```
X-Widget-Session: {sessionToken}
```

**Request Body:**
```json
{
  "content": "Hello, I need help with my fees."
}
```

**Success Response (201):**
```json
{
  "message": {
    "id": "uuid",
    "content": "Hello, I need help with my fees.",
    "senderType": "anonymous",
    "senderName": "Ahmed",
    "createdAt": "2025-01-31T12:00:00Z"
  }
}
```

### 1.6 Poll for New Messages

For real-time updates without WebSocket.

```
GET /widget/conversations/{conversationId}/messages/poll?since={timestamp}
```

**Headers:**
```
X-Widget-Session: {sessionToken}
```

**Query Parameters:**
- `since` - ISO timestamp to get messages after

**Success Response (200):**
```json
{
  "messages": [
    {
      "id": "uuid",
      "content": "New message",
      "senderType": "user",
      "senderName": "School Admin",
      "createdAt": "2025-01-31T12:05:00Z"
    }
  ]
}
```

---

## 2. Contacts Search API

Search for Peeap users with AJAX-style search, including connection status.

### 2.1 Search Contacts

```
GET /contacts/search?q={query}&user_id={userId}
```

**Query Parameters:**
- `q` - Search query (min 2 characters) - searches name, email, phone
- `user_id` - Current user's ID
- `limit` - Max results (default: 20, max: 50)

**Success Response (200):**
```json
{
  "success": true,
  "contacts": [
    {
      "id": "user-uuid",
      "name": "John Doe",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "23276123456",
      "avatarUrl": "https://...",
      "connectionStatus": "accepted",
      "connectionId": "conn-uuid",
      "isConnected": true,
      "isPending": false,
      "isBlocked": false,
      "canChat": true,
      "canSendRequest": false,
      "awaitingResponse": false,
      "hasRequestFromThem": false
    }
  ],
  "total": 1
}
```

**Connection Status Values:**
| Field | Description |
|-------|-------------|
| `isConnected` | Users are friends, can chat |
| `isPending` | Connection request exists |
| `canChat` | Can start conversation |
| `canSendRequest` | No connection exists yet |
| `awaitingResponse` | User sent request, waiting for response |
| `hasRequestFromThem` | Other user sent request, can accept/reject |

### 2.2 Get Connected Contacts (Friends List)

```
GET /contacts/connected?user_id={userId}
```

**Success Response (200):**
```json
{
  "success": true,
  "contacts": [
    {
      "id": "user-uuid",
      "connectionId": "conn-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "avatarUrl": "https://...",
      "connectedAt": "2025-01-31T12:00:00Z",
      "threadId": "thread-uuid",
      "lastMessageAt": "2025-01-31T14:00:00Z",
      "lastMessage": "Hey, how are you?",
      "hasThread": true
    }
  ],
  "total": 1
}
```

---

## 3. User Connections API (Friend Requests)

Before chatting with ANY Peeap user outside your school, a connection must be established.

### 2.1 Check Connection Status

```
GET /connections/status?user1_id={myUserId}&user2_id={targetUserId}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "status": "accepted",
    "connection_id": "uuid",
    "is_requester": true
  }
}
```

### 2.2 Send Connection Request

```
POST /connections/request
```

**Request Body:**
```json
{
  "requester_id": "my-user-id",
  "requester_name": "Ahmed Sahid",
  "recipient_id": "target-user-id",
  "recipient_name": "John Doe",
  "request_message": "Hi! I'd like to connect with you."
}
```

### 2.3 Get Pending Requests

```
GET /connections/pending?user_id={userId}
```

### 2.4 Accept/Reject Request

```
POST /connections/accept
POST /connections/reject
```

**Request Body:**
```json
{
  "connection_id": "uuid"
}
```

---

## 3. Wallet Top-up API (Monime Mobile Money)

### 3.1 Initiate Deposit

Creates a Monime checkout session for mobile money deposit.

```
POST /monime/deposit
```

**Request Body:**
```json
{
  "walletId": "student-wallet-uuid",
  "amount": 5000,
  "currency": "SLE",
  "description": "Top-up for Ahmed's wallet"
}
```

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

**Usage Flow:**
1. Call this endpoint to get `paymentUrl`
2. Open `paymentUrl` in new browser tab/popup
3. User completes payment on Monime page
4. Poll for completion using `/transactions/status`
5. Wallet is credited automatically

### 3.2 Check Transaction Status

Poll this endpoint to check if deposit completed.

```
GET /transactions/status?reference={monimeSessionId}
```

**Success Response (200):**
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
| Status | Description |
|--------|-------------|
| `PENDING` | Payment not yet confirmed |
| `COMPLETED` | Payment successful, wallet credited |
| `FAILED` | Payment failed |
| `EXPIRED` | Payment session expired |

---

## 4. Complete Integration Example (TypeScript)

```typescript
const API_BASE = 'https://api.peeap.com/api/v1';

class StudentDashboardService {
  private sessionToken: string | null = null;

  // ============================================
  // CHAT INTEGRATION
  // ============================================

  async initializeChat(userId: string, userName: string): Promise<string> {
    const response = await fetch(`${API_BASE}/widget/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_id: 'school-saas-platform',
        visitor_name: userName,
        metadata: { user_id: userId }
      })
    });

    const data = await response.json();
    this.sessionToken = data.sessionToken;
    return data.sessionToken;
  }

  async getConversations() {
    const response = await fetch(`${API_BASE}/widget/conversations`, {
      headers: { 'X-Widget-Session': this.sessionToken! }
    });
    return response.json();
  }

  async sendMessage(conversationId: string, content: string) {
    const response = await fetch(
      `${API_BASE}/widget/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Session': this.sessionToken!
        },
        body: JSON.stringify({ content })
      }
    );
    return response.json();
  }

  async pollMessages(conversationId: string, since: string) {
    const response = await fetch(
      `${API_BASE}/widget/conversations/${conversationId}/messages/poll?since=${since}`,
      { headers: { 'X-Widget-Session': this.sessionToken! } }
    );
    return response.json();
  }

  // ============================================
  // CONNECTION/FRIEND REQUEST
  // ============================================

  async checkConnection(myUserId: string, targetUserId: string) {
    const response = await fetch(
      `${API_BASE}/connections/status?user1_id=${myUserId}&user2_id=${targetUserId}`
    );
    return response.json();
  }

  async sendConnectionRequest(
    myUserId: string,
    myName: string,
    targetUserId: string,
    targetName: string,
    message?: string
  ) {
    const response = await fetch(`${API_BASE}/connections/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requester_id: myUserId,
        requester_name: myName,
        recipient_id: targetUserId,
        recipient_name: targetName,
        request_message: message
      })
    });
    return response.json();
  }

  async getPendingRequests(userId: string) {
    const response = await fetch(
      `${API_BASE}/connections/pending?user_id=${userId}`
    );
    return response.json();
  }

  async acceptConnection(connectionId: string) {
    const response = await fetch(`${API_BASE}/connections/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connection_id: connectionId })
    });
    return response.json();
  }

  // ============================================
  // WALLET TOP-UP
  // ============================================

  async initiateTopup(walletId: string, amount: number) {
    const response = await fetch(`${API_BASE}/monime/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletId,
        amount,
        currency: 'SLE'
      })
    });

    const data = await response.json();

    // Open payment page in new tab
    window.open(data.paymentUrl, '_blank');

    return data.monimeSessionId;
  }

  async pollPaymentStatus(sessionId: string): Promise<'COMPLETED' | 'FAILED' | 'EXPIRED'> {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes at 5-second intervals

      const poll = async () => {
        attempts++;

        try {
          const response = await fetch(
            `${API_BASE}/transactions/status?reference=${sessionId}`
          );
          const data = await response.json();

          if (data.status === 'COMPLETED') {
            resolve('COMPLETED');
            return;
          }

          if (data.status === 'FAILED') {
            resolve('FAILED');
            return;
          }

          if (data.status === 'EXPIRED') {
            resolve('EXPIRED');
            return;
          }

          if (attempts >= maxAttempts) {
            reject(new Error('Polling timeout'));
            return;
          }

          // Continue polling
          setTimeout(poll, 5000);
        } catch (error) {
          if (attempts >= maxAttempts) {
            reject(error);
          } else {
            setTimeout(poll, 5000);
          }
        }
      };

      poll();
    });
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================

const service = new StudentDashboardService();

// Initialize chat for a student
async function loadChat(userId: string, userName: string) {
  try {
    await service.initializeChat(userId, userName);
    const { conversations } = await service.getConversations();
    console.log('Loaded conversations:', conversations);
    return conversations;
  } catch (error) {
    console.error('Could not load chat:', error);
    throw error;
  }
}

// Top up wallet
async function topUpWallet(walletId: string, amount: number) {
  try {
    const sessionId = await service.initiateTopup(walletId, amount);
    console.log('Payment page opened. Polling for completion...');

    const status = await service.pollPaymentStatus(sessionId);

    if (status === 'COMPLETED') {
      console.log('Top-up successful!');
      return true;
    } else {
      console.log('Top-up failed:', status);
      return false;
    }
  } catch (error) {
    console.error('Top-up error:', error);
    return false;
  }
}

// Start chat with someone (with connection check)
async function startChatWith(myId: string, myName: string, targetId: string, targetName: string) {
  // First check if connected
  const connectionStatus = await service.checkConnection(myId, targetId);

  if (!connectionStatus.data.connected) {
    if (connectionStatus.data.status === 'pending') {
      return { canChat: false, reason: 'Connection request pending' };
    }

    // Send connection request
    await service.sendConnectionRequest(myId, myName, targetId, targetName, 'Hi! Can we chat?');
    return { canChat: false, reason: 'Connection request sent' };
  }

  // Connected - can start chat
  return { canChat: true };
}
```

---

## 5. Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Missing required fields | Request body missing required parameters |
| 401 | Invalid session | Widget session token is invalid or expired |
| 403 | Access denied | Not authorized to access this resource |
| 404 | Not found | Resource (wallet, conversation, etc.) not found |
| 409 | Already exists | Connection request already exists |
| 500 | Server error | Internal server error |

---

## 6. Important Notes

1. **Chat Sessions Expire**: Widget sessions expire after 24 hours. Re-initialize when expired.

2. **Connection Required for External Chat**: Students can search ANY Peeap user, but must send a connection request before chatting with users outside their school.

3. **Mobile Money Flow**: The top-up uses Monime's hosted checkout. Users complete payment on Monime's page, then your app polls for completion.

4. **Polling Interval**: For transaction status, poll every 4-5 seconds. For chat messages, poll every 2-3 seconds when conversation is open.

5. **Currency**: All amounts are in SLE (New Leone). Use whole numbers (e.g., 5000 not 5000.00).
