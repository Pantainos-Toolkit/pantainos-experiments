/**
 * Trace exactly where time is spent during SDK initialization
 * Captures subprocess stderr and measures each phase
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const startTime = Date.now();
const ts = () => `+${(Date.now() - startTime).toString().padStart(5)}ms`;

// Capture all stderr output with timestamps
const stderrLog: string[] = [];

async function traceQuery() {
  console.error(`${ts()} Creating query with stderr capture...`);

  const response = query({
    prompt: "Reply: PONG",
    options: {
      model: "haiku",
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: [],
      persistSession: false,
      // Capture stderr from the subprocess
      stderr: (data: string) => {
        const lines = data.split('\n').filter(l => l.trim());
        for (const line of lines) {
          stderrLog.push(`${ts()} [stderr] ${line}`);
        }
      },
    },
  });

  console.error(`${ts()} query() returned, awaiting messages...`);

  for await (const msg of response) {
    const type = msg.type;
    const subtype = (msg as any).subtype || "";

    if (type === "system" && subtype === "init") {
      console.error(`${ts()} [msg] INIT - v${(msg as any).claude_code_version}, model=${(msg as any).model}`);
    } else if (type === "assistant") {
      console.error(`${ts()} [msg] ASSISTANT`);
    } else if (type === "result") {
      console.error(`${ts()} [msg] RESULT - ${subtype}`);
    } else {
      console.error(`${ts()} [msg] ${type}:${subtype}`);
    }
  }

  console.error(`${ts()} Done iterating messages`);

  // Print captured stderr
  if (stderrLog.length > 0) {
    console.error(`\n=== Captured stderr (${stderrLog.length} lines) ===`);
    stderrLog.forEach(l => console.error(l));
  }
}

// Also try to see what the SDK does internally
console.error(`${ts()} Starting trace...`);
console.error(`${ts()} Node version: ${process.version}`);
console.error(`${ts()} CLAUDE_CODE_OAUTH_TOKEN: ${process.env.CLAUDE_CODE_OAUTH_TOKEN?.substring(0, 20)}...`);

traceQuery().then(() => {
  console.error(`\n${ts()} Complete!`);
}).catch(e => {
  console.error(`${ts()} Error:`, e);
});
