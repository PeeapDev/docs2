# Peeap Module System

## Overview

The Peeap Module System is a standardized architecture for extending platform functionality. Every feature, integration, and service operates as a module that can be:
- Enabled/Disabled independently
- Configured through the admin panel
- Connected to other modules via events
- Accessed via REST API

## Module Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `payment` | Payment gateway integrations | Monime, Paystack, Stripe |
| `feature` | Platform features | Deposits, Withdrawals, Cards |
| `integration` | Third-party service integrations | SMS, Email, Push notifications |
| `security` | Security and compliance modules | KYC, 2FA, Fraud detection |
| `api` | API and connectivity modules | REST API, Webhooks |

## Module Structure

### Database Schema

```sql
CREATE TABLE modules (
    id UUID PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,  -- Unique identifier: 'monime', 'deposits', etc.
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,      -- 'payment', 'feature', 'integration', 'security', 'api'
    version VARCHAR(20) DEFAULT '1.0.0',

    -- Status
    is_enabled BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,    -- System modules cannot be deleted
    is_beta BOOLEAN DEFAULT false,      -- Beta modules show warning

    -- Configuration
    icon VARCHAR(255),                  -- Emoji or icon URL
    config JSONB DEFAULT '{}',          -- Module configuration
    config_schema JSONB,                -- JSON Schema for config validation

    -- Dependencies & Events
    dependencies TEXT[],                -- Required module codes
    provides TEXT[],                    -- Services this module provides
    events TEXT[],                      -- Events this module emits

    -- API
    api_endpoints JSONB DEFAULT '[]',   -- Endpoints this module provides
    webhooks JSONB DEFAULT '[]',        -- Webhook configurations

    -- Metadata
    documentation_url VARCHAR(500),
    settings_path VARCHAR(255),         -- Admin panel settings path
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    enabled_at TIMESTAMP WITH TIME ZONE,
    enabled_by UUID REFERENCES users(id)
);
```

### Module Definition (TypeScript)

```typescript
interface ModuleDefinition {
  // Identity
  code: string;                         // Unique identifier
  name: string;                         // Display name
  description: string;                  // Brief description
  category: ModuleCategory;
  version: string;
  icon: string;                         // Emoji or icon URL

  // Status
  isSystem: boolean;                    // Cannot be deleted
  isBeta: boolean;                      // Shows beta warning

  // Configuration
  config: Record<string, any>;          // Current configuration
  configSchema: JSONSchema;             // Validation schema

  // Dependencies
  dependencies: string[];               // Required modules
  provides: string[];                   // Services provided

  // Events
  events: {
    emits: string[];                    // Events this module emits
    listens: string[];                  // Events this module handles
  };

  // API
  endpoints: ModuleEndpoint[];          // API endpoints
  webhooks: WebhookConfig[];            // Webhook handlers

  // Lifecycle hooks
  onEnable?: () => Promise<void>;
  onDisable?: () => Promise<void>;
  onConfigUpdate?: (config: any) => Promise<void>;
}
```

## Creating a Module

### Step 1: Define Module Manifest

Create a manifest file `modules/[module-code]/manifest.json`:

```json
{
  "code": "my_module",
  "name": "My Module",
  "description": "Description of what this module does",
  "category": "feature",
  "version": "1.0.0",
  "icon": "🔧",

  "dependencies": ["core"],
  "provides": ["my_service"],

  "configSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "title": "API Key",
        "description": "Your API key",
        "format": "password"
      },
      "enabled": {
        "type": "boolean",
        "title": "Enable feature",
        "default": true
      }
    },
    "required": ["apiKey"]
  },

  "events": {
    "emits": ["my_module.action_completed", "my_module.error"],
    "listens": ["payment.completed", "user.created"]
  },

  "endpoints": [
    {
      "method": "POST",
      "path": "/my-module/action",
      "description": "Perform module action",
      "auth": "required"
    }
  ],

  "webhooks": [
    {
      "name": "external_callback",
      "path": "/webhooks/my-module",
      "description": "Handle external service callbacks"
    }
  ],

  "settingsPath": "/admin/settings/my-module"
}
```

