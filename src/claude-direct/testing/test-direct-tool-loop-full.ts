#!/usr/bin/env npx tsx
/**
 * Test direct API tool use loop WITH telemetry - see full network flow
 */

import { enableTrafficLogging, getTrafficLog, getTrafficSummary } from "./traffic-capture.js";

const API_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";
const BETA_FLAGS = [
  "oauth-2025-04-20",
  "interleaved-thinking-2025-05-14",
  "context-management-2025-06-27",
  "prompt-caching-scope-2026-01-05",
].join(",");

const EVAL_SDK_KEY = "sdk-zAZezfDKGoZuXXKe";
const CLI_VERSION = "2.1.29";

// Calculator tool definition
const calculatorTool = {
  name: "calculator",
  description: "Performs basic arithmetic. Use this for any math calculations.",
  input_schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The operation to perform",
      },
      a: { type: "number", description: "First operand" },
      b: { type: "number", description: "Second operand" },
    },
    required: ["operation", "a", "b"],
  },
};

function executeCalculator(input: { operation: string; a: number; b: number }): string {
  const { operation, a, b } = input;
  switch (operation) {
    case "add": return String(a + b);
    case "subtract": return String(a - b);
    case "multiply": return String(a * b);
    case "divide": return String(a / b);
    default: return `Unknown operation: ${operation}`;
  }
}

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${process.env.CLAUDE_CODE_OAUTH_TOKEN}`,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-beta": BETA_FLAGS,
    "anthropic-dangerous-direct-browser-access": "true",
    "x-app": "cli",
    "User-Agent": `claude-cli/${CLI_VERSION}`,
  };
}

interface Message {
  role: "user" | "assistant";
  content: any;
}

// Fetch feature flags (full mode only)
async function fetchFeatureFlags(deviceId: string, sessionId: string): Promise<void> {
  console.log("  [Telemetry] Fetching feature flags...");
  await fetch(`${API_BASE}/api/eval/${EVAL_SDK_KEY}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      attributes: {
        id: deviceId,
        sessionId,
        deviceID: deviceId,
        platform: process.platform,
        appVersion: CLI_VERSION,
        userType: "external",
      },
      forcedVariations: {},
      forcedFeatures: [],
      url: "",
    }),
  });
}

// Send telemetry (full mode only)
async function sendTelemetry(sessionId: string, usage: { input: number; output: number }, durationMs: number): Promise<void> {
  console.log("  [Telemetry] Sending event log...");
  // Anthropic telemetry - fire and forget
  fetch(`${API_BASE}/api/event_logging/batch`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      events: [{
        event: "api_call",
        timestamp: new Date().toISOString(),
        properties: {
          model: "claude-haiku-4-5-20251001",
          duration_ms: durationMs,
          input_tokens: usage.input,
          output_tokens: usage.output,
          session_id: sessionId,
          app_version: CLI_VERSION,
        },
      }],
    }),
  }).catch(() => {});
}

async function makeApiCall(messages: Message[], tools: any[]): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/messages?beta=true`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages,
      tools,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error: ${res.status} ${error}`);
  }

  return res.json();
}

async function main() {
  console.log("=".repeat(60));
  console.log("Direct API Tool Use Loop - WITH TELEMETRY");
  console.log("=".repeat(60));

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error("ERROR: CLAUDE_CODE_OAUTH_TOKEN not set");
    process.exit(1);
  }

  // Enable traffic capture
  enableTrafficLogging({ verbose: true });

  const startTime = Date.now();
  const tools = [calculatorTool];
  const deviceId = "test-device-123";
  const sessionId = "test-session-" + Date.now();

  // FULL MODE: Fetch feature flags first
  console.log("\n[Startup] Full mode - fetching feature flags...");
  await fetchFeatureFlags(deviceId, sessionId);

  // Initial message
  const messages: Message[] = [
    { role: "user", content: "What is 15 + 27? You MUST use the calculator tool to compute this." },
  ];

  console.log("\n[Turn 1] Sending initial request...");
  console.log(`  User: "${messages[0].content}"`);

  let callStart = Date.now();
  let response = await makeApiCall(messages, tools);
  let turnCount = 1;

  // FULL MODE: Send telemetry after each API call
  await sendTelemetry(sessionId, {
    input: response.usage?.input_tokens || 0,
    output: response.usage?.output_tokens || 0
  }, Date.now() - callStart);

  // Tool use loop
  while (response.stop_reason === "tool_use") {
    console.log(`\n[Turn ${turnCount}] Response received`);
    console.log(`  Stop reason: ${response.stop_reason}`);

    const toolUses = response.content.filter((block: any) => block.type === "tool_use");

    // Add assistant message to history
    messages.push({ role: "assistant", content: response.content });

    // Process tool calls
    const toolResults: any[] = [];
    for (const toolUse of toolUses) {
      console.log(`  Tool call: ${toolUse.name} -> ${executeCalculator(toolUse.input)}`);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: executeCalculator(toolUse.input),
      });
    }

    // Add tool results as user message
    messages.push({ role: "user", content: toolResults });

    turnCount++;
    console.log(`\n[Turn ${turnCount}] Sending tool results...`);

    callStart = Date.now();
    response = await makeApiCall(messages, tools);

    // FULL MODE: Send telemetry after each API call
    await sendTelemetry(sessionId, {
      input: response.usage?.input_tokens || 0,
      output: response.usage?.output_tokens || 0
    }, Date.now() - callStart);
  }

  // Final response
  console.log(`\n[Turn ${turnCount}] Final response received`);
  console.log(`  Stop reason: ${response.stop_reason}`);

  const finalText = response.content.find((block: any) => block.type === "text");
  if (finalText) {
    console.log(`  Final answer: "${finalText.text}"`);
  }

  const totalTime = Date.now() - startTime;

  // Wait for async telemetry
  console.log("\n[Cleanup] Waiting for async telemetry...");
  await new Promise(r => setTimeout(r, 1000));

  // Analyze traffic
  const traffic = getTrafficLog();
  console.log("\n" + "=".repeat(60));
  console.log("NETWORK TRAFFIC ANALYSIS");
  console.log("=".repeat(60));

  console.log(`\nTotal time: ${totalTime}ms`);
  console.log(`Total API calls: ${traffic.length}`);

  // Categorize calls
  const inferenceRequests = traffic.filter(t => t.url.includes("/v1/messages"));
  const featureFlagRequests = traffic.filter(t => t.url.includes("/api/eval"));
  const telemetryRequests = traffic.filter(t => t.url.includes("event_logging"));

  console.log(`\nBreakdown:`);
  console.log(`  Inference calls: ${inferenceRequests.length}`);
  console.log(`  Feature flag calls: ${featureFlagRequests.length}`);
  console.log(`  Telemetry calls: ${telemetryRequests.length}`);

  console.log("\nFull request sequence:");
  for (const line of getTrafficSummary()) {
    console.log(`  ${line}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("COMPARISON: MINIMAL vs FULL MODE");
  console.log("=".repeat(60));
  console.log(`
MINIMAL MODE (telemetry off):
  - 2 API calls total (for this tool use)
  - Only /v1/messages calls
  - Faster startup, lower overhead

FULL MODE (telemetry on):
  - ${traffic.length} API calls total
  - 1x feature flags at startup
  - ${inferenceRequests.length}x inference calls
  - ${telemetryRequests.length}x telemetry calls (after each inference)

OVERHEAD: ${traffic.length - inferenceRequests.length} extra calls
`);
}

main().catch(console.error);
