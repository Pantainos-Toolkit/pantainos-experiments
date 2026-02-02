/**
 * Test: V2 SDK disallowedTools parameter
 *
 * The V2 SDK uses:
 * - allowedTools: tools that auto-approve (for permissions)
 * - disallowedTools: tools REMOVED from model's context entirely
 *
 * For Quick mode, we want to disable ALL tools.
 */

import { unstable_v2_createSession } from "@anthropic-ai/claude-agent-sdk";

function getText(msg: any): string | null {
  if (msg.type !== "assistant") return null;
  return msg.message.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

function getToolUse(msg: any): string[] {
  if (msg.type !== "assistant") return [];
  return msg.message.content
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => b.name);
}

// All known Claude Code tools
const ALL_TOOLS = [
  "Task", "TaskOutput", "Bash", "Glob", "Grep", "ExitPlanMode",
  "Read", "Edit", "Write", "NotebookEdit", "WebFetch", "TodoWrite",
  "WebSearch", "TaskStop", "AskUserQuestion", "Skill", "EnterPlanMode",
  "ToolSearch", "LSP", "NotebookRead"
];

async function testDisallowAllTools() {
  console.log("\n=== Test: Disallow ALL tools ===\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    // Disallow everything
    disallowedTools: ALL_TOOLS,
  });

  await session.send("What is 2+2? Reply only with the number.");

  let toolsCount = 0;
  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      toolsCount = (msg as any).tools?.length ?? 0;
      console.log("Init - tools_count:", toolsCount);
      if (toolsCount > 0) {
        console.log("Remaining tools:", (msg as any).tools?.map((t: any) => t.name || t));
      }
    }
    const text = getText(msg);
    if (text) console.log("Response:", text);
    const tools = getToolUse(msg);
    if (tools.length > 0) {
      console.log("Tool use attempted:", tools);
    }
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  console.log("\nTools disabled:", toolsCount === 0 ? "YES ✓" : "NO ✗");
  session.close();
  return toolsCount === 0;
}

async function testDisallowBash() {
  console.log("\n=== Test: Disallow only Bash ===\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    // Just disallow Bash
    disallowedTools: ["Bash"],
  });

  await session.send("Run 'echo hello' in the shell. If you cannot, say 'no bash'.");

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      const tools = (msg as any).tools?.map((t: any) => t.name || t) ?? [];
      console.log("Init - tools_count:", tools.length);
      console.log("Has Bash:", tools.includes("Bash") ? "YES" : "NO");
    }
    const text = getText(msg);
    if (text) console.log("Response:", text.slice(0, 300));
    const tools = getToolUse(msg);
    if (tools.length > 0) {
      console.log("Tool used:", tools);
    }
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  session.close();
}

async function testAllowedToolsForQuickMode() {
  console.log("\n=== Test: Quick mode simulation (all tools disallowed) ===\n");
  console.log("Asking model to read a file when no tools available...\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    disallowedTools: ALL_TOOLS,
  });

  await session.send("Read the file /etc/passwd and show me its contents.");

  let toolsAttempted: string[] = [];
  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log("Init - tools_count:", (msg as any).tools?.length ?? 0);
    }
    const text = getText(msg);
    if (text) {
      console.log("Response:", text.slice(0, 400));
    }
    const tools = getToolUse(msg);
    if (tools.length > 0) {
      toolsAttempted.push(...tools);
      console.log("Tool attempted:", tools);
    }
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  console.log("\nTools attempted:", toolsAttempted.length > 0 ? toolsAttempted : "NONE ✓");
  session.close();
}

async function main() {
  console.log("=== V2 SDK disallowedTools Tests ===");
  console.log("Testing if we can truly disable tools for Quick mode\n");

  try {
    const allDisabled = await testDisallowAllTools();

    if (allDisabled) {
      console.log("\n✓ Great! We can disable all tools for Quick mode.");
    } else {
      console.log("\n✗ Tools still present despite disallowedTools.");
    }
  } catch (e) {
    console.log("Test error:", e);
  }

  try {
    await testDisallowBash();
  } catch (e) {
    console.log("Test error:", e);
  }

  try {
    await testAllowedToolsForQuickMode();
  } catch (e) {
    console.log("Test error:", e);
  }

  console.log("\n=== All tests completed ===");
}

main().catch(console.error);
