/**
 * Benchmark harness for comparing implementations
 */

interface Implementation {
  name: string;
  fn: () => Promise<any>;
}

interface BenchmarkOptions {
  name: string;
  warmup?: number;
  iterations?: number;
  implementations: Implementation[];
}

interface BenchmarkResult {
  name: string;
  times: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}

function calculateStats(times: number[]): Omit<BenchmarkResult, "name" | "times"> {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
  const stdDev = Math.sqrt(variance);

  return { mean, median, min, max, stdDev };
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult[]> {
  const { name, warmup = 2, iterations = 5, implementations } = options;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Benchmark: ${name}`);
  console.log(`Warmup: ${warmup}, Iterations: ${iterations}`);
  console.log(`${"=".repeat(60)}\n`);

  const results: BenchmarkResult[] = [];

  for (const impl of implementations) {
    console.log(`\n[${impl.name}]`);

    // Warmup
    console.log(`  Warming up (${warmup} runs)...`);
    for (let i = 0; i < warmup; i++) {
      await impl.fn();
    }

    // Timed runs
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await impl.fn();
      const elapsed = performance.now() - start;
      times.push(elapsed);
      console.log(`  Run ${i + 1}: ${elapsed.toFixed(0)}ms`);
    }

    const stats = calculateStats(times);
    results.push({ name: impl.name, times, ...stats });

    console.log(`  Mean: ${stats.mean.toFixed(0)}ms, Median: ${stats.median.toFixed(0)}ms`);
    console.log(`  Min: ${stats.min.toFixed(0)}ms, Max: ${stats.max.toFixed(0)}ms`);
    console.log(`  StdDev: ${stats.stdDev.toFixed(0)}ms`);
  }

  // Comparison
  if (results.length >= 2) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Comparison");
    console.log(`${"=".repeat(60)}`);

    const baseline = results[0];
    for (let i = 1; i < results.length; i++) {
      const other = results[i];
      const diff = ((other.mean - baseline.mean) / baseline.mean) * 100;
      const faster = diff < 0;
      console.log(
        `  ${other.name} vs ${baseline.name}: ${faster ? "" : "+"}${diff.toFixed(1)}% (${faster ? "faster" : "slower"})`
      );
    }
  }

  return results;
}

/**
 * Simple timing wrapper
 */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  const ms = performance.now() - start;
  console.log(`[${name}] ${ms.toFixed(0)}ms`);
  return { result, ms };
}

/**
 * Run a function multiple times and return stats
 */
export async function measure(
  fn: () => Promise<any>,
  iterations: number = 5
): Promise<{ mean: number; median: number; min: number; max: number }> {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return calculateStats(times);
}
