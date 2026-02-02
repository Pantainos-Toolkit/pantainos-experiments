import { queryDirect } from "./index.js";

async function main() {
  console.log("Testing Claude Direct with telemetry...");
  const r = await queryDirect("Reply: PONG", { model: "claude-haiku-4-5-20251001" });
  console.log("Result:", r.content, "- Time:", r.timeMs + "ms");
}

main().catch(console.error);