### Step 2: Implement Module Service

Create `modules/[module-code]/service.ts`:

```typescript
import { ModuleService, ModuleContext } from '@/core/module-system';

export class MyModuleService extends ModuleService {
  static code = 'my_module';

  constructor(context: ModuleContext) {
    super(context);
  }

  // Lifecycle hooks
  async onEnable(): Promise<void> {
    // Validate configuration
    this.validateConfig();
    // Initialize resources
    await this.initialize();
  }

  async onDisable(): Promise<void> {
    // Cleanup resources
    await this.cleanup();
  }

  async onConfigUpdate(newConfig: any): Promise<void> {
    // Handle configuration changes
    this.config = newConfig;
    await this.reinitialize();
  }

  // Module methods
  async performAction(params: ActionParams): Promise<ActionResult> {
    // Check if module is enabled
    if (!this.isEnabled()) {
      throw new ModuleDisabledError(MyModuleService.code);
    }

    // Perform action
    const result = await this.doAction(params);

    // Emit event
    this.emit('my_module.action_completed', { params, result });

    return result;
  }

  // Event handlers
  @OnEvent('payment.completed')
  async handlePaymentCompleted(event: PaymentEvent): Promise<void> {
    // React to payment completion
  }
}
```

### Step 3: Register API Endpoints

Create `modules/[module-code]/routes.ts`:

```typescript
import { ModuleRouter } from '@/core/module-system';
import { MyModuleService } from './service';

export function registerRoutes(router: ModuleRouter) {
  // POST /api/modules/my-module/action
  router.post('/action', async (req, res) => {
    const service = await router.getService<MyModuleService>('my_module');
    const result = await service.performAction(req.body);
    res.json({ success: true, result });
  });

  // Webhook handler
  router.post('/webhooks/my-module', async (req, res) => {
    const service = await router.getService<MyModuleService>('my_module');
    await service.handleWebhook(req.body, req.headers);
    res.json({ received: true });
  });
}
```

## Module Events

Modules communicate through events. Use the EventBus to emit and listen to events.

### Standard Events

| Event | Payload | Description |
|-------|---------|-------------|
| `module.enabled` | `{ code, enabledBy }` | Module was enabled |
| `module.disabled` | `{ code, disabledBy }` | Module was disabled |
| `module.config_updated` | `{ code, config }` | Module config changed |
| `payment.initiated` | `{ id, amount, method }` | Payment started |
| `payment.completed` | `{ id, amount, status }` | Payment finished |
| `payment.failed` | `{ id, error }` | Payment failed |
| `user.created` | `{ id, email }` | New user registered |
| `user.verified` | `{ id, method }` | User verified identity |
| `wallet.credited` | `{ walletId, amount }` | Wallet received funds |
| `wallet.debited` | `{ walletId, amount }` | Wallet sent funds |

### Emitting Events

```typescript
// In your module service
this.emit('my_module.action_completed', {
  actionId: '123',
  result: 'success',
  timestamp: new Date()
});
```

### Listening to Events

```typescript
// Using decorator
@OnEvent('payment.completed')
async handlePayment(event: PaymentEvent) {
  // Handle event
}

// Or manual subscription
this.eventBus.on('payment.completed', this.handlePayment.bind(this));
```

## Module Configuration

### Configuration Schema

Use JSON Schema to define configuration fields:

```json
{
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "title": "API Key",
      "description": "API key for authentication",
      "format": "password",
      "minLength": 10
    },
    "environment": {
      "type": "string",
      "title": "Environment",
      "enum": ["sandbox", "production"],
      "default": "sandbox"
    },
    "webhookUrl": {
      "type": "string",
      "title": "Webhook URL",
      "format": "uri"
    },
    "retryAttempts": {
      "type": "integer",
      "title": "Retry Attempts",
      "minimum": 0,
      "maximum": 5,
      "default": 3
    }
  },
  "required": ["apiKey", "environment"]
}
```

### Accessing Configuration

