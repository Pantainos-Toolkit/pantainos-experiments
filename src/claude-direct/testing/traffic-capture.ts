/**
 * Traffic capture utilities for debugging and verification
 *
 * Usage:
 *   import { enableTrafficLogging, getTrafficLog } from "./testing/traffic-capture.js";
 *   enableTrafficLogging();
 *   // ... run your code ...
 *   console.log(getTrafficLog());
 */

interface TrafficEntry {
  timestamp: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  status?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: any;
  durationMs: number;
  error?: string;
}

let trafficLog: TrafficEntry[] = [];
let originalFetch: typeof fetch | null = null;

/**
 * Enable fetch interception and logging
 */
export function enableTrafficLogging(options?: {
  /** Log to console as requests happen */
  verbose?: boolean;
  /** Filter to only log requests matching this pattern */
  urlFilter?: RegExp;
}): void {
  if (originalFetch) return; // Already enabled

  originalFetch = globalThis.fetch;
  trafficLog = [];

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || "GET";

    // Filter check
    if (options?.urlFilter && !options.urlFilter.test(url)) {
      return originalFetch!(input, init);
    }

    const entry: TrafficEntry = {
      timestamp: Date.now(),
      method,
      url,
      requestHeaders: {},
      durationMs: 0,
    };

    // Capture request headers
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => (entry.requestHeaders[k] = v));
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => (entry.requestHeaders[k] = v));
      } else {
        entry.requestHeaders = { ...init.headers } as Record<string, string>;
      }
    }

    // Capture request body
    if (init?.body) {
      try {
        entry.requestBody = JSON.parse(init.body as string);
      } catch {
        entry.requestBody = init.body;
      }
    }

    if (options?.verbose) {
      console.log(`[TRAFFIC] ${method} ${url.substring(0, 80)}...`);
    }

    const start = performance.now();

    try {
      const response = await originalFetch!(input, init);
      entry.durationMs = performance.now() - start;
      entry.status = response.status;

      // Capture response headers
      entry.responseHeaders = {};
      response.headers.forEach((v, k) => (entry.responseHeaders![k] = v));

      if (options?.verbose) {
        console.log(`[TRAFFIC] <- ${response.status} (${entry.durationMs.toFixed(0)}ms)`);
      }

      trafficLog.push(entry);
      return response;
    } catch (err: any) {
      entry.durationMs = performance.now() - start;
      entry.error = err.message;

      if (options?.verbose) {
        console.log(`[TRAFFIC] <- ERROR: ${err.message}`);
      }

      trafficLog.push(entry);
      throw err;
    }
  };
}

/**
 * Disable traffic logging and restore original fetch
 */
export function disableTrafficLogging(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}

/**
 * Get the traffic log
 */
export function getTrafficLog(): TrafficEntry[] {
  return [...trafficLog];
}

/**
 * Clear the traffic log
 */
export function clearTrafficLog(): void {
  trafficLog = [];
}

/**
 * Get a summary of traffic (for quick inspection)
 */
export function getTrafficSummary(): string[] {
  return trafficLog.map(
    (e) => `${e.method} ${new URL(e.url).pathname} -> ${e.status || "ERR"} (${e.durationMs.toFixed(0)}ms)`
  );
}

/**
 * Export traffic log as HAR format (for browser devtools)
 */
export function exportAsHAR(): object {
  return {
    log: {
      version: "1.2",
      creator: { name: "claude-direct-traffic-capture", version: "1.0" },
      entries: trafficLog.map((e) => ({
        startedDateTime: new Date(e.timestamp).toISOString(),
        time: e.durationMs,
        request: {
          method: e.method,
          url: e.url,
          headers: Object.entries(e.requestHeaders).map(([name, value]) => ({ name, value })),
          postData: e.requestBody
            ? {
                mimeType: "application/json",
                text: JSON.stringify(e.requestBody),
              }
            : undefined,
        },
        response: {
          status: e.status || 0,
          statusText: e.status ? "OK" : "ERROR",
          headers: e.responseHeaders
            ? Object.entries(e.responseHeaders).map(([name, value]) => ({ name, value }))
            : [],
        },
      })),
    },
  };
}

/**
 * Compare two traffic logs for differences
 */
export function compareTrafficLogs(
  log1: TrafficEntry[],
  log2: TrafficEntry[],
  options?: { ignoreHeaders?: string[] }
): { matches: boolean; differences: string[] } {
  const differences: string[] = [];
  const ignoreHeaders = new Set(options?.ignoreHeaders || ["date", "x-request-id"]);

  // Compare sequence
  if (log1.length !== log2.length) {
    differences.push(`Request count: ${log1.length} vs ${log2.length}`);
  }

  const minLen = Math.min(log1.length, log2.length);
  for (let i = 0; i < minLen; i++) {
    const e1 = log1[i];
    const e2 = log2[i];

    if (e1.method !== e2.method || new URL(e1.url).pathname !== new URL(e2.url).pathname) {
      differences.push(`Request ${i}: ${e1.method} ${new URL(e1.url).pathname} vs ${e2.method} ${new URL(e2.url).pathname}`);
    }

    // Compare headers (check all headers from log1 against log2)
    const h1 = Object.entries(e1.requestHeaders).filter(([k]) => !ignoreHeaders.has(k.toLowerCase()));

    for (const [k, v] of h1) {
      const v2 = e2.requestHeaders[k];
      if (v !== v2) {
        differences.push(`Request ${i} header '${k}': '${v}' vs '${v2}'`);
      }
    }
  }

  return { matches: differences.length === 0, differences };
}
