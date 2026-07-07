# Module System & Card Products - Complete Guide

## 🎉 Overview

We've built a complete **Module System** and **Card Product Platform** that allows you to:
- Extend platform features through toggleable modules
- Create tiered card products (like credit card tiers)
- Allow users to purchase and own virtual payment cards
- Manage card products with full customization

---

## 📦 What's Been Built

### Backend (API)
✅ Complete REST API for modules and card products
✅ Card number generation with Luhn algorithm
✅ Wallet-based card purchase flow
✅ Transaction recording and rollback on failure
✅ Database schema with seed data

### Frontend (UI)
✅ Module Management (Admin)
✅ Card Product Management (Superadmin)
✅ Card Marketplace (User)
✅ My Cards Dashboard (User)

---

## 🗄️ Database Setup

### 1. Run Migration

```bash
# Navigate to your project
cd /Users/local_server/soft-touch2/project/card

# Run the migration
psql $DATABASE_URL < database/migrations/create_modules_and_card_products.sql
```

This creates:
- `modules` table
- `module_settings` table
- `card_products` table
- `card_purchases` table
- Extends `cards` table with product relationship
- Seeds 8 default modules
- Seeds 3 default card products (Basic, Premium, Platinum)

### 2. Verify Installation

```sql
-- Check modules
SELECT code, name, is_enabled FROM modules;

-- Check card products
SELECT code, name, tier, purchase_price FROM card_products;
```

---

## 🔌 API Endpoints

### Module Management

```bash
# List all modules
GET /api/modules

# Create custom module
POST /api/modules
{
  "code": "custom_feature",
  "name": "Custom Feature",
  "description": "My custom feature",
  "category": "feature",
  "icon": "🎯"
}

# Update/Enable module
PUT /api/modules/:id
{
  "is_enabled": true,
  "config": { "key": "value" }
}

# Delete module
DELETE /api/modules/:id
```

### Card Products

```bash
# List products (user view - only visible)
GET /api/card-products

# List products (admin view - all)
GET /api/card-products?admin=true

# Create card product
POST /api/card-products
{
  "code": "gold",
  "name": "Gold Card",
  "tier": 4,
  "purchase_price": 100000,
  "bin_prefix": "520013",
  "daily_transaction_limit": 500000,
  "is_online_enabled": true,
  "is_atm_enabled": true,
  "cashback_percent": 1.5,
  "features": ["Premium support", "Airport lounge access"]
}

# Update card product
PUT /api/card-products/:id
{
  "purchase_price": 120000,
  "is_active": true
}

# Delete card product (only if no cards issued)
DELETE /api/card-products/:id
```

### Card Purchase & User Cards

```bash
# Purchase a card
POST /api/cards/purchase
{
  "userId": "user-uuid",
  "cardProductId": "product-uuid",
  "paymentMethod": "wallet"
}

# Get user's cards
GET /api/cards/user/:userId
```

---

## 🎨 Frontend Pages

### 1. Module Management (Admin)
**Route:** `/admin/modules`
**File:** `apps/web/src/pages/admin/Modules.tsx`

**Features:**
- View all system modules
- Toggle enable/disable with switch
- Create custom modules
- Edit module details
- Delete non-system modules
- Category badges (Feature, Security, Payment)
- Dependency tracking

**Usage:**
```tsx
import Modules from '@/pages/admin/Modules';

// In your router
<Route path="/admin/modules" element={<Modules />} />
```

---

### 2. Card Product Management (Superadmin)
**Route:** `/admin/card-products`
**File:** `apps/web/src/pages/admin/CardProducts.tsx`

**Features:**
- Table view of all card products
- Create/Edit with multi-tab form:
  - **Basic Info**: Name, description, tier
  - **Pricing & Limits**: Fees, limits, BIN
  - **Features**: Toggle online/ATM/international
  - **Design**: Card colors, preview
- View cards issued count
- Active/visible toggles
- Delete protection (if cards issued)

**Usage:**
```tsx
import CardProducts from '@/pages/admin/CardProducts';

// In your router
<Route path="/admin/card-products" element={<CardProducts />} />
```

---

### 3. Card Marketplace (User)
**Route:** `/user/card-marketplace`
**File:** `apps/web/src/pages/user/CardMarketplace.tsx`

