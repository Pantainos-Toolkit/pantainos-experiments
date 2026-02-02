/**
 * Test script to observe Claude Code SDK initialization timing
 * Run with: LOG_LEVEL=debug npx tsx src/test-init-timing.ts
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const startTime = Date.now();

function timestamp() {
  return `+${Date.now() - startTime}ms`;
}

console.error(`[${timestamp()}] Starting SDK test...`);

// Simple one-shot query with minimal config
const response = query({
  prompt: "Reply with exactly: PONG",
  options: {
    model: "haiku",
    maxTurns: 1,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    tools: [], // No tools - pure inference
    persistSession: false,
  },
});

console.error(`[${timestamp()}] query() returned, iterating messages...`);

let messageCount = 0;
for await (const message of response) {
  messageCount++;
  const msgType = message.type;
  const subtype = (message as any).subtype || "";

  if (msgType === "system" && subtype === "init") {
    console.error(`[${timestamp()}] INIT: version=${(message as any).claude_code_version}, model=${(message as any).model}, tools=${(message as any).tools?.length || 0}`);
  } else if (msgType === "assistant") {
    const text = (message as any).message?.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("") || "";
    console.error(`[${timestamp()}] ASSISTANT: "${text.substring(0, 100)}"`);
  } else if (msgType === "result") {
    console.error(`[${timestamp()}] RESULT: subtype=${subtype}, tokens=${(message as any).usage?.input_tokens}/${(message as any).usage?.output_tokens}`);
  } else {
    console.error(`[${timestamp()}] ${msgType}: ${subtype}`);
  }
}

console.error(`[${timestamp()}] Done! Total messages: ${messageCount}`);
console.error(`[${timestamp()}] Total time: ${Date.now() - startTime}ms`);
