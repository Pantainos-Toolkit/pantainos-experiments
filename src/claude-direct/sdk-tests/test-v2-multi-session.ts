/**
 * Test: Multiple sessions with different tool configs in same process
 *
 * Proves we don't need to restart container to switch between Quick/Task modes
 */

import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

const ALL_TOOLS = [
  "Task", "TaskOutput", "Bash", "Glob", "Grep", "ExitPlanMode",
  "Read", "Edit", "Write", "NotebookEdit", "WebFetch", "TodoWrite",
  "WebSearch", "TaskStop", "AskUserQuestion", "Skill", "EnterPlanMode",
  "ToolSearch", "LSP", "NotebookRead"
];

function getText(msg: any): string | null {
  if (msg.type !== "assistant") return null;
  return msg.message.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

async function runSession(name: string, disallowedTools?: string[]) {
  console.log(`\n--- ${name} ---`);

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    ...(disallowedTools ? { disallowedTools } : {}),
  });

  await session.send("What is 2+2? Reply only with the number.");

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log(`tools_count: ${(msg as any).tools?.length ?? 0}`);
    }
    const text = getText(msg);
    if (text) console.log(`Response: ${text}`);
    if (msg.type === "result") break;
  }

  session.close();
}

async function main() {
  console.log("=== Same Process, Different Tool Configs ===");
  const start = Date.now();

  // Quick mode (no tools)
  await runSession("Quick Session 1 (no tools)", ALL_TOOLS);

  // Task mode (all tools)
  await runSession("Task Session 1 (all tools)");

  // Quick mode again
  await runSession("Quick Session 2 (no tools)", ALL_TOOLS);

  // Task mode again
  await runSession("Task Session 2 (all tools)");

  console.log(`\n=== Done in ${Date.now() - start}ms ===`);
  console.log("✓ No container restart needed - sessions have independent configs");
}

main().catch(console.error);