**Features:**
- Browse available card products
- Visual card tier comparison
- Show wallet balance
- Purchase cards with confirmation
- Real-time balance check
- "Already Owned" badge
- Instant activation

**Usage:**
```tsx
import CardMarketplace from '@/pages/user/CardMarketplace';

// In your router
<Route path="/user/card-marketplace" element={<CardMarketplace />} />
```

**User Flow:**
1. User views available card products
2. Checks wallet balance
3. Clicks "Purchase" on desired card
4. Confirms purchase in dialog
5. Card is instantly created and activated
6. Card number displayed (unique 16-digit)

---

### 4. My Cards Dashboard (User)
**Route:** `/user/my-cards`
**File:** `apps/web/src/pages/user/MyCards.tsx`

**Features:**
- Display all owned cards
- Visual card with product design
- Show/hide card details toggle
- Copy card number to clipboard
- View limits, fees, features
- Expiry warnings
- Card status badges
- Detailed information dialog
- Link to marketplace for more cards

**Usage:**
```tsx
import MyCards from '@/pages/user/MyCards';

// In your router
<Route path="/user/my-cards" element={<MyCards />} />
```

---

## 🎯 Default Card Products

After running the migration, you'll have these cards:

### 1. Basic Card (Tier 1)
- **Price:** Le 50 (one-time)
- **Annual Fee:** Le 0
- **Daily Limit:** Le 500
- **Features:** Online payments only
- **Fee:** 1.5% per transaction
- **BIN:** 520010
- **Cashback:** 0%

### 2. Premium Card (Tier 2)
- **Price:** Le 150
- **Annual Fee:** Le 50
- **Daily Limit:** Le 2,000
- **Features:** Online + ATM + Contactless
- **Fee:** 1% per transaction
- **BIN:** 520011
- **Cashback:** 0%

### 3. Platinum Card (Tier 3)
- **Price:** Le 500
- **Annual Fee:** Le 100
- **Daily Limit:** Le 10,000
- **Features:** All features + International
- **Fee:** 0.5% per transaction
- **BIN:** 520012
- **Cashback:** 1%

---

## 🛠️ Card Number Generation

Cards use a **16-digit format** with **Luhn checksum** validation:

```
Format: [BIN (6 digits)] + [Account (9 digits)] + [Check Digit (1)]
Example: 5200 1012 3456 7895
```

**How it works:**
1. Card product has unique BIN prefix (e.g., `520010`)
2. System generates random 9-digit account number
3. Luhn algorithm calculates check digit
4. Result is valid, unique 16-digit card number

**Database Function:**
```sql
SELECT generate_card_number('520010', 16);
-- Returns: 5200101234567895 (example)
```

---

## 📱 Complete User Journey

### Step 1: Admin Setup
1. Admin logs into `/admin/modules`
2. Enables "Card Issuance" module
3. Navigates to `/admin/card-products`
4. Creates or edits card products
5. Sets pricing, limits, features
6. Activates card for sale

### Step 2: User Purchase
1. User logs in and checks wallet balance
2. Navigates to `/user/card-marketplace`
3. Browses available card tiers
4. Compares features and pricing
5. Clicks "Purchase" on desired card
6. Confirms purchase (balance is checked)
7. Payment deducted from wallet
8. Card instantly created and activated

### Step 3: User Uses Card
1. User navigates to `/user/my-cards`
2. Views all owned cards
3. Toggles to reveal card details
4. Copies card number for use
5. Uses card for online payments
6. Sees transaction limits and fees

---

## 🔐 Security Features

✅ **Wallet Balance Verification** - Prevents overdrafts
✅ **Duplicate Purchase Prevention** - One card type per user
✅ **Transaction Rollback** - Auto-refund on failure
✅ **Card Number Masking** - Show only last 4 digits
✅ **Secure CVV Display** - Toggle to reveal
✅ **Luhn Validation** - All card numbers are valid

---

## 🎨 Customization Guide

### Creating a New Card Tier

1. **Via UI** (Recommended):
   - Go to `/admin/card-products`
   - Click "Create Card Product"
   - Fill out all tabs
   - Set unique BIN (e.g., `520013` for Gold)
   - Save and activate

