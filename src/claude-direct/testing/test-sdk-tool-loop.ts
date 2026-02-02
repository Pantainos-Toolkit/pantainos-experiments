#!/usr/bin/env npx tsx
/**
 * Investigate SDK tool use loop and network calls with telemetry disabled
 */

import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { enableTrafficLogging, getTrafficLog, getTrafficSummary } from "./traffic-capture.js";

async function main() {
  console.log("=".repeat(60));
  console.log("SDK Tool Use Loop - Network Analysis");
  console.log("Telemetry: DISABLED");
  console.log("=".repeat(60));

  // Disable telemetry via environment
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "true";
  process.env.CLAUDE_CODE_ENABLE_TELEMETRY = "false";

  // Enable traffic capture
  enableTrafficLogging({ verbose: true, urlFilter: /anthropic\.com|datadoghq\.com/ });

  const startTime = Date.now();

  console.log("\n[Starting SDK query with tool]");
  console.log("Prompt: What is 15 + 27? Use the calculator tool.\n");

  // Track messages
  const messages: SDKMessage[] = [];
  let turnCount = 0;

  // Create SDK MCP server with calculator tool
  const q = query({
    prompt: "What is 15 + 27? Please compute this and give me the answer.",
    options: {
      model: "claude-haiku-4-5-20251001",
      maxTurns: 3,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  });

  // Stream through messages
  for await (const message of q) {
    messages.push(message);

    if (message.type === "assistant") {
      turnCount++;
      console.log(`\n--- Turn ${turnCount} (assistant) ---`);
      if (message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            console.log(`Text: ${block.text.substring(0, 200)}${block.text.length > 200 ? "..." : ""}`);
          } else if (block.type === "tool_use") {
            console.log(`Tool call: ${block.name}`);
            console.log(`Input: ${JSON.stringify(block.input)}`);
          }
        }
      }
    } else if (message.type === "result") {
      console.log(`\n--- Result ---`);
      console.log(`Subtype: ${message.subtype}`);
      if (message.subtype === "success") {
        console.log(`Result: ${message.result.substring(0, 200)}`);
      }
      console.log(`Turns: ${message.num_turns}`);
      console.log(`Cost: $${message.total_cost_usd.toFixed(6)}`);
    } else if (message.type === "system" && message.subtype === "init") {
      console.log(`\n--- System Init ---`);
      console.log(`Model: ${message.model}`);
      console.log(`Tools: ${message.tools.length}`);
    }
  }

  const totalTime = Date.now() - startTime;

  // Analyze traffic
  const traffic = getTrafficLog();
  console.log("\n" + "=".repeat(60));
  console.log("NETWORK TRAFFIC ANALYSIS");
  console.log("=".repeat(60));
  console.log(`\nTotal requests: ${traffic.length}`);
  console.log(`Total time: ${totalTime}ms`);
  console.log("\nRequest sequence:");
  for (const line of getTrafficSummary()) {
    console.log(`  ${line}`);
  }

  // Detailed breakdown
  console.log("\nDetailed breakdown:");
  for (let i = 0; i < traffic.length; i++) {
    const t = traffic[i];
    const url = new URL(t.url);
    console.log(`\n[${i + 1}] ${t.method} ${url.pathname}`);
    console.log(`    Status: ${t.status}`);
    console.log(`    Duration: ${t.durationMs.toFixed(0)}ms`);

    // Check for streaming
    if (t.requestBody?.stream !== undefined) {
      console.log(`    Streaming: ${t.requestBody.stream}`);
    }

    // Check for tools in request
    if (t.requestBody?.tools) {
      console.log(`    Tools defined: ${t.requestBody.tools.length}`);
    }

    // Check message count
    if (t.requestBody?.messages) {
      console.log(`    Messages in request: ${t.requestBody.messages.length}`);
      for (const msg of t.requestBody.messages) {
        const contentPreview = typeof msg.content === "string"
          ? msg.content.substring(0, 50)
          : Array.isArray(msg.content)
            ? `[${msg.content.length} blocks]`
            : "[unknown]";
        console.log(`      - ${msg.role}: ${contentPreview}`);
      }
    }
  }

  // Summary
  const inferenceRequests = traffic.filter(t => t.url.includes("/v1/messages"));
  const telemetryRequests = traffic.filter(t =>
    t.url.includes("event_logging") || t.url.includes("datadoghq") || t.url.includes("/api/eval")
  );

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Inference requests: ${inferenceRequests.length}`);
  console.log(`Telemetry requests: ${telemetryRequests.length}`);
  console.log(`Total network time: ${traffic.reduce((sum, t) => sum + t.durationMs, 0).toFixed(0)}ms`);

  if (telemetryRequests.length === 0) {
    console.log("\n✓ Telemetry successfully disabled - only inference calls made");
  } else {
    console.log("\n⚠ Telemetry requests detected despite being disabled:");
    for (const t of telemetryRequests) {
      console.log(`  - ${new URL(t.url).pathname}`);
    }
  }

  // Show the multi-turn pattern
  if (inferenceRequests.length > 1) {
    console.log("\n" + "=".repeat(60));
    console.log("MULTI-TURN PATTERN DETECTED");
    console.log("=".repeat(60));
    console.log(`\nThe SDK made ${inferenceRequests.length} inference calls.`);
    console.log("This is the tool-use loop in action:");
    for (let i = 0; i < inferenceRequests.length; i++) {
      const req = inferenceRequests[i];
      const msgCount = req.requestBody?.messages?.length || 0;
      console.log(`  ${i + 1}. ${msgCount} messages -> response (${req.durationMs.toFixed(0)}ms)`);
    }
  }
}

main().catch(console.error);
