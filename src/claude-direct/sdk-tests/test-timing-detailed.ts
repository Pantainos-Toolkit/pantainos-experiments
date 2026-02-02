/**
 * Detailed timing test for Claude Code SDK
 * Tests cold start, warm session, and different configurations
 */

import { query, unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

const startTime = Date.now();
const ts = () => `+${(Date.now() - startTime).toString().padStart(5)}ms`;

async function testColdQuery() {
  console.error(`\n${ts()} === TEST 1: Cold query (no tools) ===`);
  const t0 = Date.now();

  const response = query({
    prompt: "Reply: PONG1",
    options: {
      model: "haiku",
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: [],
      persistSession: false,
    },
  });

  console.error(`${ts()} query() created (${Date.now() - t0}ms)`);

  let initTime = 0, firstTokenTime = 0, resultTime = 0;
  for await (const msg of response) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      initTime = Date.now() - t0;
      console.error(`${ts()} INIT received (${initTime}ms from start)`);
    } else if (msg.type === "assistant" && !firstTokenTime) {
      firstTokenTime = Date.now() - t0;
      console.error(`${ts()} First token (${firstTokenTime}ms, +${firstTokenTime - initTime}ms from init)`);
    } else if (msg.type === "result") {
      resultTime = Date.now() - t0;
      console.error(`${ts()} Result (${resultTime}ms total)`);
    }
  }

  const cleanupStart = Date.now();
  response.close();
  console.error(`${ts()} Cleanup done (+${Date.now() - cleanupStart}ms)`);

  return resultTime;
}

async function testV2Session() {
  console.error(`\n${ts()} === TEST 2: V2 Session (warm) ===`);

  // Create session
  const t0 = Date.now();
  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    disallowedTools: ["Task", "Bash", "Glob", "Grep", "Read", "Edit", "Write",
      "NotebookEdit", "WebFetch", "TodoWrite", "WebSearch", "TaskStop",
      "AskUserQuestion", "Skill", "EnterPlanMode", "ExitPlanMode", "LSP", "NotebookRead", "TaskOutput"],
  });
  console.error(`${ts()} Session created (${Date.now() - t0}ms)`);

  // First query (cold for session)
  const t1 = Date.now();
  await session.send("Reply: PONG2");
  console.error(`${ts()} First send() (${Date.now() - t1}ms)`);

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.error(`${ts()} INIT (session)`);
    } else if (msg.type === "result") {
      console.error(`${ts()} First query done (${Date.now() - t1}ms from send)`);
      break;
    }
  }

  // Second query (warm!)
  const t2 = Date.now();
  await session.send("/clear"); // Clear context
  for await (const _ of session.stream()) {} // Drain
  console.error(`${ts()} /clear done (${Date.now() - t2}ms)`);

  const t3 = Date.now();
  await session.send("Reply: PONG3");
  console.error(`${ts()} Second send() (${Date.now() - t3}ms)`);

  for await (const msg of session.stream()) {
    if (msg.type === "result") {
      console.error(`${ts()} Second query done (${Date.now() - t3}ms from send) - THIS IS WARM!`);
      break;
    }
  }

  // Third query (warm again)
  const t4 = Date.now();
  await session.send("/clear");
  for await (const _ of session.stream()) {}
  await session.send("Reply: PONG4");
  for await (const msg of session.stream()) {
    if (msg.type === "result") {
      console.error(`${ts()} Third query done (${Date.now() - t4}ms including /clear)`);
      break;
    }
  }

  session.close();
  console.error(`${ts()} Session closed`);
}

async function main() {
  console.error(`${ts()} Starting timing tests...`);

  await testColdQuery();
  await testV2Session();

  console.error(`\n${ts()} All tests complete!`);
}

main().catch(console.error);
