/**
 * Capture actual HTTP traffic from SDK to understand the protocol
 */

import { enableTrafficLogging, getTrafficLog, getTrafficSummary } from "./testing/traffic-capture.js";

// Enable traffic capture BEFORE importing SDK
enableTrafficLogging({ verbose: true, urlFilter: /anthropic\.com/ });

// Now import SDK
const { query } = await import("@anthropic-ai/claude-agent-sdk");

const PROMPT = `Run "echo CAPTURED" in bash.`;

async function main() {
  console.log("=== SDK HTTP Traffic Capture ===\n");

  const response = query({
    prompt: PROMPT,
    options: {
      model: "haiku",
      maxTurns: 3,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      tools: ["Bash"],
    },
  });

  // Consume the stream
  for await (const msg of response) {
    if (msg.type === "result") {
      console.log(`\nResult: ${(msg as any).subtype}, turns: ${(msg as any).num_turns}`);
    }
  }

  // Print traffic summary
  console.log("\n=== HTTP Traffic Summary ===\n");
  for (const line of getTrafficSummary()) {
    console.log(line);
  }

  // Print detailed traffic
  console.log("\n=== Detailed Traffic ===\n");
  const log = getTrafficLog();
  for (const entry of log) {
    console.log(`\n--- ${entry.method} ${new URL(entry.url).pathname} ---`);
    console.log(`Status: ${entry.status} (${entry.durationMs.toFixed(0)}ms)`);

    // Key headers
    const interestingHeaders = ["anthropic-version", "anthropic-beta", "user-agent", "x-app"];
    for (const h of interestingHeaders) {
      if (entry.requestHeaders[h]) {
        console.log(`  ${h}: ${entry.requestHeaders[h]}`);
      }
    }

    // Request body summary
    if (entry.requestBody) {
      const body = entry.requestBody;
      if (body.model) console.log(`  model: ${body.model}`);
      if (body.max_tokens) console.log(`  max_tokens: ${body.max_tokens}`);
      if (body.messages) {
        console.log(`  messages: ${body.messages.length} messages`);
        for (const m of body.messages) {
          const content = m.content;
          if (typeof content === "string") {
            console.log(`    - ${m.role}: "${content.substring(0, 50)}..."`);
          } else if (Array.isArray(content)) {
            const types = content.map((b: any) => b.type).join(", ");
            console.log(`    - ${m.role}: [${types}]`);
          }
        }
      }
      if (body.tools) console.log(`  tools: ${body.tools.length} tools defined`);
      if (body.system) {
        const sysLen = typeof body.system === "string" ? body.system.length : JSON.stringify(body.system).length;
        console.log(`  system: ${sysLen} chars`);
      }
    }
  }
}

main().catch(console.error);
