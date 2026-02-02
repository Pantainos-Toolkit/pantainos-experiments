# pantainos-experiments

Experimental implementations and research for Pantainos. Code here is exploratory and may graduate to production repos once validated.

## Structure

```
src/
├── claude-direct/
│   ├── index.ts                 # Main ClaudeDirect client
│   ├── FEATURES.md              # Feature parity roadmap
│   ├── KNOWLEDGE.md             # Complete knowledge base
│   ├── testing/
│   │   ├── README.md            # Testing methodology
│   │   ├── benchmark.ts         # Benchmark harness
│   │   ├── traffic-capture.ts   # Fetch interception
│   │   ├── run-all-tests.ts     # Test runner
│   │   ├── test-direct-tool-loop.ts      # Tool use (minimal)
│   │   └── test-direct-tool-loop-full.ts # Tool use (full)
│   └── sdk-tests/
│       ├── test-v2*.ts          # SDK V2 session tests
│       ├── test-streaming.ts    # Streaming behavior
│       └── test-dual-pool.ts    # Session pooling
```

## claude-direct

Native TypeScript client that mimics Claude Code CLI protocol without subprocess overhead.

**Problem**: Claude Agent SDK spawns a subprocess (`cli.js`, 11MB) adding ~500-1000ms latency.

**Solution**: Direct API calls with the same auth headers and protocol as the CLI.

**Results**: ~60% faster for one-shot tasks (650ms vs 1871ms)

### Quick Start

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

### Modes

| Mode | Network Calls | Use Case |
|------|---------------|----------|
| `minimal: true` (default) | `/v1/messages` only | One-shot tasks |
| `minimal: false` | Feature flags + telemetry | Full CLI parity |

### Key Discoveries

1. **OAuth requires beta header**: `anthropic-beta: oauth-2025-04-20`
2. **Tool use is stateless**: Full message history sent each call
3. **Telemetry is optional**: Returns 400, can be skipped safely

See [KNOWLEDGE.md](src/claude-direct/KNOWLEDGE.md) for complete documentation.

## Testing

```bash
# Install dependencies
npm install

# Set OAuth token
export CLAUDE_CODE_OAUTH_TOKEN="your-token"

# Run tests
npm test                     # Unit tests only
npm run test:integration     # Includes real API calls
npm run test:benchmark       # Performance comparisons
npm run test:all             # Everything
```

### Traffic Capture

For debugging network calls:

```bash
# Using mitmproxy (external)
brew install mitmproxy
mitmdump -p 8080 -w /tmp/traffic.flow
HTTPS_PROXY=http://localhost:8080 npm run test:integration

# Using in-process capture
import { enableTrafficLogging, getTrafficSummary } from "./testing/traffic-capture.js";
enableTrafficLogging({ verbose: true });
// ... run code ...
console.log(getTrafficSummary());
```

## Roadmap

See [FEATURES.md](src/claude-direct/FEATURES.md) for feature parity tracking.

**Done:**
- Basic messages, streaming, system prompts
- OAuth authentication
- Minimal/full mode switching

**In Progress:**
- Tool use loop (documented, not yet integrated into client)
- Multi-turn conversations

**Planned:**
- Extended thinking
- Prompt caching
- Structured output (JSON mode)

## License

MIT
