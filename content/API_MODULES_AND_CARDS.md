# Modules & Card Products API Documentation

## Overview

This document describes the new API endpoints for:
1. **Module System** - Extend platform features through toggleable modules
2. **Card Products** - Create and manage tiered card offerings
3. **Card Purchase** - Users can buy and own cards

---

## Module Management API

### List All Modules
**GET** `/api/modules`

Returns all system modules.

**Response:**
```json
{
  "modules": [
    {
      "id": "uuid",
      "code": "card_issuance",
      "name": "Card Issuance",
      "description": "Enable users to purchase cards",
      "category": "feature",
      "version": "1.0.0",
      "is_enabled": true,
      "is_system": true,
      "icon": "💳",
      "config": {},
      "dependencies": [],
      "created_at": "2025-01-01T00:00:00Z",
      "enabled_at": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 8
}
```

### Create Module
**POST** `/api/modules`

Create a new custom module (non-system).

**Body:**
```json
{
  "code": "loyalty_program",
  "name": "Loyalty Program",
  "description": "Reward users for transactions",
  "category": "feature",
  "version": "1.0.0",
  "icon": "🎁",
  "config": {},
  "dependencies": []
}
```

### Update Module
**PUT** `/api/modules/:id`

Update module configuration or enable/disable it.

**Body:**
```json
{
  "is_enabled": true,
  "config": {
    "points_per_transaction": 10,
    "redemption_rate": 0.01
  }
}
```

### Delete Module
**DELETE** `/api/modules/:id`

Delete a module (only non-system modules can be deleted).

---

## Card Product Management API

### List Card Products
**GET** `/api/card-products?admin=true`

List card products. Use `admin=true` to see all products, otherwise only visible/active ones are returned.

**Response:**
```json
{
  "products": [
    {
      "id": "uuid",
      "code": "basic",
      "name": "Basic Card",
      "description": "Perfect for everyday spending",
      "tier": 1,
      "purchase_price": 5000,
      "annual_fee": 0,
      "currency": "SLE",
      "daily_transaction_limit": 50000,
      "monthly_transaction_limit": 500000,
      "max_balance": 1000000,
      "transaction_fee_percent": 1.5,
      "transaction_fee_flat": 50,
      "bin_prefix": "520010",
      "card_length": 16,
      "is_online_enabled": true,
      "is_atm_enabled": false,
      "is_contactless_enabled": false,
      "is_international_enabled": false,
      "cashback_percent": 0,
      "features": ["Online payments", "Daily limit Le 500", "1.5% fee"],
      "card_design_url": "https://...",
      "card_color": "#1A1A1A",
      "card_text_color": "#FFFFFF",
      "is_active": true,
      "is_visible": true,
      "stock_limit": null,
      "cards_issued": 42,
      "sort_order": 1
    }
  ],
  "total": 3
}
```

### Create Card Product
**POST** `/api/card-products`

Create a new card product (Superadmin only).

**Body:**
```json
{
  "code": "gold",
  "name": "Gold Card",
  "description": "Enhanced benefits for premium users",
  "tier": 4,
  "purchase_price": 100000,
  "annual_fee": 20000,
  "currency": "SLE",
  "daily_transaction_limit": 500000,
  "monthly_transaction_limit": 5000000,
  "max_balance": 10000000,
  "transaction_fee_percent": 0.75,
  "transaction_fee_flat": 0,
  "bin_prefix": "520013",
  "card_length": 16,
  "is_online_enabled": true,
  "is_atm_enabled": true,
  "is_contactless_enabled": true,
  "is_international_enabled": true,
  "cashback_percent": 1.5,
  "features": ["All features", "1.5% cashback", "Priority support"],
  "card_design_url": "https://example.com/gold-card.png",
  "card_color": "#FFD700",
  "card_text_color": "#000000",
  "stock_limit": 1000
}
```

**Response:**
```json
{
  "product": { ... }
}
```

### Update Card Product
**PUT** `/api/card-products/:id`

Update an existing card product.

**Body:** (any fields from create)

### Delete Card Product
**DELETE** `/api/card-products/:id`

Delete a card product. Only products with no issued cards can be deleted.

### Get Single Card Product
**GET** `/api/card-products/:id`

Get details of a specific card product.

---

## Card Purchase & User Cards API

### Purchase Card
**POST** `/api/cards/purchase`

