# Templates Package

This package contains versioned JSON templates for different industry agents.

## Structure

Templates are organized by industry and version:

```
src/templates/
├── restaurant/
│   └── 1.0.0.json
├── hotel/
│   └── 1.0.0.json
├── tradie/
│   └── 1.0.0.json
└── ...
```

## Template JSON Schema

Each template JSON follows this structure:

```json
{
  "slug": "restaurant",
  "version": "1.0.0",
  "title": "Restaurant Agent",
  "systemPrompt": "You are a helpful assistant for {business_name}...",
  "intentsAllowed": ["booking", "menu_query", "hours", "general"],
  "modulesDefault": ["booking", "menu", "reviews"],
  "handoffTriggers": ["speak to manager", "complaint", "refund"],
  "settingsSchema": {
    "type": "object",
    "properties": {
      "businessName": { "type": "string" },
      "openingHours": { "type": "string" }
    }
  }
}
```

## Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Industry identifier (unique per version) |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `title` | string | Human-readable template name |
| `systemPrompt` | string | Base system prompt for the AI agent |
| `intentsAllowed` | string[] | List of intents the agent can handle |
| `modulesDefault` | string[] | Default modules enabled for this template |
| `handoffTriggers` | string[] | Phrases that trigger human handoff |
| `settingsSchema` | object | JSON Schema for customisable settings |

## Usage

Templates are loaded by the seed script into the database.

```typescript
import { prisma } from '@/lib/prisma';

const template = await prisma.agentTemplate.findUnique({
  where: { slug_version: { slug: 'restaurant', version: '1.0.0' } }
});
```
