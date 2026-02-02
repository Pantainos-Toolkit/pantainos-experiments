# Claude Direct - Knowledge Base

Everything we've learned about the Claude Code CLI protocol, SDK behavior, and direct API integration.

## Table of Contents
- [Authentication](#authentication)
- [Network Protocol](#network-protocol)
- [Tool Use Loop](#tool-use-loop)
- [Telemetry & Feature Flags](#telemetry--feature-flags)
- [Performance Optimization](#performance-optimization)
- [Testing Methodology](#testing-methodology)

---

## Authentication

### OAuth Token
The Claude Code CLI uses OAuth tokens (not API keys). To use OAuth with the raw API:

```typescript
const headers = {
  "Authorization": `Bearer ${oauthToken}`,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "oauth-2025-04-20",  // REQUIRED for OAuth
  "anthropic-dangerous-direct-browser-access": "true",
  "x-app": "cli",
};
```

**Key discovery**: The `anthropic-beta: oauth-2025-04-20` header is **required** for OAuth tokens to work. Without it, the API returns 401.

### Beta Flags (as of 2026-02)
```
oauth-2025-04-20              # OAuth token support (REQUIRED)
interleaved-thinking-2025-05-14   # Extended thinking
context-management-2025-06-27     # Context management
prompt-caching-scope-2026-01-05   # Prompt caching
```

---

## Network Protocol

### Endpoints

| Endpoint | Purpose | Mode |
|----------|---------|------|
| `POST /v1/messages?beta=true` | Inference | Core |
| `POST /api/eval/sdk-zAZezfDKGoZuXXKe` | Feature flags | Full |
| `POST /api/event_logging/batch` | Anthropic telemetry | Full |
| `POST datadoghq.com/api/v2/logs` | Datadog metrics | Full |

### Minimal Mode (telemetry off)
```
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=true
CLAUDE_CODE_ENABLE_TELEMETRY=false
```

Only makes `/v1/messages` calls. ~60% faster for one-shot tasks.

### Full Mode Request Sequence
```
1. POST /api/eval/{sdk-key}        # Feature flags (startup)
2. POST /v1/messages               # Inference
3. POST /api/event_logging/batch   # Telemetry (async)
4. POST datadoghq.com/api/v2/logs  # Datadog (async)
```

Telemetry is fire-and-forget (400 responses are ignored).

---

## Tool Use Loop

### Pattern
```typescript
const messages = [{ role: "user", content: userPrompt }];
let response = await makeApiCall(messages, tools);

while (response.stop_reason === "tool_use") {
  // 1. Extract tool calls
  const toolUses = response.content.filter(b => b.type === "tool_use");

  // 2. Add assistant message to history
  messages.push({ role: "assistant", content: response.content });

  // 3. Execute tools and create results
  const toolResults = toolUses.map(t => ({
    type: "tool_result",
    tool_use_id: t.id,
    content: executeTool(t.name, t.input),
  }));

  // 4. Add tool results as user message
  messages.push({ role: "user", content: toolResults });

  // 5. Make next API call
  response = await makeApiCall(messages, tools);
}

// Final response: response.stop_reason === "end_turn"
```

### Message History Growth
```
Turn 1: 1 message  (user)
Turn 2: 3 messages (user, assistant+tool_use, user+tool_result)
Turn 3: 5 messages (continues growing)
```

### Key Points
- **Tools resent every call** - no server-side state
- **Full history sent** - grows linearly with turns
- **stop_reason** determines loop: `tool_use` → continue, `end_turn` → done

### Network Calls (simple tool use)
```
Minimal: 2 calls (~2300ms)
Full:    5 calls (~2642ms) - 3 extra for telemetry
```

---

## Telemetry & Feature Flags

### Feature Flags Endpoint
```typescript
await fetch("https://api.anthropic.com/api/eval/sdk-zAZezfDKGoZuXXKe", {
  method: "POST",
  headers: standardHeaders,
  body: JSON.stringify({
    attributes: {
      id: deviceId,
      sessionId,
      deviceID: deviceId,
      platform: process.platform,
      appVersion: "2.1.29",
      userType: "external",
    },
    forcedVariations: {},
    forcedFeatures: [],
    url: "",
  }),
});
```

Returns `tengu_*` feature flags. Cached for 5 minutes.

### Anthropic Telemetry
```typescript
await fetch("https://api.anthropic.com/api/event_logging/batch", {
  method: "POST",
  headers: standardHeaders,
  body: JSON.stringify({
    events: [{
      event: "api_call",
      timestamp: new Date().toISOString(),
      properties: {
        model,
        duration_ms,
        input_tokens,
        output_tokens,
        session_id,
        device_id,
        app_version,
      },
    }],
  }),
});
```

Returns 400 (non-critical, ignored).

### Datadog Telemetry
```typescript
const ddTags = [
  `arch:${process.arch}`,
  `client_type:cli`,
  `model:${model}`,
  `platform:${process.platform}`,
  `provider:firstParty`,
  `user_bucket:${Math.floor(Math.random() * 10)}`,
  `user_type:external`,
  `version:${CLI_VERSION}`,
].join(",");

await fetch("https://http-intake.logs.us5.datadoghq.com/api/v2/logs", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "DD-API-KEY": "pubbbf48e6d78dae54bceaa4acf463299bf",
  },
  body: JSON.stringify([{
    ddsource: "nodejs",
    ddtags,
    message: "tengu_api_success",
    service: "claude-code",
    // ... more fields
  }]),
});
```

---

## Performance Optimization

### SDK Overhead
The Claude Agent SDK spawns a subprocess (`cli.js`, 11MB):
- Cold start: ~1800ms
- Warm start (pooled): ~750ms

### Direct API Approach
Bypassing the SDK subprocess:
- One-shot: ~650ms
- Streaming: similar

### Optimization Strategies

1. **Minimal mode**: Skip telemetry for fastest response
2. **Session pooling**: Keep subprocess warm between calls
3. **Direct API**: Eliminate subprocess entirely for simple tasks
4. **Parallel tool execution**: When tools are independent

### Benchmark Results
```
SDK (cold):     ~1871ms
SDK (warm):     ~750ms  (session pooling)
Direct API:    ~650ms  (minimal mode)

Improvement: 60% faster with direct API
```

---

## Testing Methodology

### Traffic Capture with mitmproxy

```bash
# Install
brew install mitmproxy

# Start proxy
mitmdump -p 8080 -w /tmp/traffic.flow

# Run test through proxy
HTTPS_PROXY=http://localhost:8080 \
NODE_TLS_REJECT_UNAUTHORIZED=0 \
npx tsx test-file.ts

# Analyze
mitmdump -r /tmp/traffic.flow --flow-detail 2
```

### In-Process Traffic Capture

```typescript
import { enableTrafficLogging, getTrafficSummary } from "./testing/traffic-capture.js";

enableTrafficLogging({ verbose: true });

// ... run your code ...

console.log(getTrafficSummary());
```

Note: Only captures traffic from current Node.js process. SDK subprocess traffic requires mitmproxy.

### Benchmark Harness

```typescript
import { runBenchmark } from "./testing/benchmark.js";

await runBenchmark({
  name: "comparison",
  warmup: 2,
  iterations: 5,
  implementations: [
    { name: "direct", fn: async () => { /* ... */ } },
    { name: "sdk", fn: async () => { /* ... */ } },
  ],
});
```

### Test Files

| File | Purpose |
|------|---------|
| `testing/test-direct-tool-loop.ts` | Direct API tool use (minimal) |
| `testing/test-direct-tool-loop-full.ts` | Direct API tool use (full mode) |
| `testing/test-sdk-tool-loop.ts` | SDK tool use comparison |
| `sdk-tests/test-v2*.ts` | SDK V2 session API tests |
| `sdk-tests/test-streaming.ts` | Streaming behavior |
| `sdk-tests/test-dual-pool.ts` | Session pooling |

---

## SDK V2 API (Unstable)

The SDK provides an unstable V2 API for session management:

```typescript
import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

const session = unstable_v2_createSession({
  model: "claude-haiku-4-5-20251001",
  permissionMode: "bypassPermissions",
});

await session.send("Hello");

for await (const msg of session.stream()) {
  // Process messages
}

session.close();
```

See `sdk-tests/test-v2*.ts` for examples.

---

## Quick Reference

### Minimal One-Shot Query
```typescript
const res = await fetch("https://api.anthropic.com/v1/messages?beta=true", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "oauth-2025-04-20",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello" }],
  }),
});
```

### Environment Variables
```bash
CLAUDE_CODE_OAUTH_TOKEN          # OAuth token
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=true  # Skip telemetry
CLAUDE_CODE_ENABLE_TELEMETRY=false             # Skip telemetry
```