User purchases a card product.

**Body:**
```json
{
  "userId": "user-uuid",
  "cardProductId": "product-uuid",
  "paymentMethod": "wallet"
}
```

**Response:**
```json
{
  "success": true,
  "card": {
    "id": "card-uuid",
    "card_number": "5200100123456789",
    "last_four": "6789",
    "expiry_month": 12,
    "expiry_year": 2030,
    "product_name": "Basic Card",
    "status": "ACTIVE"
  }
}
```

**Error Responses:**
- `400` - Insufficient balance, product not available, already owns card
- `404` - Product not found, wallet not found
- `500` - Payment or card issuance failed

### Get User's Cards
**GET** `/api/cards/user/:userId`

Get all cards owned by a user.

**Response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "user_id": "user-uuid",
      "card_product_id": "product-uuid",
      "card_number": "5200100123456789",
      "last_four": "6789",
      "expiry_month": 12,
      "expiry_year": 2030,
      "cvv": "123",
      "status": "ACTIVE",
      "daily_limit": 50000,
      "monthly_limit": 500000,
      "is_online_enabled": true,
      "purchased_at": "2025-01-01T00:00:00Z",
      "purchase_amount": 5000,
      "annual_fee_due_date": "2026-01-01",
      "card_product": {
        "name": "Basic Card",
        "tier": 1,
        ...
      }
    }
  ],
  "total": 2
}
```

---

## Card Number Generation

Card numbers are generated using the Luhn algorithm for validity:

1. **BIN (Bank Identification Number)**: First 6-8 digits identify the card product
2. **Account Number**: Random digits
3. **Check Digit**: Calculated using Luhn algorithm to make the card number valid

Example BINs:
- `520010` - Basic Card
- `520011` - Premium Card
- `520012` - Platinum Card
- `520013` - Gold Card (custom)

The database function `generate_card_number(bin_prefix, card_length)` generates valid 16-digit card numbers.

---

## Database Schema

### Tables Created:

1. **modules** - System modules that can be enabled/disabled
2. **module_settings** - Module configuration history
3. **card_products** - Card product templates with pricing and limits
4. **card_purchases** - Track user purchases of cards
5. **cards** (extended) - Added `card_product_id`, `purchased_at`, `purchase_amount`, `annual_fee_due_date`

### Seed Data:

**Default Modules:**
- Card Issuance
- Loyalty & Rewards
- Multi-Currency Wallets
- Merchant API Access
- Advanced KYC
- Recurring Payments
- Bill Payments
- Savings Goals

**Default Card Products:**
- **Basic** (Tier 1): Le 50 purchase, daily limit Le 500
- **Premium** (Tier 2): Le 150 purchase, ATM enabled, higher limits
- **Platinum** (Tier 3): Le 500 purchase, international, 1% cashback

---

## Next Steps - UI Implementation

### 1. Module Management UI (Admin Settings)
Create `/apps/web/src/pages/admin/Modules.tsx`:
- List all modules with enable/disable toggles
- Show module description, icon, status
- Edit module configuration
- Add new custom modules

### 2. Card Product Management UI (Superadmin)
Create `/apps/web/src/pages/admin/CardProducts.tsx`:
- CRUD for card products
- Form with all fields (pricing, limits, BIN, features)
- View cards issued count
- Activate/deactivate products

### 3. Card Marketplace UI (User Dashboard)
Create `/apps/web/src/pages/user/CardMarketplace.tsx`:
- Display available card products as cards
- Show features, pricing, benefits comparison
- "Purchase" button
- Check user balance before purchase

### 4. User Cards Dashboard
Extend `/apps/web/src/pages/user/Cards.tsx`:
- Show user's owned cards with card design
- Display card number (masked/revealed)
- Card details (limits, fees, expiry)
- Annual fee payment reminders

---

## Testing

### Run Database Migration:
```bash
psql $DATABASE_URL < database/migrations/create_modules_and_card_products.sql
```

### Test API Endpoints:
```bash
# List modules
curl http://localhost:3000/api/modules

# List card products (user view)
curl http://localhost:3000/api/card-products

# List card products (admin view)
curl http://localhost:3000/api/card-products?admin=true

# Purchase card
curl -X POST http://localhost:3000/api/cards/purchase \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_UUID","cardProductId":"PRODUCT_UUID","paymentMethod":"wallet"}'
```
