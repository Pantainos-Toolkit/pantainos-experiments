# Testing Methodology

## Traffic Capture with mitmproxy

We use mitmproxy to intercept and analyze HTTPS traffic between the client and Anthropic API.

### Setup

```bash
# Install mitmproxy
brew install mitmproxy

# Start proxy (terminal 1)
mitmproxy -p 8080

# Or for automated capture to file
mitmdump -p 8080 -w /tmp/traffic.flow
```

### Running Tests Through Proxy

```bash
# Set proxy environment variables
export HTTPS_PROXY=http://localhost:8080
export HTTP_PROXY=http://localhost:8080
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Accept mitmproxy cert

# Run your test
npx tsx src/claude-direct/test-direct-api.ts
```

### Analyzing Traffic

```bash
# Read captured flow
mitmdump -r /tmp/traffic.flow -n

# Filter to Anthropic only
mitmdump -r /tmp/traffic.flow -n --flow-detail 2 | grep -A 50 "anthropic.com"

# Export to HAR for browser devtools
mitmdump -r /tmp/traffic.flow --set hardump=/tmp/traffic.har
```

### Key Things to Verify

1. **Headers match CLI** - Compare `User-Agent`, `anthropic-beta`, `x-app`
2. **Request body structure** - Exact field names and values
3. **Sequence of calls** - Feature flags → quota check → inference → telemetry
4. **Response handling** - Status codes, error formats

## Benchmark Harness

Use `benchmark.ts` to compare implementations:

```typescript
import { runBenchmark } from "./testing/benchmark.js";

await runBenchmark({
  name: "claude-direct vs SDK",
  warmup: 2,
  iterations: 5,
  implementations: [
    { name: "claude-direct", fn: async () => { /* ... */ } },
    { name: "sdk", fn: async () => { /* ... */ } },
  ],
});
```

## Test Categories

### 1. Unit Tests (mocked)
Test internal logic without hitting the API.
```bash
npx tsx src/claude-direct/testing/unit/*.test.ts
```

### 2. Integration Tests (real API)
Test against actual Anthropic API.
```bash
export CLAUDE_CODE_OAUTH_TOKEN="..."
npx tsx src/claude-direct/testing/integration/*.test.ts
```

### 3. Traffic Verification
Capture and compare traffic patterns.
```bash
# Capture CLI traffic
HTTPS_PROXY=http://localhost:8080 claude -p "test" --output-format json

# Capture our traffic
HTTPS_PROXY=http://localhost:8080 npx tsx src/claude-direct/test-direct-api.ts

# Compare the flows
```

### 4. Performance Benchmarks
Compare latency and throughput.
```bash
npx tsx src/claude-direct/test-direct-benchmark.ts
```
