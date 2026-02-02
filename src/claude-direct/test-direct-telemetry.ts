import { ClaudeDirect } from "./index.js";

async function main() {
  console.log("Testing Claude Direct with full telemetry...\n");

  const client = new ClaudeDirect({
    oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
    model: "claude-haiku-4-5-20251001",
    skipQuotaCheck: true,
    skipTelemetry: false, // Enable telemetry
  });

  // Patch fetch to log requests
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const start = Date.now();

    console.log(`[FETCH] ${init?.method || "GET"} ${url.substring(0, 80)}...`);

    try {
      const res = await originalFetch(input, init);
      console.log(`[FETCH] <- ${res.status} (${Date.now() - start}ms)`);
      return res;
    } catch (e: any) {
      console.log(`[FETCH] <- ERROR: ${e.message}`);
      throw e;
    }
  };

  const start = Date.now();
  const result = await client.query({
    messages: [{ role: "user", content: "Reply: PONG" }],
  });

  console.log(`\nResult: "${result.content}"`);
  console.log(`Total time: ${Date.now() - start}ms`);
  console.log(`Tokens: ${result.inputTokens} in / ${result.outputTokens} out`);

  // Wait for async telemetry to complete
  console.log("\nWaiting for async telemetry...");
  await new Promise(r => setTimeout(r, 2000));
  console.log("Done!");
}

main().catch(console.error);
