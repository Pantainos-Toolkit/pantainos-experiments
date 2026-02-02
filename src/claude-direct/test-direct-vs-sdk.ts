/**
 * Compare Claude Direct vs SDK timing
 */

import { ClaudeDirect, queryDirect } from "./index.js";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PROMPT = "Reply with exactly: PONG";

async function testDirect() {
  console.log("\n=== Claude Direct (no subprocess) ===");
  const start = Date.now();

  const result = await queryDirect(PROMPT, { model: "claude-haiku-4-5-20251001" });

  console.log(`Time: ${result.timeMs}ms`);
  console.log(`Response: "${result.content}"`);
  console.log(`Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);

  return result.timeMs;
}

async function testDirectCached() {
  console.log("\n=== Claude Direct (cached feature flags) ===");

  // Create client once, reuse
  const client = new ClaudeDirect({
    oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
    model: "claude-haiku-4-5-20251001",
    skipQuotaCheck: true,
  });

  // Warm up feature flags
  await client.fetchFeatureFlags();

  // Now test cached
  const start = Date.now();
  const result = await client.query({
    messages: [{ role: "user", content: PROMPT }],
  });
  const time = Date.now() - start;

  console.log(`Time: ${time}ms (with cached flags)`);
  console.log(`Response: "${result.content}"`);

  return time;
}

async function testSDK() {
  console.log("\n=== Claude Code SDK (subprocess) ===");
  const start = Date.now();

  let answer = "";
  let initTime = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const response = query({
    prompt: PROMPT,
    options: {
      model: "haiku",
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: [],
      persistSession: false,
    },
  });

  for await (const msg of response) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      initTime = Date.now() - start;
    } else if (msg.type === "assistant") {
      const content = (msg as any).message?.content || [];
      for (const block of content) {
        if (block.type === "text") answer += block.text;
      }
    } else if (msg.type === "result") {
      inputTokens = (msg as any).usage?.input_tokens || 0;
      outputTokens = (msg as any).usage?.output_tokens || 0;
    }
  }

  const totalTime = Date.now() - start;

  console.log(`Time: ${totalTime}ms (init: ${initTime}ms)`);
  console.log(`Response: "${answer}"`);
  console.log(`Tokens: ${inputTokens} in / ${outputTokens} out`);

  return totalTime;
}

async function main() {
  console.log("Comparing Claude Direct vs SDK...\n");

  // Run tests
  const directTime = await testDirect();
  const cachedTime = await testDirectCached();
  const sdkTime = await testSDK();

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Claude Direct (cold):   ${directTime}ms`);
  console.log(`Claude Direct (cached): ${cachedTime}ms`);
  console.log(`Claude Code SDK:        ${sdkTime}ms`);
  console.log();
  console.log(`Savings (cold):   ${sdkTime - directTime}ms (${Math.round((1 - directTime / sdkTime) * 100)}% faster)`);
  console.log(`Savings (cached): ${sdkTime - cachedTime}ms (${Math.round((1 - cachedTime / sdkTime) * 100)}% faster)`);
}

main().catch(console.error);
