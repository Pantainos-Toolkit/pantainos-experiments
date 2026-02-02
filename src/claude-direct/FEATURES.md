# Claude Direct - Feature Parity Roadmap

Features from Claude SDK/CLI that we should support.

## Core Features

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Basic messages | ✅ Done | - | Single turn query |
| Streaming | ✅ Done | - | `queryStream()` |
| System prompts | ✅ Done | - | Via options |
| OAuth auth | ✅ Done | - | `anthropic-beta: oauth-2025-04-20` |
| Model selection | ✅ Done | - | Haiku, Sonnet, Opus |

## In Progress

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Tool use | 🔲 TODO | High | Requires multi-turn loop |
| Multi-turn conversations | 🔲 TODO | High | Message history management |
| Extended thinking | 🔲 TODO | Medium | `interleaved-thinking-2025-05-14` beta |
| Prompt caching | 🔲 TODO | Medium | `prompt-caching-scope-2026-01-05` beta |

## Planned

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Structured output (JSON mode) | 🔲 TODO | Medium | `response_format: { type: "json_object" }` |
| Vision (images) | 🔲 TODO | Low | Base64 image content blocks |
| PDF support | 🔲 TODO | Low | Document content blocks |
| Token counting | 🔲 TODO | Low | Pre-flight token estimation |
| Rate limit handling | 🔲 TODO | Medium | Retry with backoff |

## SDK Headers & Betas

Current beta flags (from CLI capture):
```
oauth-2025-04-20              # OAuth token support
interleaved-thinking-2025-05-14   # Extended thinking
context-management-2025-06-27     # Context management
prompt-caching-scope-2026-01-05   # Prompt caching
```

## API Endpoints

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `POST /v1/messages` | Inference | Core |
| `POST /api/eval/{sdk-key}` | Feature flags | Full mode |
| `POST /api/event_logging/batch` | Anthropic telemetry | Full mode |
| `POST datadoghq.com/api/v2/logs` | Datadog metrics | Full mode |

## Tool Use Loop - Network Analysis

From `test-direct-tool-loop.ts` testing (2026-02-03):

### Minimal Mode (telemetry off)
```
Turn 1: POST /v1/messages (1 user message) -> tool_use
Turn 2: POST /v1/messages (3 messages: user, assistant, tool_result) -> end_turn

Total: 2 API calls, ~2300ms
```

### Full Mode (telemetry on)
```
Startup: POST /api/eval/{sdk-key} (feature flags) -> 357ms
Turn 1:  POST /v1/messages -> tool_use (1030ms)
         POST /api/event_logging/batch -> 400 (ignored)
Turn 2:  POST /v1/messages -> end_turn (1242ms)
         POST /api/event_logging/batch -> 400 (ignored)

Total: 5 API calls, ~2642ms
Overhead: 3 extra calls (1 feature flags + 2 telemetry)
```

### Key Findings

1. **Tool use pattern**:
   - Send messages + tools → check `stop_reason`
   - If `tool_use`: append assistant msg, add `tool_result`, retry
   - If `end_turn`: done

2. **Message history grows each turn**:
   - Call 1: 1 message
   - Call 2: 3 messages (user, assistant+tool_use, user+tool_result)

3. **Tools resent every call** - no server-side state

4. **Telemetry returns 400** - non-critical, fire-and-forget

## Testing Checklist

For each feature, we need:
- [ ] Unit test with mocked responses
- [ ] Integration test with real API
- [ ] Traffic capture verification (mitmproxy)
- [ ] Benchmark vs SDK equivalent
- [ ] Error handling coverage
