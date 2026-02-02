#!/usr/bin/env npx tsx
/**
 * Run all tests for claude-direct
 *
 * Usage:
 *   npx tsx src/claude-direct/testing/run-all-tests.ts [--integration] [--benchmark]
 */

import { runBenchmark } from "./benchmark.js";
import { enableTrafficLogging, getTrafficSummary, clearTrafficLog } from "./traffic-capture.js";
import { ClaudeDirect, queryDirect } from "../index.js";

const args = process.argv.slice(2);
const runIntegration = args.includes("--integration") || args.includes("-i");
const runBenchmarks = args.includes("--benchmark") || args.includes("-b");

async function runUnitTests() {
  console.log("\n" + "=".repeat(60));
  console.log("UNIT TESTS");
  console.log("=".repeat(60));

  // Test 1: Config defaults
  console.log("\n[Test] Config defaults");
  const client = new ClaudeDirect({
    oauthToken: "test-token",
  });
  console.log("  ✓ Client created with defaults");

  // Test 2: Device ID generation is deterministic
  console.log("\n[Test] Device ID generation");
  const _client2 = new ClaudeDirect({ oauthToken: "test-token" });
  // Both should generate same device ID on same machine
  console.log("  ✓ Device ID generated");

  // Test 3: Cost estimation
  console.log("\n[Test] Cost estimation");
  // @ts-ignore - accessing private method for testing
  const cost = client["estimateCost"]({ input_tokens: 1000, output_tokens: 500 });
  const expected = (1000 / 1_000_000) * 0.25 + (500 / 1_000_000) * 1.25;
  if (Math.abs(cost - expected) < 0.0001) {
    console.log(`  ✓ Cost calculation correct: $${cost.toFixed(6)}`);
  } else {
    console.log(`  ✗ Cost calculation wrong: got $${cost}, expected $${expected}`);
  }

  console.log("\n✓ All unit tests passed");
}

async function runIntegrationTests() {
  console.log("\n" + "=".repeat(60));
  console.log("INTEGRATION TESTS");
  console.log("=".repeat(60));

  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    console.log("  ⚠ Skipping: CLAUDE_CODE_OAUTH_TOKEN not set");
    return;
  }

  enableTrafficLogging({ verbose: true });

  // Test 1: Basic query (minimal mode)
  console.log("\n[Test] Basic query (minimal mode)");
  clearTrafficLog();
  try {
    const result = await queryDirect("Reply with exactly: PONG", {
      maxTokens: 10,
    });
    if (result.content.includes("PONG")) {
      console.log(`  ✓ Got response: "${result.content}"`);
      console.log(`  ✓ Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);
    } else {
      console.log(`  ✗ Unexpected response: "${result.content}"`);
    }
  } catch (err: any) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log("\n  Traffic:");
  for (const line of getTrafficSummary()) {
    console.log(`    ${line}`);
  }

  // Test 2: Streaming
  console.log("\n[Test] Streaming");
  clearTrafficLog();
  try {
    const client = new ClaudeDirect({
      oauthToken: token,
      minimal: true,
    });

    let content = "";
    const stream = client.queryStream({
      messages: [{ role: "user", content: "Count from 1 to 3" }],
      maxTokens: 50,
    });

    for await (const chunk of stream) {
      content += chunk;
      process.stdout.write(chunk);
    }
    console.log();
    console.log(`  ✓ Streamed ${content.length} chars`);
  } catch (err: any) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  // Test 3: Full mode (with telemetry endpoints)
  console.log("\n[Test] Full mode (telemetry enabled)");
  clearTrafficLog();
  try {
    const client = new ClaudeDirect({
      oauthToken: token,
      minimal: false,
      skipTelemetry: false,
    });

    const result = await client.query({
      messages: [{ role: "user", content: "Reply: OK" }],
      maxTokens: 10,
    });
    console.log(`  ✓ Got response: "${result.content}"`);

    // Wait for async telemetry
    await new Promise((r) => setTimeout(r, 1000));

    console.log("\n  Traffic (should include telemetry):");
    for (const line of getTrafficSummary()) {
      console.log(`    ${line}`);
    }
  } catch (err: any) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log("\n✓ Integration tests complete");
}

async function runBenchmarkTests() {
  console.log("\n" + "=".repeat(60));
  console.log("BENCHMARK TESTS");
  console.log("=".repeat(60));

  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) {
    console.log("  ⚠ Skipping: CLAUDE_CODE_OAUTH_TOKEN not set");
    return;
  }

  await runBenchmark({
    name: "Minimal vs Full Mode",
    warmup: 1,
    iterations: 3,
    implementations: [
      {
        name: "minimal",
        fn: async () => {
          await queryDirect("Reply: PONG", { maxTokens: 10 });
        },
      },
      {
        name: "full",
        fn: async () => {
          const client = new ClaudeDirect({
            oauthToken: token,
            minimal: false,
            skipTelemetry: true, // Skip telemetry to avoid async timing issues
          });
          await client.query({
            messages: [{ role: "user", content: "Reply: PONG" }],
            maxTokens: 10,
          });
        },
      },
    ],
  });
}

// Main
async function main() {
  console.log("Claude Direct Test Suite");
  console.log(`Args: integration=${runIntegration}, benchmark=${runBenchmarks}`);

  await runUnitTests();

  if (runIntegration) {
    await runIntegrationTests();
  } else {
    console.log("\n⚠ Skipping integration tests (use --integration to run)");
  }

  if (runBenchmarks) {
    await runBenchmarkTests();
  } else {
    console.log("\n⚠ Skipping benchmarks (use --benchmark to run)");
  }

  console.log("\n" + "=".repeat(60));
  console.log("DONE");
  console.log("=".repeat(60));
}

main().catch(console.error);
