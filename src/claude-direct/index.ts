/**
 * Claude Direct Client - Mimics Claude Code CLI protocol without subprocess overhead
 *
 * Modes:
 * - minimal: Just /v1/messages (fastest, matches CLI with DISABLE_NONESSENTIAL_TRAFFIC)
 * - full: Feature flags + quota check + telemetry (matches default CLI behavior)
 */

import { randomUUID } from "crypto";
import { createHash } from "crypto";

// Types
interface FeatureFlags {
  [key: string]: {
    value: any;
    on: boolean;
    off: boolean;
  };
}

interface ClaudeDirectConfig {
  oauthToken: string;
  model?: string;
  deviceId?: string;
  sessionId?: string;
  /** Minimal mode: skip feature flags & telemetry (fastest) */
  minimal?: boolean;
  /** Skip telemetry even in full mode */
  skipTelemetry?: boolean;
  /** Skip quota check */
  skipQuotaCheck?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: "text" | "image";
  text?: string;
  source?: { type: string; media_type: string; data: string };
}

interface QueryOptions {
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  stream?: boolean;
  tools?: any[];
}

interface QueryResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  stopReason: string;
}

// Constants
const API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const CLI_VERSION = "2.1.29";
const SDK_VERSION = "0.2.29";
const EVAL_SDK_KEY = "sdk-zAZezfDKGoZuXXKe";

// Beta flags that enable OAuth
const BETA_FLAGS = [
  "oauth-2025-04-20",
  "interleaved-thinking-2025-05-14",
  "context-management-2025-06-27",
  "prompt-caching-scope-2026-01-05",
].join(",");

// Telemetry endpoints (only used in full mode)
const DATADOG_ENDPOINT = "https://http-intake.logs.us5.datadoghq.com/api/v2/logs";
const DATADOG_API_KEY = "pubbbf48e6d78dae54bceaa4acf463299bf";

export class ClaudeDirect {
  private config: Required<Omit<ClaudeDirectConfig, 'minimal' | 'skipTelemetry' | 'skipQuotaCheck'>> & {
    minimal: boolean;
    skipTelemetry: boolean;
    skipQuotaCheck: boolean;
  };
  private featureFlags: FeatureFlags | null = null;
  private featureFlagsExpiry: number = 0;

  constructor(config: ClaudeDirectConfig) {
    this.config = {
      oauthToken: config.oauthToken,
      model: config.model || "claude-haiku-4-5-20251001",
      deviceId: config.deviceId || this.generateDeviceId(),
      sessionId: config.sessionId || randomUUID(),
      minimal: config.minimal ?? true, // Default to minimal (fastest)
      skipTelemetry: config.skipTelemetry ?? config.minimal ?? true,
      skipQuotaCheck: config.skipQuotaCheck ?? true,
    };
  }

  private generateDeviceId(): string {
    const data = `${process.platform}-${process.arch}-${process.env.USER || "unknown"}`;
    return createHash("sha256").update(data).digest("hex");
  }

