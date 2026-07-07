# School OAuth Integration Guide

**Version:** 2.0
**Last Updated:** January 13, 2026
**For:** SDSL School Management System Integration

> ✅ **This OAuth authorization-code flow is REAL and current** — verified against
> `apps/web` (the `/auth/authorize` consent page, `OAuthAuthorizePage.tsx`) and the
> API (`POST /api/oauth/token`, router.ts). Use OAuth when you need to **link a
> Peeap account or act on a user's wallet with consent** (scopes `school:connect`,
> `wallet:read`, `wallet:write`).
>
> 📌 **Two fixes to apply when following this doc:**
> 1. **Token URL:** use `https://api.peeap.com/api/oauth/token` — **not**
>    `/api/v1/oauth/token`. The API path normalizer strips only `/api`, so the
>    `/v1/` segment breaks the route match.
> 2. If you only need to **collect a fee** (not link an account), you don't need
>    OAuth at all — use `POST /api/payments/initiate` instead. See the
>    [Integration Guide → School fees recipe](../docs/guide/recipe-school-fees.mdx).

---

## Table of Contents

1. [OAuth 2.0 Flow Overview](#1-oauth-20-flow-overview)
2. [Step 1: School Redirects to Peeap](#2-step-1-school-redirects-to-peeap)
3. [Step 2: User Authentication on Peeap](#3-step-2-user-authentication-on-peeap)
4. [Step 3: User Authorization](#4-step-3-user-authorization)
5. [Step 4: Redirect Back to School](#5-step-4-redirect-back-to-school)
6. [Step 5: Token Exchange](#6-step-5-token-exchange)
7. [Token Refresh](#7-token-refresh)
8. [Complete Flow Diagrams](#8-complete-flow-diagrams)
9. [Error Handling](#9-error-handling)
10. [Testing](#10-testing)

---

## 1. OAuth 2.0 Flow Overview

The integration uses OAuth 2.0 Authorization Code flow:

```
┌─────────────┐                                    ┌─────────────┐
│   School    │                                    │   Peeap     │
│   System    │                                    │   (my.peeap │
│             │                                    │    .com)    │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. Redirect to /auth/authorize                  │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │                        2. User logs in (if needed)
       │                        3. User sees authorization page
       │                        4. User clicks "Authorize"
       │                                                  │
       │  5. Redirect back with ?code=xxx&state=xxx       │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  6. POST /api/v1/oauth/token (exchange code)     │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │  7. Return access_token + refresh_token          │
       │<─────────────────────────────────────────────────│
       │                                                  │
```

---

## 2. Step 1: School Redirects to Peeap

When a school admin wants to connect to Peeap, redirect them to the Peeap authorization page.

### Authorization URL

```
https://my.peeap.com/auth/authorize
    ?response_type=code
    &client_id=school_saas
    &redirect_uri=https://{subdomain}.gov.school.edu.sl/peeap-settings/callback
    &scope=school:connect school:manage wallet:read
    &state={random_csrf_token}
    &school_id={school_id}
    &user_type=admin
```

### URL Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `response_type` | Yes | Must be `code` | `code` |
| `client_id` | Yes | OAuth client ID | `school_saas` |
| `redirect_uri` | Yes | Callback URL (must be registered) | `https://gss.gov.school.edu.sl/peeap-settings/callback` |
| `scope` | Yes | Space-separated permissions | `school:connect school:manage wallet:read` |
| `state` | Recommended | CSRF protection token | `abc123xyz` |
| `school_id` | Optional | School's database ID | `1` |
| `user_type` | Optional | Type of user | `admin`, `student`, `parent` |
| `index_number` | Optional | Student index (for student flow) | `SL-2025-02-00368` |
| `student_name` | Optional | Student name (for display) | `John Doe` |

### Available Scopes

| Scope | Description |
|-------|-------------|
| `profile` | Access basic profile (name, email) |
| `email` | View email address |
| `phone` | View phone number |
| `wallet:read` | View wallet balance and transactions |
| `wallet:write` | Make payments and transfers |
| `school:connect` | Connect school to Peeap |
| `school:manage` | Manage school settings and vendors |
| `student:sync` | Sync student data |
| `fee:pay` | Pay fees on behalf of students |
| `transactions:read` | View transaction history |

### Example: PHP Redirect Code

```php
<?php
// In your school's Peeap settings page

function redirectToPeeapAuth() {
    $state = bin2hex(random_bytes(16)); // Generate CSRF token
    $_SESSION['oauth_state'] = $state;  // Store for validation

    $params = http_build_query([
        'response_type' => 'code',
        'client_id' => 'school_saas',
        'redirect_uri' => 'https://' . $_SERVER['HTTP_HOST'] . '/peeap-settings/callback',
        'scope' => 'school:connect school:manage wallet:read',
        'state' => $state,
        'school_id' => get_current_school_id(),
        'user_type' => 'admin',
    ]);

    header('Location: https://my.peeap.com/auth/authorize?' . $params);
    exit;
}
```

---

## 3. Step 2: User Authentication on Peeap

When the user arrives at `https://my.peeap.com/auth/authorize`:

### If User is NOT Logged In

1. User is redirected to the Peeap login page
2. Login URL includes return parameter: `/login?redirect=/auth/authorize?client_id=...`
3. User can:
   - **Login** with existing Peeap account (email + password)
   - **Create Account** if they don't have one
4. After successful login, user is redirected back to authorization page

### If User IS Already Logged In

1. User goes directly to the authorization page
2. Sees the authorization consent screen

### Login Page URL Format

If you need to deep-link directly to login with redirect:

```
https://my.peeap.com/login?redirect={encoded_authorize_url}
```

Example:
```
https://my.peeap.com/login?redirect=%2Fauth%2Fauthorize%3Fresponse_type%3Dcode%26client_id%3Dschool_saas%26...
```

---

## 4. Step 3: User Authorization

Once logged in, the user sees the authorization consent screen:

### What User Sees

```
┌────────────────────────────────────────────┐
│         Authorize Application              │
│                                            │
│  [School Logo]                             │
│  Government Secondary School               │
│  gov.school.edu.sl                         │
│                                            │
│  This application will be able to:         │
│                                            │
│  ✓ Connect School                          │
│    Connect your school to Peeap Pay        │
│                                            │
│  ✓ Manage School                           │
│    Manage school settings and vendors      │
│                                            │
│  ✓ View Wallet                             │
│    View wallet balance and transactions    │
│                                            │
│  ⚠ Only authorize applications you trust   │
│                                            │
│  [  Deny  ]              [ Authorize ]     │
│                                            │
│  Signed in as admin@school.edu.sl          │
└────────────────────────────────────────────┘
```

### User Actions

1. **Authorize**: Generates authorization code, redirects to school
2. **Deny**: Redirects to school with error

---

## 5. Step 4: Redirect Back to School

After user clicks "Authorize" or "Deny", they are redirected back to the school's `redirect_uri`.

### Success Redirect (User Authorized)

```
https://{subdomain}.gov.school.edu.sl/peeap-settings/callback
    ?code={authorization_code}
    &state={csrf_token}
```

**Example:**
```
https://gss.gov.school.edu.sl/peeap-settings/callback?code=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6&state=abc123xyz
```

### Error Redirect (User Denied or Error)

```
https://{subdomain}.gov.school.edu.sl/peeap-settings/callback
    ?error={error_code}
    &error_description={human_readable_message}
    &state={csrf_token}
```

**Example:**
```
https://gss.gov.school.edu.sl/peeap-settings/callback?error=access_denied&error_description=User%20denied%20the%20authorization%20request&state=abc123xyz
```

### Error Codes

| Error | Description |
|-------|-------------|
| `access_denied` | User clicked "Deny" |
| `invalid_request` | Missing or invalid parameters |
| `unauthorized_client` | Client ID not recognized |
| `invalid_scope` | Requested scope not allowed |
| `server_error` | Internal server error |

### Callback Handler Code (PHP)

```php
<?php
// File: /peeap-settings/callback.php

// 1. Verify state to prevent CSRF
if ($_GET['state'] !== $_SESSION['oauth_state']) {
    die('Invalid state - possible CSRF attack');
}

// 2. Check for errors
if (isset($_GET['error'])) {
    $error = $_GET['error'];
    $description = $_GET['error_description'] ?? 'Unknown error';

    // Handle error (show message, log, etc.)
    redirect('/peeap-settings?error=' . urlencode($description));
    exit;
}

// 3. Extract authorization code
$code = $_GET['code'];
if (empty($code)) {
    die('No authorization code received');
}

// 4. Exchange code for tokens (see next section)
$tokens = exchangeCodeForTokens($code);

// 5. Store tokens and redirect to success page
if ($tokens) {
    saveSchoolPeeapConnection($tokens);
    redirect('/peeap-settings?success=1');
} else {
    redirect('/peeap-settings?error=token_exchange_failed');
}
```

---

## 6. Step 5: Token Exchange

After receiving the authorization code, exchange it for access and refresh tokens.

### Token Endpoint

```
POST https://api.peeap.com/api/v1/oauth/token
Content-Type: application/json
```

### Request Body

```json
{
    "grant_type": "authorization_code",
    "client_id": "school_saas",
    "client_secret": "peeap_school_integration_2024_sl",
    "code": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "redirect_uri": "https://gss.gov.school.edu.sl/peeap-settings/callback"
}
```

### Success Response (200 OK)

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "scope": "school:connect school:manage wallet:read",
    "user": {
        "peeap_id": "usr_abc123",
        "email": "admin@school.edu.sl"
    },
    "school_connection": {
        "peeap_school_id": "sch_xyz789"
    }
}
```

### Error Response (401 Unauthorized)

```json
{
    "error": "invalid_grant",
    "error_description": "Authorization code expired or invalid"
}
```

### Token Exchange Code (PHP)

```php
<?php
function exchangeCodeForTokens($code) {
    $url = 'https://api.peeap.com/api/v1/oauth/token';

    $data = [
        'grant_type' => 'authorization_code',
        'client_id' => 'school_saas',
        'client_secret' => 'peeap_school_integration_2024_sl',
        'code' => $code,
        'redirect_uri' => 'https://' . $_SERVER['HTTP_HOST'] . '/peeap-settings/callback',
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        error_log('Token exchange failed: ' . $response);
        return null;
    }

    return json_decode($response, true);
}
```

### Token Storage

Store these securely in your database:

```sql
-- School connections table
CREATE TABLE school_peeap_connections (
    id INT PRIMARY KEY AUTO_INCREMENT,
    school_id INT NOT NULL,
    peeap_school_id VARCHAR(50),
    peeap_user_id VARCHAR(50),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at DATETIME NOT NULL,
    scope VARCHAR(500),
    connected_by INT,  -- User who authorized
    connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,

    UNIQUE KEY (school_id),
    INDEX (peeap_school_id)
);
```

---

## 7. Token Refresh

Access tokens expire after 1 hour. Use the refresh token to get new tokens.

### Refresh Token Endpoint

```
POST https://api.peeap.com/api/v1/oauth/token
Content-Type: application/json
```

### Request Body

```json
{
    "grant_type": "refresh_token",
    "client_id": "school_saas",
    "client_secret": "peeap_school_integration_2024_sl",
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

### Success Response (200 OK)

```json
{
    "access_token": "new_access_token_here...",
    "refresh_token": "new_refresh_token_here...",
    "expires_in": 3600,
    "token_type": "Bearer"
}
```

### Auto-Refresh Code (PHP)

```php
<?php
function getValidAccessToken($schoolId) {
    $connection = getSchoolPeeapConnection($schoolId);

    if (!$connection) {
        throw new Exception('School not connected to Peeap');
    }

    // Check if token is expired (with 5 minute buffer)
    $expiresAt = new DateTime($connection['token_expires_at']);
    $now = new DateTime();
    $now->modify('+5 minutes');

    if ($now >= $expiresAt) {
        // Token expired or about to expire, refresh it
        $newTokens = refreshAccessToken($connection['refresh_token']);

        if (!$newTokens) {
            // Refresh failed, need to re-authorize
            throw new Exception('Token refresh failed. Please reconnect to Peeap.');
        }

        // Update stored tokens
        updateSchoolPeeapConnection($schoolId, $newTokens);

        return $newTokens['access_token'];
    }

    return $connection['access_token'];
}

function refreshAccessToken($refreshToken) {
    $url = 'https://api.peeap.com/api/v1/oauth/token';

    $data = [
        'grant_type' => 'refresh_token',
        'client_id' => 'school_saas',
        'client_secret' => 'peeap_school_integration_2024_sl',
        'refresh_token' => $refreshToken,
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    return json_decode($response, true);
}
```

---

## 8. Complete Flow Diagrams

### Admin Connection Flow

```
School Admin                    School Server                   Peeap (my.peeap.com)              Peeap API
    │                               │                                   │                           │
    │ 1. Click "Connect to Peeap"   │                                   │                           │
    │──────────────────────────────>│                                   │                           │
    │                               │                                   │                           │
    │                               │ 2. Generate state, redirect       │                           │
    │<─────────────────────────────────────────────────────────────────>│                           │
    │                               │                                   │                           │
    │ 3. User sees login page (if not logged in)                        │                           │
    │                               │                                   │                           │
    │ 4. User logs in or creates account                                │                           │
    │──────────────────────────────────────────────────────────────────>│                           │
    │                               │                                   │                           │
    │ 5. User sees authorization page                                   │                           │
    │                               │                                   │                           │
    │ 6. User clicks "Authorize"                                        │                           │
    │──────────────────────────────────────────────────────────────────>│                           │
    │                               │                                   │                           │
    │ 7. Redirect to callback with code                                 │                           │
    │<─────────────────────────────────────────────────────────────────-│                           │
    │                               │                                   │                           │
    │                               │ 8. Validate state                 │                           │
    │                               │                                   │                           │
    │                               │ 9. Exchange code for tokens       │                           │
    │                               │──────────────────────────────────────────────────────────────>│
    │                               │                                   │                           │
    │                               │ 10. Return access_token           │                           │
    │                               │<──────────────────────────────────────────────────────────────│
    │                               │                                   │                           │
    │                               │ 11. Store tokens                  │                           │
    │                               │                                   │                           │
    │ 12. Show success message      │                                   │                           │
    │<──────────────────────────────│                                   │                           │
    │                               │                                   │                           │
```

### Student Wallet Link Flow

```
Parent/Student                  School Server                   Peeap (my.peeap.com)
    │                               │                                   │
    │ 1. Click "Link Peeap Wallet"  │                                   │
    │──────────────────────────────>│                                   │
    │                               │                                   │
    │                               │ 2. Redirect with index_number     │
    │<─────────────────────────────────────────────────────────────────>│
    │                               │                                   │
    │ 3. Login/Register on Peeap    │                                   │
    │──────────────────────────────────────────────────────────────────>│
    │                               │                                   │
    │ 4. Authorize "Link Wallet"    │                                   │
    │──────────────────────────────────────────────────────────────────>│
    │                               │                                   │
    │ 5. Redirect with code         │                                   │
    │<─────────────────────────────────────────────────────────────────-│
    │                               │                                   │
    │                               │ 6. Exchange code + link wallet    │
    │                               │                                   │
    │ 7. Wallet linked!             │                                   │
    │<──────────────────────────────│                                   │
```

---

## 9. Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid_client` | Wrong client_id or secret | Verify credentials |
| `invalid_grant` | Code expired (>10 min) | Start OAuth flow again |
| `invalid_redirect_uri` | URI not registered | Check exact URI match |
| `access_denied` | User clicked Deny | Show friendly message |
| `server_error` | Peeap server issue | Retry or contact support |

### Handling Token Expiry

```php
<?php
function makeAuthorizedRequest($schoolId, $endpoint, $data = null) {
    try {
        $accessToken = getValidAccessToken($schoolId);
    } catch (Exception $e) {
        // Token refresh failed, need to re-authorize
        markSchoolDisconnected($schoolId);
        throw new Exception('Please reconnect your school to Peeap');
    }

    // Make API request with token
    $headers = [
        'Authorization: Bearer ' . $accessToken,
        'Content-Type: application/json',
    ];

    // ... make request
}
```

---

## 10. Testing

### Test Credentials

```
Client ID: school_saas
Client Secret: peeap_school_integration_2024_sl
```

### Test Flow

1. **Start Authorization:**
   ```
   https://my.peeap.com/auth/authorize?response_type=code&client_id=school_saas&redirect_uri=https://test.gov.school.edu.sl/peeap-settings/callback&scope=school:connect%20school:manage&state=test123
   ```

2. **Create Test Account** (if needed) on my.peeap.com

3. **Authorize** the application

4. **Check Callback** - You should receive:
   ```
   https://test.gov.school.edu.sl/peeap-settings/callback?code=xxx&state=test123
   ```

5. **Exchange Token:**
   ```bash
   curl -X POST https://api.peeap.com/api/v1/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "grant_type": "authorization_code",
       "client_id": "school_saas",
       "client_secret": "peeap_school_integration_2024_sl",
       "code": "YOUR_CODE_HERE",
       "redirect_uri": "https://test.gov.school.edu.sl/peeap-settings/callback"
     }'
   ```

### Test with localhost (Development)

For local testing, you can use localhost redirect URIs:

```
redirect_uri=http://localhost:8080/peeap-settings/callback
```

---

## Quick Reference

### URLs Summary

| Purpose | URL |
|---------|-----|
| Authorization | `https://my.peeap.com/auth/authorize` |
| Token Exchange | `https://api.peeap.com/api/v1/oauth/token` |
| Wallet Balance | `https://api.peeap.com/api/v1/school/wallets/{id}/balance` |
| Payment Authorize | `https://api.peeap.com/api/v1/payments/authorize` |

### Required Headers

```
Authorization: Bearer {access_token}
Content-Type: application/json
X-School-ID: {school_id}  (optional)
```

---

## Support

**Technical Issues:** api@peeap.com
**Integration Help:** schools@peeap.com

---

*End of Document*
