# pantainos-experiments

Experimental implementations and research for Pantainos. Code here is exploratory and may graduate to production repos once validated.

## Experiments

### claude-direct

Native TypeScript client that mimics Claude Code CLI protocol without subprocess overhead.

**Problem**: Claude Agent SDK spawns a subprocess (`cli.js`, 11MB) adding ~500-1000ms latency per invocation.

**Solution**: Direct API calls with the same auth headers and protocol as the CLI.

**Results**: ~60% faster for one-shot tasks (750ms vs 1871ms)

```typescript
import { queryDirect, createClient } from "./src/claude-direct/index.js";

// Quick one-shot (minimal mode, fastest)
const result = await queryDirect("Hello!");

// Reusable client
const client = createClient({ model: "claude-haiku-4-5-20251001" });
const result = await client.query({
  messages: [{ role: "user", content: "Hello!" }],
});
```

#### Modes

| Mode | Network Calls | Use Case |
|------|---------------|----------|
| `minimal: true` (default) | `/v1/messages` only | One-shot tasks |
| `minimal: false` | Feature flags + telemetry | Full CLI parity |

#### Key Discovery

OAuth tokens require the `anthropic-beta: oauth-2025-04-20` header to work with the raw API.

## Setup

```bash
npm install
export CLAUDE_CODE_OAUTH_TOKEN="your-token"
npm run test:claude-direct
```

## License

MIT
