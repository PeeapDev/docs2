# Card Database Separation Guide

This guide explains how to separate the card system to its own dedicated database using a microservice architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CURRENT ARCHITECTURE                              │
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Web App   │     │ API Gateway │     │  NFC Cards  │                   │
│  │             │     │             │     │   Service   │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│         ┌─────────────────────────────────────────┐                        │
│         │        SUPABASE (Single Database)       │                        │
│         │  users, wallets, cards, transactions... │                        │
│         └─────────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘

                              ▼ TRANSFORMATION ▼

┌─────────────────────────────────────────────────────────────────────────────┐
│                             NEW ARCHITECTURE                                 │
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │   Web App   │     │ API Gateway │     │  NFC Cards  │                   │
│  │             │     │             │     │   Service   │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                           │
│         └───────────────────┼───────────────────┘                           │
│                             │                                               │
│                             ▼                                               │
│              ┌────────────────────────────┐                                 │
│              │     CARD SERVICE (API)     │                                 │
│              │   HTTP REST + WebSocket    │                                 │
│              └──────┬───────────┬─────────┘                                 │
│                     │           │                                           │
│         ┌───────────┘           └───────────┐                               │
│         ▼                                   ▼                               │
│  ┌─────────────────────┐         ┌─────────────────────┐                   │
│  │   MAIN DATABASE     │         │   CARD DATABASE     │                   │
│  │   (Supabase)        │         │   (Separate)        │                   │
│  │                     │         │                     │                   │
│  │   - users           │◄────────│   - card_types      │                   │
│  │   - wallets         │ Lookup  │   - issued_cards    │                   │
│  │   - transactions    │         │   - card_orders     │                   │
│  │   - merchants       │         │   - card_tokens     │                   │
│  │   - ...             │         │   - transactions    │                   │
│  └─────────────────────┘         └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Benefits of Separation

1. **PCI DSS Compliance**: Card data isolated in a separate security boundary
2. **Independent Scaling**: Scale card operations without affecting other services
3. **Separate Backup Policies**: Different retention and recovery strategies
4. **Reduced Blast Radius**: Card database issues don't affect main application
5. **Team Isolation**: Card team can work independently

## Implementation Steps

### Step 1: Create the Card Database

#### Option A: New Supabase Project

1. Create a new Supabase project for cards
2. Copy the URL and service key to environment variables:

```env
CARD_SUPABASE_URL=https://your-card-project.supabase.co
CARD_SUPABASE_SERVICE_KEY=your_card_service_key
```

3. Run the migration:

```bash
# Connect to your card Supabase project
psql -h db.your-card-project.supabase.co -p 5432 -U postgres -d postgres \
  -f apps/card-service/src/migrations/001_card_database_schema.sql
```

#### Option B: Self-Hosted PostgreSQL

1. Create a new PostgreSQL database:

```sql
CREATE DATABASE peeap_cards;
CREATE USER card_service WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE peeap_cards TO card_service;
```

2. Configure environment:

```env
CARD_DB_HOST=localhost
CARD_DB_PORT=5432
CARD_DB_USER=card_service
CARD_DB_PASSWORD=secure_password
CARD_DB_NAME=peeap_cards
```

3. Run the migration:

```bash
psql -h localhost -U card_service -d peeap_cards \
  -f apps/card-service/src/migrations/001_card_database_schema.sql
```

### Step 2: Start the Card Service

```bash
cd apps/card-service
npm install
npm run start:dev
```

The card service will start on port 3003 (configurable via `CARD_SERVICE_PORT`).

### Step 3: Migrate Existing Card Data

Create a data migration script to copy existing card data:

```sql
-- Run this AFTER creating the card database schema
-- Connect to the MAIN database and export data

-- Export card_types
\copy (SELECT * FROM card_types) TO '/tmp/card_types.csv' WITH CSV HEADER;

-- Export issued_cards
\copy (SELECT * FROM issued_cards) TO '/tmp/issued_cards.csv' WITH CSV HEADER;

-- Export card_transactions
\copy (SELECT * FROM card_transactions) TO '/tmp/card_transactions.csv' WITH CSV HEADER;

-- Export card_orders
\copy (SELECT * FROM card_orders) TO '/tmp/card_orders.csv' WITH CSV HEADER;

-- Then import into CARD database
-- Connect to the card database
\copy card_types FROM '/tmp/card_types.csv' WITH CSV HEADER;
\copy issued_cards FROM '/tmp/issued_cards.csv' WITH CSV HEADER;
\copy card_transactions FROM '/tmp/card_transactions.csv' WITH CSV HEADER;
\copy card_orders FROM '/tmp/card_orders.csv' WITH CSV HEADER;
```

### Step 4: Update Application Code

#### Web App (apps/web)

