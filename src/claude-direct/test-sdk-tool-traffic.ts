/**
 * Capture SDK traffic when using tools to understand the tool loop protocol
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

// Prompt that will trigger Bash tool use
const PROMPT = `Run "echo HELLO_FROM_TOOL" in bash and tell me what it outputs.`;

async function main() {
  console.log("=== SDK Tool Traffic Capture ===\n");
  console.log("Prompt:", PROMPT);
  console.log("\n--- Messages ---\n");

  const startTime = Date.now();
  let turnCount = 0;

  const response = query({
    prompt: PROMPT,
    options: {
      model: "haiku",
      maxTurns: 3,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      // Define a simple tool
      tools: ["Bash"], // Use built-in Bash tool
    },
  });

  for await (const msg of response) {
    const elapsed = Date.now() - startTime;

    if (msg.type === "system") {
      if ((msg as any).subtype === "init") {
        console.log(`[${elapsed}ms] INIT: model=${(msg as any).model}, tools=${(msg as any).tools?.length}`);
      } else {
        console.log(`[${elapsed}ms] SYSTEM: ${(msg as any).subtype}`);
      }
    } else if (msg.type === "assistant") {
      turnCount++;
      const content = (msg as any).message?.content || [];
      console.log(`\n[${elapsed}ms] ASSISTANT (turn ${turnCount}):`);

      for (const block of content) {
        if (block.type === "text") {
          console.log(`  TEXT: ${block.text.substring(0, 100)}...`);
        } else if (block.type === "tool_use") {
          console.log(`  TOOL_USE: ${block.name}`);
          console.log(`    id: ${block.id}`);
          console.log(`    input: ${JSON.stringify(block.input).substring(0, 200)}`);
        } else if (block.type === "thinking") {
          console.log(`  THINKING: ${block.thinking?.substring(0, 50)}...`);
        }
      }

      // Log the raw stop_reason
      console.log(`  stop_reason: ${(msg as any).message?.stop_reason}`);
    } else if (msg.type === "user") {
      // Tool results come back as user messages
      const content = (msg as any).message?.content || [];
      console.log(`\n[${elapsed}ms] USER (tool result):`);
      for (const block of content) {
        if (block.type === "tool_result") {
          console.log(`  TOOL_RESULT for ${block.tool_use_id}:`);
          const resultStr = typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content);
          console.log(`    ${resultStr.substring(0, 200)}...`);
        }
      }
    } else if (msg.type === "result") {
      console.log(`\n[${elapsed}ms] RESULT:`);
      console.log(`  subtype: ${(msg as any).subtype}`);
      console.log(`  turns: ${(msg as any).num_turns}`);
      console.log(`  usage: ${JSON.stringify((msg as any).usage)}`);
      console.log(`  cost: $${(msg as any).total_cost_usd?.toFixed(6)}`);
    } else {
      console.log(`[${elapsed}ms] ${msg.type}: ${JSON.stringify(msg).substring(0, 100)}`);
    }
  }

  console.log(`\n--- Done in ${Date.now() - startTime}ms ---`);
}

main().catch(console.error);
