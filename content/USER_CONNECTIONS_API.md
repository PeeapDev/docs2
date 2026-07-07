# User Connections API Documentation

Base URL: `https://api.peeap.com/api/v1`

This API enables friend/connection requests between Peeap users, providing privacy controls for the chat system.

---

## 1. Send Connection Request

Send a friend/connection request to another user.

```
POST /connections/request
```

**Request Body:**
```json
{
  "requester_id": "uuid-of-sender",
  "requester_name": "John Doe",
  "requester_avatar_url": "https://example.com/avatar.jpg",
  "recipient_id": "uuid-of-recipient",
  "recipient_name": "Jane Smith",
  "recipient_avatar_url": "https://example.com/avatar2.jpg",
  "request_message": "Hi! I'd like to connect with you."
}
```

**Required Fields:**
- `requester_id` - UUID of the user sending the request
- `recipient_id` - UUID of the user receiving the request

**Optional Fields:**
- `requester_name` - Display name of requester
- `requester_avatar_url` - Avatar URL of requester
- `recipient_name` - Display name of recipient
- `recipient_avatar_url` - Avatar URL of recipient
- `request_message` - Optional message with the request

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "connection-uuid",
    "requester_id": "uuid",
    "recipient_id": "uuid",
    "status": "pending",
    "requested_at": "2025-01-31T12:00:00Z"
  }
}
```

**Error Responses:**
- `400` - Missing required fields
- `409` - Connection request already exists
- `500` - Server error

---

## 2. Get My Connections

Get all accepted connections for a user.

```
GET /connections?user_id={userId}
```

**Query Parameters:**
- `user_id` - UUID of the user

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "connection-uuid",
      "requester_id": "uuid",
      "requester_name": "John Doe",
      "requester_avatar_url": "https://...",
      "recipient_id": "uuid",
      "recipient_name": "Jane Smith",
      "recipient_avatar_url": "https://...",
      "status": "accepted",
      "requested_at": "2025-01-31T12:00:00Z",
      "responded_at": "2025-01-31T12:05:00Z"
    }
  ]
}
```

---

## 3. Get Pending Connection Requests

Get all pending requests received by a user.

```
GET /connections/pending?user_id={userId}
```

**Query Parameters:**
- `user_id` - UUID of the user (recipient)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "connection-uuid",
      "requester_id": "uuid",
      "requester_name": "John Doe",
      "requester_avatar_url": "https://...",
      "request_message": "Hi! I'd like to connect.",
      "status": "pending",
      "requested_at": "2025-01-31T12:00:00Z"
    }
  ]
}
```

---

## 4. Check Connection Status

Check the connection status between two users.

```
GET /connections/status?user1_id={user1}&user2_id={user2}
```

**Query Parameters:**
- `user1_id` - UUID of first user
- `user2_id` - UUID of second user

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "status": "accepted",
    "connection_id": "uuid",
    "is_requester": true,
    "requested_at": "2025-01-31T12:00:00Z"
  }
}
```

**If no connection exists:**
```json
{
  "success": true,
  "data": {
    "connected": false,
    "status": null
  }
}
```

---

## 5. Accept Connection Request

Accept a pending connection request.

```
POST /connections/accept
```

**Request Body:**
```json
{
  "connection_id": "uuid-of-connection-request"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "connection-uuid",
    "status": "accepted",
    "responded_at": "2025-01-31T12:05:00Z"
  }
}
```

**Error Responses:**
- `400` - Missing connection_id
- `404` - Connection request not found
- `500` - Server error

---

## 6. Reject Connection Request

Reject a pending connection request.

```
POST /connections/reject
```

**Request Body:**
```json
{
  "connection_id": "uuid-of-connection-request"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "connection-uuid",
    "status": "rejected",
    "responded_at": "2025-01-31T12:05:00Z"
  }
}
```

---

## 7. Block User

Block a user (prevents future connection requests).

```
POST /connections/block
```

**Request Body:**
```json
{
  "blocker_id": "uuid-of-user-blocking",
  "blocked_id": "uuid-of-user-to-block"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "connection-uuid",
    "status": "blocked"
  }
}
```

---

## Example Integration (TypeScript)

```typescript
const PEEAP_API = 'https://api.peeap.com/api/v1';

// Send connection request
async function sendConnectionRequest(
  requesterId: string,
  requesterName: string,
  recipientId: string,
  recipientName: string,
  message?: string
) {
  const response = await fetch(`${PEEAP_API}/connections/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requester_id: requesterId,
      requester_name: requesterName,
      recipient_id: recipientId,
      recipient_name: recipientName,
      request_message: message,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.data;
}

// Check if users are connected (before allowing chat)
async function checkConnection(user1Id: string, user2Id: string) {
  const response = await fetch(
    `${PEEAP_API}/connections/status?user1_id=${user1Id}&user2_id=${user2Id}`
  );

  const data = await response.json();
  return data.data;
}

// Get pending requests for notification badge
async function getPendingRequests(userId: string) {
  const response = await fetch(
    `${PEEAP_API}/connections/pending?user_id=${userId}`
  );

  const data = await response.json();
  return data.data;
}

// Accept a connection request
async function acceptRequest(connectionId: string) {
  const response = await fetch(`${PEEAP_API}/connections/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection_id: connectionId }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.data;
}

// Usage in chat initiation
async function canInitiateChat(currentUserId: string, targetUserId: string): Promise<boolean> {
  const status = await checkConnection(currentUserId, targetUserId);
  return status.connected && status.status === 'accepted';
}

// Usage example
async function startChatWithUser(currentUser: any, targetUser: any) {
  const canChat = await canInitiateChat(currentUser.id, targetUser.id);

  if (canChat) {
    // Proceed to chat
    openChatWindow(targetUser.id);
  } else {
    // Show connection request UI
    const status = await checkConnection(currentUser.id, targetUser.id);

    if (status.status === 'pending') {
      if (status.is_requester) {
        showMessage('Connection request pending. Waiting for response.');
      } else {
        showMessage('This user wants to connect with you. Accept to start chatting.');
      }
    } else if (status.status === 'blocked') {
      showMessage('You cannot connect with this user.');
    } else {
      // No connection exists - show send request button
      showSendRequestButton(targetUser);
    }
  }
}
```

---

## Chat Integration Flow

1. **User searches for another Peeap user**
2. **Check connection status** using `/connections/status`
3. **If not connected:**
   - Show "Send Connection Request" button
   - User sends request with optional message
4. **Recipient receives notification** of pending request
5. **Recipient accepts/rejects** the request
6. **If accepted:** Both users can now chat freely
7. **If rejected/blocked:** Cannot initiate chat

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 400 | Missing required fields | Request is missing requester_id or recipient_id |
| 404 | Connection not found | The connection_id doesn't exist |
| 409 | Connection already exists | A connection request already exists between these users |
| 500 | Server error | Internal server error |

---

## Status Values

| Status | Description |
|--------|-------------|
| `pending` | Request sent, awaiting response |
| `accepted` | Request accepted, users can chat |
| `rejected` | Request rejected |
| `blocked` | User has been blocked |