```typescript
// Get module config
const config = await moduleRegistry.getConfig('my_module');

// Update config
await moduleRegistry.updateConfig('my_module', {
  apiKey: 'new-key',
  environment: 'production'
});
```

## REST API Module

The REST API module provides external connectivity:

### API Key Authentication

```typescript
// Generate API key for a service
const apiKey = await restApiModule.createApiKey({
  name: 'My Service',
  permissions: ['payments.read', 'payments.create'],
  rateLimit: 1000, // requests per hour
  expiresAt: '2025-12-31'
});

// Authenticate requests
// Header: X-API-Key: pk_live_xxxxx
```

### Webhook Configuration

```typescript
// Register webhook endpoint
await restApiModule.registerWebhook({
  url: 'https://my-service.com/webhook',
  events: ['payment.completed', 'payment.failed'],
  secret: 'whsec_xxxxx'
});
```

### Rate Limiting

```typescript
// Configure rate limits per API key
await restApiModule.setRateLimit('api_key_id', {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000
});
```

## Module Dependencies

Modules can depend on other modules:

```json
{
  "code": "withdrawals",
  "dependencies": ["monime", "wallets"],
  "dependencyMode": "any"  // "all" or "any"
}
```

- `all`: All dependencies must be enabled
- `any`: At least one dependency must be enabled

## Admin UI Integration

### Settings Page

Create a settings component for your module:

```tsx
// modules/my-module/SettingsPage.tsx
import { ModuleSettingsForm } from '@/components/ModuleSettingsForm';

export function MyModuleSettings() {
  return (
    <ModuleSettingsForm
      moduleCode="my_module"
      title="My Module Settings"
      description="Configure your module"
    />
  );
}
```

### Module Card

Modules automatically appear in Admin > Modules with:
- Toggle to enable/disable
- Configure button (links to settingsPath)
- Status indicators
- Dependency warnings

## Best Practices

1. **Always check if enabled**: Before performing actions, verify the module is enabled
2. **Use events for loose coupling**: Don't call other modules directly; use events
3. **Validate configuration**: Use JSON Schema to validate config before enabling
4. **Handle errors gracefully**: Emit error events and provide meaningful messages
5. **Document your module**: Include README and API documentation
6. **Version your changes**: Use semantic versioning for module updates
7. **Test independently**: Modules should be testable in isolation

## Example: Creating a SMS Module

```typescript
// modules/sms/manifest.json
{
  "code": "sms",
  "name": "SMS Notifications",
  "description": "Send SMS notifications via multiple providers",
  "category": "integration",
  "version": "1.0.0",
  "icon": "📱",

  "configSchema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "enum": ["twilio", "africas_talking", "termii"],
        "default": "twilio"
      },
      "apiKey": { "type": "string", "format": "password" },
      "senderId": { "type": "string" }
    },
    "required": ["provider", "apiKey"]
  },

  "provides": ["sms"],

  "events": {
    "emits": ["sms.sent", "sms.failed"],
    "listens": ["user.created", "payment.completed"]
  }
}

// modules/sms/service.ts
export class SmsModuleService extends ModuleService {
  async sendSms(to: string, message: string): Promise<void> {
    if (!this.isEnabled()) {
      throw new ModuleDisabledError('sms');
    }

    const provider = this.getProvider();
    await provider.send(to, message);

    this.emit('sms.sent', { to, message });
  }

  @OnEvent('user.created')
  async handleUserCreated(event: UserEvent) {
    await this.sendSms(event.phone, 'Welcome to Peeap!');
  }
}
```

## Module Registry API

```typescript
// Get all modules
const modules = await moduleRegistry.getAll();

// Get enabled modules
const enabled = await moduleRegistry.getEnabled();

// Get module by code
const monime = await moduleRegistry.get('monime');

// Check if module is enabled
const isEnabled = await moduleRegistry.isEnabled('monime');

// Enable/disable module
await moduleRegistry.enable('monime', userId);
await moduleRegistry.disable('monime', userId);

// Get module service
const service = await moduleRegistry.getService<MonimeService>('monime');
```
