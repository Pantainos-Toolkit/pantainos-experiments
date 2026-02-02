/**
 * Test: Streaming input mode with /clear for session reset
 */

import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID, type UUID } from "crypto";

function createUserMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: "test-session",
    uuid: randomUUID() as UUID,
  };
}

async function main() {
  console.log("=== Testing Streaming Input Mode with /clear ===\n");

  let resolveNext: ((value: SDKUserMessage) => void) | null = null;
  let shouldExit = false;

  async function* messageStream(): AsyncGenerator<SDKUserMessage> {
    while (!shouldExit) {
      const message = await new Promise<SDKUserMessage>((resolve) => {
        resolveNext = resolve;
      });
      yield message;
    }
  }

  const sendMessage = (msg: string) => {
    console.log(`[SEND] ${msg}`);
    if (resolveNext) {
      resolveNext(createUserMessage(msg));
      resolveNext = null;
    } else {
      console.log(`[WARN] No resolver ready!`);
    }
  };

  console.log("[1] Starting streaming query...");
  const startTime = Date.now();

  const response = query({
    prompt: messageStream(),
    options: {
      model: "haiku",
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      persistSession: false,
    },
  });

  // Process messages
  (async () => {
    try {
      for await (const message of response) {
        const elapsed = Date.now() - startTime;
        console.log(`[${elapsed}ms] MSG: type=${message.type}, subtype=${(message as any).subtype || 'N/A'}`);

        if (message.type === "assistant") {
          const content = (message as any).message?.content || [];
          for (const block of content) {
            if (block.type === "text") {
              console.log(`[${elapsed}ms] ASSISTANT: ${block.text}`);
            }
          }
        } else if (message.type === "result") {
          console.log(`[${elapsed}ms] RESULT: ${JSON.stringify(message).slice(0, 200)}`);
        }
      }
    } catch (err) {
      console.log(`[ERROR] ${err}`);
    }
    console.log("[STREAM ENDED]");
  })();

  // Wait for init
  console.log("Waiting for SDK init...");
  await new Promise((r) => setTimeout(r, 5000));

  // Task 1
  console.log("\n--- Task 1 ---");
  sendMessage("What is 2+2? Reply with just the number, nothing else.");
  await new Promise((r) => setTimeout(r, 6000));

  // Clear
  console.log("\n--- /clear ---");
  sendMessage("/clear");
  await new Promise((r) => setTimeout(r, 2000));

  // Task 2
  console.log("\n--- Task 2 ---");
  sendMessage("What is 3+3? Reply with just the number, nothing else.");
  await new Promise((r) => setTimeout(r, 6000));

  console.log("\n=== Test Complete ===");
  shouldExit = true;
  response.close();
  process.exit(0);
}

main().catch(console.error);
