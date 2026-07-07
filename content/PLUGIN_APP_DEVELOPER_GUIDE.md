# Peeap Plugin App Developer Guide

Build and publish micro-apps that run natively inside the Peeap payment platform.

## Overview

Plugin apps are ESM bundles that export a React component. They render inside the Peeap host app and receive a scoped SDK for accessing platform capabilities like wallets, user profiles, and payments.

## Getting Started

1. **Register as a developer** at `/developer/apps`
2. **Create an app** — set a unique slug, name, category, and description
3. **Build your bundle** — an ESM module exporting a default React component
4. **Include a manifest** — `peeap-manifest.json` in your zip root
5. **Upload & submit** — upload the zip bundle and submit for review
6. **Get published** — once approved, your app appears in the App Store

## Plugin Bundle Structure

```
my-plugin/
├── peeap-manifest.json    # Required manifest
├── index.js               # ESM entry point (default export = React component)
├── icon.svg               # App icon (optional)
└── ... other assets
```

## Manifest Specification (`peeap-manifest.json`)

```json
{
  "manifest_version": 1,
  "app": {
    "id": "com.yourcompany.appname",
    "name": "Your App Name",
    "version": "1.0.0"
  },
  "entry_point": "index.js",
  "permissions": [
    "user:profile:read",
    "wallet:read",
    "wallet:transfer"
  ],
  "navigation": [
    {
      "label": "Your App",
      "icon": "icon.svg",
      "route": "/plugin/your-app-slug"
    }
  ],
  "supabase": {
    "required": false
  },
  "min_peeap_version": "1.0.0"
}
```

### Manifest Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `manifest_version` | number | Yes | Always `1` |
| `app.id` | string | Yes | Unique identifier (reverse-domain notation) |
| `app.name` | string | Yes | Display name |
| `app.version` | string | Yes | Semver version string |
| `entry_point` | string | Yes | Main JS file in the bundle |
| `permissions` | string[] | Yes | List of SDK permissions requested |
| `navigation` | object[] | No | Sidebar navigation entries |
| `supabase.required` | boolean | No | Whether the app needs its own Supabase backend |
| `min_peeap_version` | string | No | Minimum platform version |

## Entry Point

Your `index.js` must export a default React component that receives `{ sdk }`:

```javascript
export default function MyApp({ sdk }) {
  const [user, setUser] = React.useState(null);

  React.useEffect(() => {
    sdk.auth.getCurrentUser().then(setUser);
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Hello, {user?.firstName}!</h1>
    </div>
  );
}
```

## SDK API Reference

### `sdk.auth`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `getCurrentUser()` | `user:profile:read` | `Promise<PeeapUser>` | Get current user profile |
| `getUserId()` | — | `string` | Get current user ID |

**PeeapUser**: `{ id, email, firstName, lastName, phone?, profilePicture? }`

### `sdk.wallet`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `getBalance(currency?)` | `wallet:read` | `Promise<number>` | Get primary wallet balance |
| `listWallets()` | `wallet:read` | `Promise<PeeapWallet[]>` | List all active wallets |
| `requestPayment(request)` | `wallet:transfer` | `Promise<PaymentResult>` | Request a payment (shows confirmation UI) |

**PeeapWallet**: `{ id, currency, balance, wallet_type, status }`

**PaymentRequest**: `{ amount, currency, description, metadata? }`

**PaymentResult**: `{ success, transactionId?, error? }`

### `sdk.storage`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `getClient()` | — | `SupabaseClient \| null` | Get the plugin's own Supabase client |

Only available if your app provided Supabase credentials during registration.

### `sdk.navigation`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `navigate(path)` | — | `void` | Navigate to a route |
| `goBack()` | — | `void` | Go back in history |
| `getParams()` | — | `Record<string, string>` | Get current route params |

### `sdk.notifications`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `showToast(message, type?)` | — | `void` | Show a toast notification |

Type: `'success' | 'error' | 'info' | 'warning'`

### `sdk.ui`

| Method | Permission | Returns | Description |
|--------|-----------|---------|-------------|
| `showPaymentSheet(request)` | `wallet:transfer` | `Promise<PaymentResult>` | Show native payment UI |
| `showConfirmDialog(options)` | — | `Promise<boolean>` | Show a confirmation dialog |

## Available Permissions

| Permission | Description |
|-----------|-------------|
| `user:profile:read` | Read current user profile |
| `wallet:read` | Read wallet balances and list wallets |
| `wallet:balance` | Read wallet balance only |
| `wallet:transfer` | Request payments from the user |
| `storage:read` | Read from plugin storage |
| `storage:write` | Write to plugin storage |
| `notifications:send` | Show toast notifications |

## Using Your Own Supabase Backend

If your plugin needs its own database:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Enter your project URL and anon key when creating your app
3. Credentials are encrypted and stored securely
4. Access your client via `sdk.storage.getClient()`

```javascript
export default function MyApp({ sdk }) {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => {
    const client = sdk.storage.getClient();
    if (client) {
      client.from('my_table').select('*').then(({ data }) => setItems(data || []));
    }
  }, []);

  return (
    <ul>
      {items.map(item => <li key={item.id}>{item.name}</li>)}
    </ul>
  );
}
```

## Example: Balance Checker App

```javascript
// index.js
export default function BalanceChecker({ sdk }) {
  const [user, setUser] = React.useState(null);
  const [wallets, setWallets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const u = await sdk.auth.getCurrentUser();
        setUser(u);
        const w = await sdk.wallet.listWallets();
        setWallets(w);
      } catch (e) {
        sdk.notifications.showToast(e.message, 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Hello, {user?.firstName}!</h1>
      <h2>Your Wallets</h2>
      {wallets.map(w => (
        <div key={w.id} style={{
          padding: 12,
          margin: '8px 0',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <strong>{w.currency} Wallet</strong>
          <span>{w.balance.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
```

## Submission Process

1. Go to **Developer Portal** (`/developer/apps`)
2. Click **New App** and fill in details
3. Upload your zip bundle with manifest
4. Click **Submit for Review**
5. An admin reviews your app (usually within 48 hours)
6. If approved, your app is published to the App Store
7. If rejected, you'll see the reason and can resubmit

## Database Schema

Your app's data is stored in these tables:

- **`plugin_apps`** — App metadata and status
- **`plugin_app_versions`** — Versioned bundles with manifests
- **`plugin_app_installs`** — User installations
- **`plugin_app_reviews`** — Ratings and reviews
- **`developer_profiles`** — Developer registration