2. **Via API**:
```bash
curl -X POST https://your-domain.com/api/card-products \
  -H "Content-Type: application/json" \
  -d '{
    "code": "gold",
    "name": "Gold Card",
    "tier": 4,
    "purchase_price": 100000,
    "annual_fee": 20000,
    "bin_prefix": "520013",
    "card_length": 16,
    "daily_transaction_limit": 500000,
    "monthly_transaction_limit": 5000000,
    "transaction_fee_percent": 0.75,
    "is_online_enabled": true,
    "is_atm_enabled": true,
    "is_contactless_enabled": true,
    "is_international_enabled": true,
    "cashback_percent": 1.5,
    "features": ["Priority support", "Airport lounge", "Concierge service"],
    "card_color": "#FFD700",
    "card_text_color": "#000000"
  }'
```

### Creating a Custom Module

```bash
curl -X POST https://your-domain.com/api/modules \
  -H "Content-Type: application/json" \
  -d '{
    "code": "bill_pay",
    "name": "Bill Payments",
    "description": "Pay utilities and services",
    "category": "feature",
    "icon": "💡",
    "version": "1.0.0",
    "config": {
      "supported_billers": ["electricity", "water", "internet"]
    }
  }'
```

---

## 🧪 Testing

### Test Card Purchase Flow

```javascript
// 1. Get available products
const products = await fetch('/api/card-products').then(r => r.json());
console.log(products);

// 2. Purchase basic card
const purchase = await fetch('/api/cards/purchase', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'your-user-uuid',
    cardProductId: products.products[0].id,
    paymentMethod: 'wallet'
  })
}).then(r => r.json());

console.log('New Card:', purchase.card.card_number);

// 3. Get user's cards
const myCards = await fetch('/api/cards/user/your-user-uuid').then(r => r.json());
console.log('My Cards:', myCards);
```

---

## 📊 Database Queries

```sql
-- View all modules and their status
SELECT code, name, is_enabled, category FROM modules ORDER BY category, name;

-- View card products with issue count
SELECT name, tier, purchase_price, cards_issued, stock_limit
FROM card_products
ORDER BY tier;

-- View recent card purchases
SELECT cp.*, u.email, prod.name as product_name
FROM card_purchases cp
JOIN users u ON cp.user_id = u.id
JOIN card_products prod ON cp.card_product_id = prod.id
ORDER BY cp.created_at DESC
LIMIT 10;

-- Count cards by product
SELECT cp.name, COUNT(c.id) as total_cards
FROM card_products cp
LEFT JOIN cards c ON c.card_product_id = cp.id
GROUP BY cp.id, cp.name
ORDER BY total_cards DESC;
```

---

## 🚀 Next Steps

### Immediate
- [ ] Add routes to navigation menu
- [ ] Test complete user flow
- [ ] Configure wallet balance for test users
- [ ] Verify card number generation

### Future Enhancements
- [ ] Physical card ordering
- [ ] Card delivery tracking
- [ ] Custom card designs (user uploads)
- [ ] Card replacement/renewal flow
- [ ] Transaction history per card
- [ ] Spend analytics per card
- [ ] Card freeze/unfreeze
- [ ] Virtual card for online only
- [ ] Multi-currency cards
- [ ] Card upgrade/downgrade flow

---

## 📞 Support

For issues or questions:
1. Check API documentation: `/docs/API_MODULES_AND_CARDS.md`
2. Review database schema: `/database/migrations/create_modules_and_card_products.sql`
3. Test API endpoints using Postman or cURL
4. Check browser console for frontend errors

---

## ✅ Deployment Checklist

- [x] Database migration run
- [x] API endpoints deployed
- [x] Frontend pages built
- [ ] Routes added to navigation
- [ ] Test users created with wallet balance
- [ ] Card products activated
- [ ] Module system enabled
- [ ] Production environment variables set
- [ ] SSL certificate configured
- [ ] Error monitoring enabled

---

**Built with ❤️ using:**
- TypeScript
- React + Material-UI
- Supabase (PostgreSQL)
- Vercel Serverless Functions
- Luhn Algorithm for card validation

🤖 Generated with Claude Code
