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

## Testing Checklist

For each feature, we need:
- [ ] Unit test with mocked responses
- [ ] Integration test with real API
- [ ] Traffic capture verification (mitmproxy)
- [ ] Benchmark vs SDK equivalent
- [ ] Error handling coverage
