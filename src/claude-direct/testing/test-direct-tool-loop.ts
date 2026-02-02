#!/usr/bin/env npx tsx
/**
 * Test direct API tool use loop - see exactly what network calls are needed
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
  };
}

interface Message {
  role: "user" | "assistant";
  content: any;
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
  console.log("Direct API Tool Use Loop - Network Analysis");
  console.log("=".repeat(60));

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error("ERROR: CLAUDE_CODE_OAUTH_TOKEN not set");
    process.exit(1);
  }

  // Enable traffic capture
  enableTrafficLogging({ verbose: true });

  const startTime = Date.now();
  const tools = [calculatorTool];

  // Initial message
  const messages: Message[] = [
    { role: "user", content: "What is 15 + 27? You MUST use the calculator tool to compute this." },
  ];

  console.log("\n[Turn 1] Sending initial request...");
  console.log(`  User: "${messages[0].content}"`);

  let response = await makeApiCall(messages, tools);
  let turnCount = 1;

  // Tool use loop
  while (response.stop_reason === "tool_use") {
    console.log(`\n[Turn ${turnCount}] Response received`);
    console.log(`  Stop reason: ${response.stop_reason}`);

    // Extract tool uses from response
    const toolUses = response.content.filter((block: any) => block.type === "tool_use");
    const textBlocks = response.content.filter((block: any) => block.type === "text");

    if (textBlocks.length > 0) {
      console.log(`  Text: "${textBlocks[0].text.substring(0, 100)}..."`);
    }

    // Add assistant message to history
    messages.push({ role: "assistant", content: response.content });

    // Process tool calls
    const toolResults: any[] = [];
    for (const toolUse of toolUses) {
      console.log(`\n  Tool call: ${toolUse.name}`);
      console.log(`    Input: ${JSON.stringify(toolUse.input)}`);

      // Execute tool
      let result: string;
      if (toolUse.name === "calculator") {
        result = executeCalculator(toolUse.input);
        console.log(`    Result: ${result}`);
      } else {
        result = `Unknown tool: ${toolUse.name}`;
        console.log(`    Result: ${result}`);
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results as user message
    messages.push({ role: "user", content: toolResults });

    turnCount++;
    console.log(`\n[Turn ${turnCount}] Sending tool results...`);

    response = await makeApiCall(messages, tools);
  }

  // Final response
  console.log(`\n[Turn ${turnCount}] Final response received`);
  console.log(`  Stop reason: ${response.stop_reason}`);

  const finalText = response.content.find((block: any) => block.type === "text");
  if (finalText) {
    console.log(`  Final answer: "${finalText.text}"`);
  }

  const totalTime = Date.now() - startTime;

  // Analyze traffic
  const traffic = getTrafficLog();
  console.log("\n" + "=".repeat(60));
  console.log("NETWORK TRAFFIC ANALYSIS");
  console.log("=".repeat(60));
  console.log(`\nTotal time: ${totalTime}ms`);
  console.log(`Total turns: ${turnCount}`);
  console.log(`Total API calls: ${traffic.length}`);

  console.log("\nRequest sequence:");
  for (const line of getTrafficSummary()) {
    console.log(`  ${line}`);
  }

  console.log("\nDetailed message flow:");
  for (let i = 0; i < traffic.length; i++) {
    const t = traffic[i];
    const msgCount = t.requestBody?.messages?.length || 0;
    console.log(`\n  [API Call ${i + 1}] ${t.durationMs.toFixed(0)}ms`);
    console.log(`    Messages: ${msgCount}`);
    if (t.requestBody?.messages) {
      for (const msg of t.requestBody.messages) {
        const contentType = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.type).join(", ")
          : "text";
        console.log(`      ${msg.role}: [${contentType}]`);
      }
    }
    console.log(`    Tools defined: ${t.requestBody?.tools?.length || 0}`);
  }

  // Token usage
  console.log("\n" + "=".repeat(60));
  console.log("TOKEN USAGE");
  console.log("=".repeat(60));
  console.log(`Input tokens: ${response.usage?.input_tokens || 0}`);
  console.log(`Output tokens: ${response.usage?.output_tokens || 0}`);

  console.log("\n" + "=".repeat(60));
  console.log("KEY FINDINGS");
  console.log("=".repeat(60));
  console.log(`
For tool use, the pattern is:
1. Send user message + tools definition
2. If stop_reason === "tool_use":
   a. Extract tool_use blocks from response
   b. Execute tools locally
   c. Append assistant message (with tool_use) to history
   d. Append user message with tool_result blocks
   e. Make another API call with full history + tools
3. Repeat until stop_reason === "end_turn"

Each API call includes:
- Full message history (grows each turn)
- Tools definition (repeated every call)
- Same headers (no session state on server)
`);
}

main().catch(console.error);