Replace direct Supabase calls with card client calls:

```typescript
// Before (direct Supabase)
import { cardService } from '@/services/card.service';
const cards = await cardService.getIssuedCards(userId);

// After (via card service API)
import { CardClient } from '@payment-system/card-client';

const cardClient = new CardClient({
  baseUrl: import.meta.env.VITE_CARD_SERVICE_URL || 'http://localhost:3003',
  apiKey: import.meta.env.VITE_CARD_SERVICE_API_KEY,
});

const cards = await cardClient.getUserCards(userId);
```

#### API Gateway (apps/api-gateway)

Create a card service proxy module:

```typescript
// apps/api-gateway/src/modules/cards/cards.module.ts
import { Module, HttpModule } from '@nestjs/common';
import { CardsProxyController } from './cards-proxy.controller';

@Module({
  imports: [HttpModule],
  controllers: [CardsProxyController],
})
export class CardsModule {}
```

```typescript
// apps/api-gateway/src/modules/cards/cards-proxy.controller.ts
import { Controller, All, Req, Res, HttpService } from '@nestjs/common';
import { Request, Response } from 'express';

@Controller('api/cards')
export class CardsProxyController {
  constructor(private httpService: HttpService) {}

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const cardServiceUrl = process.env.CARD_SERVICE_URL || 'http://localhost:3003';
    const url = `${cardServiceUrl}${req.originalUrl}`;

    try {
      const response = await this.httpService.axiosRef({
        method: req.method,
        url,
        data: req.body,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': req.headers['x-user-id'],
          'Authorization': req.headers['authorization'],
        },
      });

      res.status(response.status).json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Card service error' });
    }
  }
}
```

### Step 5: Update NFC Card Service

The NFC card service needs to use the new card database:

```typescript
// nfc-prepaid-cards/services/nfc-card.service.ts
import { createClient } from '@supabase/supabase-js';

// Create client for CARD database (not main database)
const cardSupabase = createClient(
  process.env.CARD_SUPABASE_URL!,
  process.env.CARD_SUPABASE_SERVICE_KEY!
);

// For user/wallet lookups, use main database client
const mainSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

## Cross-Database Communication

Since card tables reference `user_id` and `wallet_id` from the main database, the card service needs to:

1. **Validate ownership**: Call main DB to verify user owns the wallet
2. **Process payments**: Call main DB RPC functions for wallet debit/credit
3. **Get user info**: Call main DB for user details when needed

This is handled by `MainDatabaseClient` in the card service:

```typescript
// apps/card-service/src/lib/main-database.client.ts
import { createClient } from '@supabase/supabase-js';

// This client connects to the MAIN Supabase database
// Used only for user/wallet operations
```

## API Endpoints

The card service exposes these endpoints:

### Card Management
- `GET /api/cards/user/:userId` - Get user's cards
- `GET /api/cards/:cardId` - Get single card
- `POST /api/cards` - Create new card
- `POST /api/cards/:cardId/activate` - Activate card
- `POST /api/cards/:cardId/block` - Block card
- `POST /api/cards/:cardId/freeze` - Freeze card
- `POST /api/cards/:cardId/unfreeze` - Unfreeze card
- `PATCH /api/cards/:cardId/limits` - Update limits
- `PATCH /api/cards/:cardId/features` - Update features

### Payment Processing
- `POST /api/cards/lookup` - Look up card for payment
- `POST /api/cards/process-payment` - Process card payment
- `POST /api/cards/verify` - Verify card details
- `GET /api/cards/:cardId/transactions` - Get transactions

### Token Vault
- `POST /api/token-vault/tokenize` - Tokenize card
- `POST /api/token-vault/lookup` - Look up token

## Rollback Plan

If issues arise, you can rollback by:

1. Restore card tables to main database from backup
2. Revert code changes to use direct Supabase calls
3. Stop the card service

## Monitoring

Add monitoring for:

1. **Card Service Health**: `/health` endpoint
2. **Database Connections**: Pool utilization, connection errors
3. **API Latency**: Response times for card operations
4. **Cross-DB Calls**: Latency between card service and main DB

## Security Considerations

1. **API Key Authentication**: Require API key for service-to-service calls
2. **Network Isolation**: Card database should only be accessible from card service
3. **Encryption**: Use SSL for database connections
4. **Audit Logging**: Log all card operations with user context
5. **Rate Limiting**: Limit card lookup and payment attempts

## Files Created

1. `apps/card-service/src/config/database.config.ts` - Database configuration
2. `apps/card-service/src/lib/main-database.client.ts` - Main DB client for lookups
3. `apps/card-service/src/migrations/001_card_database_schema.sql` - Card DB schema
4. `packages/card-client/src/index.ts` - HTTP client for card service
5. `.env.example` - Updated with card DB configuration
