/**
 * Benchmark Claude Direct vs SDK - multiple iterations
 */

import { ClaudeDirect } from "./index.js";
import { query } from "@anthropic-ai/claude-agent-sdk";

const PROMPT = "Reply with exactly: PONG";
const ITERATIONS = 3;

async function benchmarkDirect(): Promise<number[]> {
  const times: number[] = [];

  // Create client once (simulates warm pool)
  const client = new ClaudeDirect({
    oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN!,
    model: "claude-haiku-4-5-20251001",
    skipQuotaCheck: true,
    skipTelemetry: true, // Skip for benchmark
  });

  // Warm up feature flags
  console.log("  Warming up feature flags...");
  await client.fetchFeatureFlags();

  for (let i = 0; i < ITERATIONS; i++) {
    const start = Date.now();
    await client.query({
      messages: [{ role: "user", content: PROMPT }],
    });
    times.push(Date.now() - start);
    console.log(`  Run ${i + 1}: ${times[i]}ms`);
  }

  return times;
}

async function benchmarkSDK(): Promise<number[]> {
  const times: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const start = Date.now();

    const response = query({
      prompt: PROMPT,
      options: {
        model: "haiku",
        maxTurns: 1,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        tools: [],
        persistSession: false,
      },
    });

    for await (const msg of response) {
      if (msg.type === "result") break;
    }

    times.push(Date.now() - start);
    console.log(`  Run ${i + 1}: ${times[i]}ms`);
  }

  return times;
}

function stats(times: number[]): { min: number; max: number; avg: number; median: number } {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

async function main() {
  console.log(`Benchmarking ${ITERATIONS} iterations each...\n`);

  console.log("=== Claude Direct (warm, no subprocess) ===");
  const directTimes = await benchmarkDirect();
  const directStats = stats(directTimes);

  console.log("\n=== Claude Code SDK (cold subprocess each time) ===");
  const sdkTimes = await benchmarkSDK();
  const sdkStats = stats(sdkTimes);

  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));
  console.log(`\nClaude Direct (warm):`);
  console.log(`  Min: ${directStats.min}ms | Max: ${directStats.max}ms | Avg: ${directStats.avg}ms | Median: ${directStats.median}ms`);
  console.log(`\nClaude Code SDK:`);
  console.log(`  Min: ${sdkStats.min}ms | Max: ${sdkStats.max}ms | Avg: ${sdkStats.avg}ms | Median: ${sdkStats.median}ms`);
  console.log(`\nSavings:`);
  console.log(`  Avg: ${sdkStats.avg - directStats.avg}ms faster (${Math.round((1 - directStats.avg / sdkStats.avg) * 100)}%)`);
  console.log(`  Best case: ${sdkStats.min - directStats.min}ms`);
}

main().catch(console.error);
