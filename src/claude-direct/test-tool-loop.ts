/**
 * Test the tool loop implementation
 */

import { createClient } from "./index.js";
import { executeToolLoop, exampleTools, exampleHandlers } from "./tool-loop.js";

async function main() {
  console.log("=== Tool Loop Test ===\n");

  const client = createClient({
    model: "claude-haiku-4-5-20251001",
    minimal: true,
  });

  // Test 1: Simple tool use
  console.log("Test 1: Weather lookup\n");
  const result1 = await executeToolLoop(client, {
    messages: [
      { role: "user", content: "What's the weather in Tokyo?" },
    ],
    tools: exampleTools,
    toolHandlers: exampleHandlers,
    maxTurns: 3,
    onToolUse: (name, input, result) => {
      console.log(`  [TOOL] ${name}(${JSON.stringify(input)}) -> ${result}`);
    },
  });

  console.log(`\nResult: "${result1.content}"`);
  console.log(`Turns: ${result1.turns}`);
  console.log(`Tokens: ${result1.totalInputTokens} in / ${result1.totalOutputTokens} out`);
  console.log(`Tool calls: ${result1.toolCalls.length}`);

  // Test 2: Multiple tool calls
  console.log("\n" + "=".repeat(50));
  console.log("\nTest 2: Calculation with weather context\n");

  const result2 = await executeToolLoop(client, {
    messages: [
      {
        role: "user",
        content: "What's 15% of 200? Also, what's the weather in San Francisco?"
      },
    ],
    tools: exampleTools,
    toolHandlers: exampleHandlers,
    maxTurns: 5,
    onToolUse: (name, input, result) => {
      console.log(`  [TOOL] ${name}(${JSON.stringify(input)}) -> ${result}`);
    },
  });

  console.log(`\nResult: "${result2.content}"`);
  console.log(`Turns: ${result2.turns}`);
  console.log(`Tool calls: ${result2.toolCalls.length}`);

  // Test 3: No tool needed
  console.log("\n" + "=".repeat(50));
  console.log("\nTest 3: No tool needed\n");

  const result3 = await executeToolLoop(client, {
    messages: [
      { role: "user", content: "What is 2 + 2? Answer directly without tools." },
    ],
    tools: exampleTools,
    toolHandlers: exampleHandlers,
    maxTurns: 1,
  });

  console.log(`Result: "${result3.content}"`);
  console.log(`Turns: ${result3.turns}`);
  console.log(`Tool calls: ${result3.toolCalls.length}`);

  console.log("\n=== Done ===");
}

main().catch(console.error);
