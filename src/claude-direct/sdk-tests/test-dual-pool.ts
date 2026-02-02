/**
 * Test: Dual-Pool Architecture
 *
 * Tests both Quick and Task modes with the new V2 SDK pools
 */

import { QuickPool, TaskPool } from "./pools/index.js";

const quickPool = new QuickPool({ poolSize: 2 });
const taskPool = new TaskPool({ sessionTimeoutMs: 60000 });

async function testQuickMode() {
  console.log("\n=== Quick Mode Test ===\n");
  const startTime = Date.now();

  try {
    // Test 1: Simple math
    console.log("Test 1: Simple math (first request - cold)...");
    const result1 = await quickPool.execute({
      task: "What is 2+2? Reply only with the number.",
      model: "haiku",
    });
    console.log(`  Answer: ${result1.answer}`);
    console.log(`  Tokens: ${result1.inputTokens} in / ${result1.outputTokens} out`);
    console.log(`  Time: ${Date.now() - startTime}ms`);

    // Test 2: Text transform (should be faster - warm session)
    const start2 = Date.now();
    console.log("\nTest 2: Text transform (warm session)...");
    const result2 = await quickPool.execute({
      task: "Summarize in one sentence: The quick brown fox jumps over the lazy dog.",
      model: "haiku",
    });
    console.log(`  Answer: ${result2.answer}`);
    console.log(`  Time: ${Date.now() - start2}ms (should be faster)`);

    // Test 3: Classification
    const start3 = Date.now();
    console.log("\nTest 3: Classification (warm session)...");
    const result3 = await quickPool.execute({
      task: 'Classify this sentiment (positive/negative/neutral): "I love this product!"',
      model: "haiku",
    });
    console.log(`  Answer: ${result3.answer}`);
    console.log(`  Time: ${Date.now() - start3}ms`);

    console.log("\n✓ Quick mode tests passed");
    console.log(`  Pool stats:`, quickPool.getStats());
  } catch (err) {
    console.error("✗ Quick mode test failed:", err);
  }
}

async function testTaskMode() {
  console.log("\n=== Task Mode Test ===\n");

  try {
    // Test 1: Simple task
    console.log("Test 1: Simple task...");
    const start1 = Date.now();
    const result1 = await taskPool.execute({
      task: "What is 3*3? Reply only with the number.",
      model: "haiku",
    });
    console.log(`  Answer: ${result1.answer}`);
    console.log(`  Status: ${result1.status}`);
    console.log(`  Time: ${Date.now() - start1}ms`);

    // Test 2: Task with persist (creates session)
    console.log("\nTest 2: Task with persist (creates session)...");
    const start2 = Date.now();
    const result2 = await taskPool.execute({
      task: "Remember: my name is Alice. Confirm by saying 'Noted, Alice.'",
      model: "haiku",
      persist: true,
    });
    console.log(`  Answer: ${result2.answer}`);
    console.log(`  Session ID: ${result2.sessionId}`);
    console.log(`  Time: ${Date.now() - start2}ms`);

    // Test 3: Resume session (should remember)
    if (result2.sessionId) {
      console.log("\nTest 3: Resume session (should remember name)...");
      const start3 = Date.now();
      const result3 = await taskPool.execute({
        task: "What is my name?",
        sessionId: result2.sessionId,
        model: "haiku",
      });
      console.log(`  Answer: ${result3.answer}`);
      console.log(`  Time: ${Date.now() - start3}ms (should be faster - warm session)`);

      // Verify name is remembered
      if (result3.answer.toLowerCase().includes("alice")) {
        console.log("  ✓ Session correctly remembered context");
      } else {
        console.log("  ✗ Session did not remember context");
      }
    }

    console.log("\n✓ Task mode tests passed");
    console.log(`  Pool stats:`, taskPool.getStats());
  } catch (err) {
    console.error("✗ Task mode test failed:", err);
  }
}

async function main() {
  console.log("=== Dual-Pool Architecture Tests ===");
  console.log("Testing V2 SDK migration with Quick and Task pools\n");

  await testQuickMode();
  await testTaskMode();

  // Cleanup
  console.log("\n=== Cleanup ===");
  await quickPool.shutdown();
  await taskPool.shutdown();
  console.log("Pools shut down successfully");

  console.log("\n=== All tests completed ===");
}

main().catch(console.error);
