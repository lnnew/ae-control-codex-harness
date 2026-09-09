#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$REPO_DIR/mcp-server"
MARKETPLACE_DIR="$REPO_DIR/codex-marketplace"
ENTRYPOINT="$SERVER_DIR/index.mjs"

echo "=== ae-control-codex-harness Installation ==="

# 1. OS check
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: AE Control requires macOS (Apple Events support)."
  exit 1
fi

# 2. Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 20 or higher is required. Please install Node.js: https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Warning: Node.js version is $NODE_MAJOR. Node.js 20+ is recommended."
fi

# 3. Check Swift compiler
if ! command -v xcrun >/dev/null 2>&1 || ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "Error: Apple Command Line Tools with swiftc are required."
  echo "Run: xcode-select --install"
  exit 1
fi

# 4. Install Node dependencies
echo "--> Installing Node dependencies..."
(cd "$SERVER_DIR" && npm ci --omit=dev)

# 5. Compile Swift Apple Event helper
echo "--> Compiling native Apple Event helper (ae-send-event)..."
xcrun swiftc "$SERVER_DIR/ae-send-event.swift" -o "$SERVER_DIR/ae-send-event"
chmod +x "$SERVER_DIR/ae-send-event"

# 6. Generate local .mcp.json for direct integration
echo "--> Generating local .mcp.json..."
cat <<CONFIG_EOF > "$REPO_DIR/.mcp.json"
{
  "mcpServers": {
    "ae-control": {
      "command": "node",
      "args": [
        "$ENTRYPOINT"
      ]
    }
  }
}
CONFIG_EOF

# 7. Setup marketplace plugins link & manifest
mkdir -p "$MARKETPLACE_DIR/plugins"
ln -sfn "../.." "$MARKETPLACE_DIR/plugins/ae-control"
mkdir -p "$MARKETPLACE_DIR/.agents/plugins"
cp "$MARKETPLACE_DIR/marketplace.json" "$MARKETPLACE_DIR/.agents/plugins/marketplace.json"

# 8. Register plugin with Codex if Codex CLI is available
CODEX_BIN="$(command -v codex || true)"
if [[ -z "$CODEX_BIN" ]] || ! "$CODEX_BIN" --version >/dev/null 2>&1; then
  APP_CODEX="/Applications/ChatGPT.app/Contents/Resources/codex"
  if [[ -x "$APP_CODEX" ]]; then
    CODEX_BIN="$APP_CODEX"
  fi
fi

if [[ -n "$CODEX_BIN" ]] && "$CODEX_BIN" --version >/dev/null 2>&1; then
  echo "--> Registering marketplace & plugin with Codex..."
  "$CODEX_BIN" plugin marketplace add "$MARKETPLACE_DIR" >/dev/null 2>&1 || true
  "$CODEX_BIN" plugin add ae-control@ae-control-local || true
  echo "✓ Successfully registered plugin with Codex CLI."
else
  echo "Note: Codex CLI not found. You can add the MCP server manually via .codex/config.toml."
fi

echo
echo "=== Setup Complete! ==="
echo "Next Steps:"
echo "1. In Adobe After Effects, enable:"
echo "   Settings (Preferences) > Scripting & Expressions > Allow Scripts to Write Files and Access Network"
echo "2. Restart Codex Desktop completely and start a new task."
echo "3. Open example/example_project.aep in After Effects and test with Codex:"
echo '   "Check open AE instance and take a snapshot of the composition."'
echo
echo "Manual MCP Configuration alternative (~/.codex/config.toml):"
echo '[mcp_servers.ae-control]'
echo 'command = "node"'
echo "args = ["$ENTRYPOINT"]"
echo
