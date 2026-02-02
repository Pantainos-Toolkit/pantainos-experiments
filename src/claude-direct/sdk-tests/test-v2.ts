/**
 * Test: V2 SDK with /clear for context reset
 */

import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

function getText(msg: any): string | null {
  if (msg.type !== "assistant") return null;
  return msg.message.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

async function main() {
  console.log("=== V2 SDK Test with /clear ===\n");
  const startTime = Date.now();

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    persistSession: false,
  });

  console.log(`[${Date.now() - startTime}ms] Session created, sending task 1...`);

  // Task 1
  await session.send("What is 2+2? Reply ONLY with the number.");
  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log(`[${Date.now() - startTime}ms] SDK initialized`);
    }
    const text = getText(msg);
    if (text) console.log(`[${Date.now() - startTime}ms] Response 1: ${text}`);
  }

  // Try /clear
  console.log(`\n[${Date.now() - startTime}ms] Sending /clear...`);
  await session.send("/clear");
  for await (const msg of session.stream()) {
    const text = getText(msg);
    if (text) console.log(`[${Date.now() - startTime}ms] Clear response: ${text}`);
    if (msg.type === "result") {
      console.log(`[${Date.now() - startTime}ms] Clear result: ${(msg as any).subtype}`);
    }
  }

  // Task 2 (should have fresh context)
  console.log(`\n[${Date.now() - startTime}ms] Sending task 2...`);
  await session.send("What is 3+3? Reply ONLY with the number.");
  for await (const msg of session.stream()) {
    const text = getText(msg);
    if (text) console.log(`[${Date.now() - startTime}ms] Response 2: ${text}`);
  }

  // Task 3 (another cycle)
  console.log(`\n[${Date.now() - startTime}ms] Sending task 3...`);
  await session.send("What is 5*5? Reply ONLY with the number.");
  for await (const msg of session.stream()) {
    const text = getText(msg);
    if (text) console.log(`[${Date.now() - startTime}ms] Response 3: ${text}`);
  }

  console.log(`\n=== Done at ${Date.now() - startTime}ms ===`);
  session.close();
}

main().catch(console.error);