  private estimateCost(usage: { input_tokens: number; output_tokens: number }): number {
    // Haiku pricing per 1M tokens
    const inputCostPer1M = 0.25;
    const outputCostPer1M = 1.25;
    return (
      (usage.input_tokens / 1_000_000) * inputCostPer1M +
      (usage.output_tokens / 1_000_000) * outputCostPer1M
    );
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${this.config.oauthToken}`,
      "anthropic-version": ANTHROPIC_VERSION,
      "anthropic-beta": BETA_FLAGS,
      "anthropic-dangerous-direct-browser-access": "true",
      "x-app": "cli",
      "User-Agent": `claude-cli/${CLI_VERSION} (external, cli, agent-sdk/${SDK_VERSION})`,
    };
  }

  /**
   * Fetch feature flags (only in full mode, cached for 5 min)
   */
  async fetchFeatureFlags(): Promise<FeatureFlags> {
    if (this.config.minimal) {
      return {}; // Skip in minimal mode
    }

    if (this.featureFlags && Date.now() < this.featureFlagsExpiry) {
      return this.featureFlags;
    }

    const res = await fetch(`${API_BASE}/api/eval/${EVAL_SDK_KEY}`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        attributes: {
          id: this.config.deviceId,
          sessionId: this.config.sessionId,
          deviceID: this.config.deviceId,
          platform: process.platform,
          appVersion: CLI_VERSION,
          userType: "external",
        },
        forcedVariations: {},
        forcedFeatures: [],
        url: "",
      }),
    });

    if (!res.ok) {
      // Non-fatal, continue without flags
      return {};
    }

    const data = await res.json();
    const flags: FeatureFlags = data.features || {};
    this.featureFlags = flags;
    this.featureFlagsExpiry = Date.now() + 5 * 60 * 1000;

    return flags;
  }

  /**
   * Quota check (optional, gets rate limit info)
   */
  async checkQuota(): Promise<{ allowed: boolean; utilization: number }> {
    if (this.config.skipQuotaCheck) {
      return { allowed: true, utilization: 0 };
    }

    const res = await fetch(`${API_BASE}/v1/messages?beta=true`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "quota" }],
        metadata: {
          user_id: `user_${this.config.deviceId}_session_${this.config.sessionId}`,
        },
      }),
    });

    const utilization = parseFloat(
      res.headers.get("anthropic-ratelimit-unified-5h-utilization") || "0"
    );
    const status = res.headers.get("anthropic-ratelimit-unified-status");

    return {
      allowed: status === "allowed",
      utilization,
    };
  }

  /**
   * Main inference call
   */
  async query(options: QueryOptions): Promise<QueryResult> {
    const startTime = Date.now();

    // Feature flags (skipped in minimal mode)
    if (!this.config.minimal) {
      await this.fetchFeatureFlags();
    }

    // Quota check (skipped by default)
    if (!this.config.skipQuotaCheck) {
      await this.checkQuota();
    }

    // Build request body
    const body: any = {
      model: this.config.model,
      max_tokens: options.maxTokens || 4096,
      messages: options.messages,
      metadata: {
        user_id: `user_${this.config.deviceId}_session_${this.config.sessionId}`,
      },
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    if (options.stream) {
      body.stream = true;
    }

    // Make the inference call
    const res = await fetch(`${API_BASE}/v1/messages?beta=true`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Inference failed: ${res.status} ${error}`);
    }

    const data = await res.json();
    const duration = Date.now() - startTime;

    const result: QueryResult = {
      content: data.content?.[0]?.text || "",
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      model: data.model,
      stopReason: data.stop_reason,
    };

    // Telemetry (async, non-blocking, skipped in minimal mode)
    if (!this.config.skipTelemetry) {
      this.sendTelemetry(duration, {
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      }).catch(() => {});
    }

    return result;
  }

  /**
   * Streaming inference
   */
  async *queryStream(options: QueryOptions): AsyncGenerator<string, QueryResult, unknown> {
    const startTime = Date.now();

    // Feature flags (skipped in minimal mode)
    if (!this.config.minimal) {
      await this.fetchFeatureFlags();
    }

    // Build request
    const body: any = {
      model: this.config.model,
      max_tokens: options.maxTokens || 4096,
      messages: options.messages,
      stream: true,
      metadata: {
        user_id: `user_${this.config.deviceId}_session_${this.config.sessionId}`,
      },
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const res = await fetch(`${API_BASE}/v1/messages?beta=true`, {
      method: "POST",
      headers: {
        ...this.getHeaders(),
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Inference failed: ${res.status} ${error}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let model = this.config.model;
    let stopReason = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);

          if (event.type === "content_block_delta" && event.delta?.text) {
            content += event.delta.text;
            yield event.delta.text;
          } else if (event.type === "message_delta") {
            stopReason = event.delta?.stop_reason || stopReason;
            outputTokens = event.usage?.output_tokens || outputTokens;
          } else if (event.type === "message_start") {
            model = event.message?.model || model;
            inputTokens = event.message?.usage?.input_tokens || inputTokens;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    const duration = Date.now() - startTime;

    // Telemetry (async, skipped in minimal mode)
    if (!this.config.skipTelemetry) {
      this.sendTelemetry(duration, { input_tokens: inputTokens, output_tokens: outputTokens }).catch(() => {});
    }

    return {
      content,
      inputTokens,
      outputTokens,
      model,
      stopReason,
    };
  }

  /**
   * Send telemetry (only in full mode)
   */
  private async sendTelemetry(
    durationMs: number,
    usage: { input_tokens: number; output_tokens: number }
  ): Promise<void> {
    // Anthropic event logging
    const anthropicTelemetry = fetch(`${API_BASE}/api/event_logging/batch`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        events: [
          {
            event: "api_call",
            timestamp: new Date().toISOString(),
            properties: {
              model: this.config.model,
              duration_ms: durationMs,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              session_id: this.config.sessionId,
              device_id: this.config.deviceId,
              app_version: CLI_VERSION,
            },
          },
        ],
      }),
    }).catch(() => {});

    // Datadog (optional, may fail)
    const userBucket = Math.floor(Math.random() * 10);
    const ddTags = [
      `arch:${process.arch}`,
      `client_type:cli`,
      `model:${this.config.model}`,
      `platform:${process.platform}`,
      `provider:firstParty`,
      `user_bucket:${userBucket}`,
      `user_type:external`,
      `version:${CLI_VERSION}`,
    ].join(",");

    const datadogTelemetry = fetch(DATADOG_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "DD-API-KEY": DATADOG_API_KEY,
        "User-Agent": "axios/1.8.4",
      },
      body: JSON.stringify([
        {
          ddsource: "nodejs",
          ddtags: ddTags,
          message: "tengu_api_success",
          service: "claude-code",
          hostname: "claude-code",
          env: "external",
          model: this.config.model,
          session_id: this.config.sessionId,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          duration_ms: durationMs,
          cost_u_s_d: this.estimateCost(usage),
          version: CLI_VERSION,
          platform: process.platform,
          arch: process.arch,
        },
      ]),
    }).catch(() => {});

    await Promise.all([anthropicTelemetry, datadogTelemetry]);
  }
}

// ============================================
// Simple helper functions
// ============================================

/**
 * Quick one-shot query (minimal mode, fastest)
 */
export async function queryDirect(
  prompt: string,
  options?: {
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    oauthToken?: string;
  }
): Promise<{ content: string; tokens: { input: number; output: number }; timeMs: number }> {
  const token = options?.oauthToken || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) throw new Error("Missing OAuth token");

  const startTime = Date.now();

  const client = new ClaudeDirect({
    oauthToken: token,
    model: options?.model,
    minimal: true, // Fastest mode
  });

  const result = await client.query({
    messages: [{ role: "user", content: prompt }],
    systemPrompt: options?.systemPrompt,
    maxTokens: options?.maxTokens,
  });

  return {
    content: result.content,
    tokens: { input: result.inputTokens, output: result.outputTokens },
    timeMs: Date.now() - startTime,
  };
}

/**
 * Create a reusable client for multiple queries
 */
export function createClient(options?: {
  model?: string;
  oauthToken?: string;
  minimal?: boolean;
}): ClaudeDirect {
  const token = options?.oauthToken || process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) throw new Error("Missing OAuth token");

  return new ClaudeDirect({
    oauthToken: token,
    model: options?.model,
    minimal: options?.minimal ?? true,
  });
}
