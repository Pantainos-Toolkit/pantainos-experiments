#!/bin/bash
# Capture SDK network traffic using mitmproxy
#
# Usage:
#   ./capture-sdk-traffic.sh [test-file]
#
# Prerequisites:
#   brew install mitmproxy
#
# This script:
# 1. Starts mitmdump in background
# 2. Runs the test with proxy settings
# 3. Stops mitmdump and prints traffic summary

set -e

TEST_FILE="${1:-test-sdk-tool-loop.ts}"
FLOW_FILE="/tmp/sdk-traffic-$(date +%s).flow"
PROXY_PORT=8888

echo "=== SDK Traffic Capture ==="
echo "Test file: $TEST_FILE"
echo "Flow file: $FLOW_FILE"
echo ""

# Check for mitmproxy
if ! command -v mitmdump &> /dev/null; then
    echo "ERROR: mitmproxy not installed. Run: brew install mitmproxy"
    exit 1
fi

# Start mitmdump in background
echo "[1/4] Starting mitmdump on port $PROXY_PORT..."
mitmdump -p $PROXY_PORT -w "$FLOW_FILE" --quiet &
MITM_PID=$!
sleep 1

# Verify it's running
if ! kill -0 $MITM_PID 2>/dev/null; then
    echo "ERROR: Failed to start mitmdump"
    exit 1
fi

echo "[2/4] Running test through proxy..."
echo ""

# Run the test with proxy settings
export HTTPS_PROXY="http://localhost:$PROXY_PORT"
export HTTP_PROXY="http://localhost:$PROXY_PORT"
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Also disable telemetry
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=true
export CLAUDE_CODE_ENABLE_TELEMETRY=false

# Source .env for OAuth token
source ../../.env 2>/dev/null || source ../../../.env 2>/dev/null || true

cd "$(dirname "$0")"
npx tsx "$TEST_FILE" 2>&1 || true

echo ""
echo "[3/4] Stopping mitmdump..."
kill $MITM_PID 2>/dev/null || true
sleep 1

echo "[4/4] Analyzing captured traffic..."
echo ""
echo "=== CAPTURED REQUESTS ==="
mitmdump -r "$FLOW_FILE" -n --flow-detail 0 2>/dev/null | grep -E "^(GET|POST|PUT|DELETE)" || echo "(no requests captured)"

echo ""
echo "=== ANTHROPIC API CALLS ==="
mitmdump -r "$FLOW_FILE" -n --flow-detail 1 2>/dev/null | grep -A 5 "anthropic.com" || echo "(no Anthropic calls captured)"

echo ""
echo "=== FULL TRAFFIC DETAILS ==="
echo "Flow file saved to: $FLOW_FILE"
echo "To inspect: mitmdump -r $FLOW_FILE --flow-detail 2"
echo "To view in GUI: mitmproxy -r $FLOW_FILE"
