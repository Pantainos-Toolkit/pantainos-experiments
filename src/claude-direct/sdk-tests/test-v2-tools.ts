/**
 * Test: V2 SDK tool configuration
 *
 * Questions to answer:
 * 1. Can we create a session with NO tools? (for Quick mode)
 * 2. Can we create a session with a subset of tools?
 * 3. What happens when we try to use a tool that's not enabled?
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

async function testNoTools() {
  console.log("\n=== Test 1: Session with NO tools ===\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    persistSession: false,
    // Try empty array for tools
    tools: [],
  });

  await session.send("What is 2+2? Reply only with the number.");

  let hasToolUse = false;
  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log("Init - tools_count:", (msg as any).tools?.length ?? "N/A");
    }
    const text = getText(msg);
    if (text) console.log("Response:", text);
    const tools = getToolUse(msg);
    if (tools.length > 0) {
      hasToolUse = true;
      console.log("Tool use detected:", tools);
    }
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  console.log("\nTool use in response:", hasToolUse);
  session.close();
}

async function testLimitedTools() {
  console.log("\n=== Test 2: Session with limited tools (Read only) ===\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    persistSession: false,
    // Try limiting to just Read
    tools: ["Read"],
  });

  await session.send("Read the file /etc/hostname and tell me its contents.");

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log("Init - tools_count:", (msg as any).tools?.length ?? "N/A");
      console.log("Init - tools:", (msg as any).tools?.map((t: any) => t.name || t).slice(0, 5) ?? "N/A");
    }
    const text = getText(msg);
    if (text) console.log("Response:", text.slice(0, 200));
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

async function testPresetTools() {
  console.log("\n=== Test 3: Session with preset tools ===\n");

  // Try the preset format that works in V1
  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    persistSession: false,
    tools: { type: "preset", preset: "claude_code" } as any,
  });

  await session.send("What is 2+2? Reply only with the number.");

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log("Init - tools_count:", (msg as any).tools?.length ?? "N/A");
    }
    const text = getText(msg);
    if (text) console.log("Response:", text);
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  session.close();
}

async function testToolRestrictionEnforced() {
  console.log("\n=== Test 4: Tool restriction enforcement ===\n");
  console.log("Creating session with only Read tool, asking to use Bash...\n");

  const session = unstable_v2_createSession({
    model: "haiku",
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    persistSession: false,
    tools: ["Read"],
  });

  await session.send("Run 'echo hello' using the Bash tool.");

  for await (const msg of session.stream()) {
    if (msg.type === "system" && (msg as any).subtype === "init") {
      console.log("Init - tools:", (msg as any).tools?.map((t: any) => t.name || t) ?? "N/A");
    }
    const text = getText(msg);
    if (text) console.log("Response:", text.slice(0, 300));
    const tools = getToolUse(msg);
    if (tools.length > 0) {
      console.log("Tool attempted:", tools);
    }
    if (msg.type === "result") {
      console.log("Result:", (msg as any).subtype);
    }
  }

  session.close();
}

async function main() {
  console.log("=== V2 SDK Tool Configuration Tests ===");
  console.log("Testing whether we can control tool availability in V2 sessions\n");

  try {
    await testNoTools();
  } catch (e) {
    console.log("Test 1 error:", e);
  }

  try {
    await testLimitedTools();
  } catch (e) {
    console.log("Test 2 error:", e);
  }

  try {
    await testPresetTools();
  } catch (e) {
    console.log("Test 3 error:", e);
  }

  try {
    await testToolRestrictionEnforced();
  } catch (e) {
    console.log("Test 4 error:", e);
  }

  console.log("\n=== All tests completed ===");
}

main().catch(console.error);
