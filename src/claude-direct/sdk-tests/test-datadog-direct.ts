/**
 * Test Datadog logging directly - find what's causing 400
 */

const DATADOG_ENDPOINT = "https://http-intake.logs.us5.datadoghq.com/api/v2/logs";
const DATADOG_API_KEY = "pubbbf48e6d78dae54bceaa4acf463299bf";

async function testDatadog() {
  // Exact payload from CLI capture
  const payload = [
    {
      ddsource: "nodejs",
      ddtags: "arch:arm64,client_type:cli,model:claude-haiku-4-5-20251001,platform:darwin,provider:firstParty,user_bucket:5,user_type:external,version:2.1.29,version_base:2.1.29",
      message: "tengu_api_success",
      service: "claude-code",
      hostname: "claude-code",
      env: "external",
      model: "claude-haiku-4-5-20251001",
      session_id: "test-session-123",
      user_type: "external",
      betas: "oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05",
      entrypoint: "cli",
      agent_sdk_version: "0.2.29",
      is_interactive: false,
      client_type: "cli",
      swe_bench_run_id: "",
      swe_bench_instance_id: "",
      swe_bench_task_id: "",
      platform: "darwin",
      arch: "arm64",
      node_version: "v22.16.0",
      terminal: "",
      package_managers: "npm",
      runtimes: "node",
      is_running_with_bun: false,
      is_ci: false,
      is_claubbit: false,
      is_claude_code_remote: false,
      is_local_agent_mode: false,
      is_conductor: false,
      is_github_action: false,
      is_claude_code_action: false,
      is_claude_ai_auth: true,
      version: "2.1.29",
      version_base: "2.1.29",
      build_time: "2026-01-31T20:26:06Z",
      deployment_environment: "gcp",
      message_count: 1,
      message_tokens: 0,
      input_tokens: 12,
      output_tokens: 6,
      cached_input_tokens: 0,
      uncached_input_tokens: 0,
      duration_ms: 500,
      duration_ms_including_retries: 500,
      attempt: 1,
      ttft_ms: 490,
      provider: "firstParty",
      stop_reason: "end_turn",
      cost_u_s_d: 0.0001,
      did_fall_back_to_non_streaming: false,
      is_non_interactive_session: true,
      print: false,
      is_t_t_y: false,
      query_source: "sdk",
      query_chain_id: "test-chain-123",
      query_depth: 0,
      permission_mode: "bypassPermissions",
      global_cache_strategy: "none",
      user_bucket: 5,
    },
  ];

  console.log("Sending to Datadog...");
  console.log("Payload:", JSON.stringify(payload, null, 2).substring(0, 500));

  const res = await fetch(DATADOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "DD-API-KEY": DATADOG_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  console.log("Status:", res.status);
  console.log("Response:", await res.text());
}

testDatadog().catch(console.error);
