/**
 * Test direct API access with OAuth token
 * Try different auth methods to see what works
 */

const OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN!;
const API_URL = "https://api.anthropic.com/v1/messages";

async function testBearer() {
  console.log("Testing Bearer auth with OAuth token...\n");
  console.log(`Token: ${OAUTH_TOKEN.substring(0, 20)}...${OAUTH_TOKEN.substring(OAUTH_TOKEN.length - 10)}`);
  console.log();

  const start = Date.now();

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "Authorization": `Bearer ${OAUTH_TOKEN}`,
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply: PONG" }],
    }),
  });

  console.log(`Status: ${res.status}`);
  console.log(`Time: ${Date.now() - start}ms`);
  console.log("\nHeaders:");
  res.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));

  const data = await res.json();
  console.log("\nResponse:");
  console.log(JSON.stringify(data, null, 2));
}

testBearer().catch(console.error);
