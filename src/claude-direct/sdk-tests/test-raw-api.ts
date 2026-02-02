/**
 * Test raw Anthropic API vs Claude Code SDK
 * This shows the minimum possible latency for pure inference
 */

import Anthropic from "@anthropic-ai/sdk";

const startTime = Date.now();
const ts = () => `+${(Date.now() - startTime).toString().padStart(5)}ms`;

async function testRawAPI() {
  console.error(`\n${ts()} === Raw Anthropic SDK (no Claude Code) ===`);

  // The OAuth token needs to be exchanged for an API key, or we use API key directly
  // For this test, let's see if the OAuth token works directly
  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) throw new Error("Missing CLAUDE_CODE_OAUTH_TOKEN");

  // Try using OAuth token directly (it might work as bearer auth)
  const client = new Anthropic({
    apiKey: token,
  });

  // Test 1: First call (cold - TCP connection, TLS handshake)
  const t1 = Date.now();
  try {
    const msg1 = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply: PONG1" }],
    });
    console.error(`${ts()} First call: ${Date.now() - t1}ms - "${(msg1.content[0] as any).text}"`);
  } catch (e: any) {
    console.error(`${ts()} First call failed: ${e.message}`);
    return;
  }

  // Test 2: Second call (warm - connection reuse)
  const t2 = Date.now();
  const msg2 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [{ role: "user", content: "Reply: PONG2" }],
  });
  console.error(`${ts()} Second call (warm): ${Date.now() - t2}ms - "${(msg2.content[0] as any).text}"`);

  // Test 3: Third call
  const t3 = Date.now();
  const msg3 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [{ role: "user", content: "Reply: PONG3" }],
  });
  console.error(`${ts()} Third call (warm): ${Date.now() - t3}ms - "${(msg3.content[0] as any).text}"`);

  // Test 4: Streaming
  const t4 = Date.now();
  let firstTokenTime = 0;
  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [{ role: "user", content: "Reply: PONG4" }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && !firstTokenTime) {
      firstTokenTime = Date.now() - t4;
    }
  }
  console.error(`${ts()} Streaming: first token ${firstTokenTime}ms, total ${Date.now() - t4}ms`);
}

async function testRawAPIParallel() {
  console.error(`\n${ts()} === Parallel API calls ===`);

  const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!token) return;

  const client = new Anthropic({ apiKey: token });

  const t1 = Date.now();
  const results = await Promise.all([
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply: A" }],
    }),
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply: B" }],
    }),
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply: C" }],
    }),
  ]);

  console.error(`${ts()} 3 parallel calls: ${Date.now() - t1}ms total`);
  results.forEach((r, i) => {
    console.error(`  ${i + 1}: "${(r.content[0] as any).text}"`);
  });
}

async function main() {
  console.error(`${ts()} Starting raw API tests...`);
  await testRawAPI();
  await testRawAPIParallel();
  console.error(`\n${ts()} Done!`);
}

main().catch(console.error);
