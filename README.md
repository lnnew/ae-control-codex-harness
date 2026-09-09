# ae-control-codex-harness: After Effects Automation for Codex

Direct, guarded Adobe After Effects control for Codex via the Model Context Protocol (MCP) on macOS.

## Highlights

- **Non-Focusing & Non-Disruptive**: Executes ExtendScript (JSX) via PID-targeted Apple Events without stealing window, mouse, or keyboard focus.
- **Multi-Instance Safe**: Explicitly targets specific AE instances by process ID (PID), allowing multiple projects to run concurrently.
- **Guardrails & State Verification**: Includes inspection tools to snapshot composition state, enforce undo groups, and verify visual output.
- **Ready for Codex**: Includes built-in skill definitions, workspace `AGENTS.md`, and an example project for instant testing.

---

## Architecture

```text
ae-control-codex-harness/
├── install.sh              # 1-click setup (Swift build, npm ci, Codex plugin registration)
├── AGENTS.md               # Guidelines for Codex on safe AE automation
├── mcp-server/
│   ├── index.mjs           # Node.js MCP server (Stdio transport)
│   ├── ae-send-event.swift # Native Swift Apple Event sender targeting AE by PID
│   ├── package.json        # Dependencies (@modelcontextprotocol/sdk, zod)
│   └── package-lock.json
├── skills/
│   └── after-effects-control/
│       ├── SKILL.md        # Codex skill instructions (targeting, snapshots, changes)
│       └── references/
│           └── safe-jsx-builds.md
├── example/                # Self-contained sample project
│   ├── example_project.aep
│   ├── Footage/            # Linked media assets
│   └── README.md
└── codex-marketplace/      # Local plugin registration metadata
```

---

## Prerequisites

1. **macOS** (Apple Silicon or Intel).
2. **Adobe After Effects** (2022 or later recommended).
3. **Node.js** 20 or higher (`node -v`).
4. **Apple Command Line Tools** (`xcode-select --install`).
5. **Codex Desktop** (or ChatGPT Desktop with Codex).

---

## Installation

### 1. Run 1-Click Install Script

In the cloned repository directory, run:

```bash
./install.sh
```

The script automatically:
1. Installs Node.js dependencies (`npm ci --omit=dev`).
2. Compiles `ae-send-event.swift` into an executable binary using `swiftc`.
3. Configures the local `.mcp.json` with absolute paths.
4. Registers the `ae-control` plugin into your local Codex marketplace.

### 2. Enable After Effects Scripting Permissions

1. Open **Adobe After Effects**.
2. Go to **Settings (Preferences)** > **Scripting & Expressions**.
3. Check **Allow Scripts to Write Files and Access Network** (`스크립트가 파일에 쓰고 네트워크에 액세스하도록 허용`).
4. Click **OK**.

### 3. Restart Codex

Completely quit and restart the Codex Desktop app so the new plugin and tools are loaded.

---

## Quick Start & Verification

### Step 1: Open the Example Project
Launch After Effects and open:
```text
example/example_project.aep
```
*(If prompted to find missing footage, select the adjacent `example/Footage/` directory).*

### Step 2: Test with Codex
Start a new task in Codex and prompt:

> "Check open AE instances and take a snapshot of the active composition."

Codex will inspect AE and report:
- Active composition name and resolution
- Frame rate and duration
- Current playhead timecode
- Selected and listed layers

---

## MCP Tools Reference

| Tool Name | Description | Parameters |
| :--- | :--- | :--- |
| `ae_status` | Checks whether After Effects is running and accessible. | None |
| `ae_list_instances` | Lists all running AE processes with their PID, version, and project file path. | None |
| `ae_project_snapshot` | Captures metadata of the active composition (dimensions, duration, fps, layers). | `instance_pid` (optional) |
| `ae_run_script_file` | Safely executes an ExtendScript (.jsx) file on a targeted AE instance. | `script_path` (required), `instance_pid` (optional) |
| `ae_create_sky_shatter` | Specialized automation creating a shattered sky layer effect on a designated layer. | `source_layer_name` (required), `impact_time_seconds` (required), `instance_pid` (optional) |

---

## Manual MCP Configuration (Optional)

If you prefer configuring the MCP server manually without the Codex plugin system:

Add the following to your `~/.codex/config.toml`:

```toml
[mcp_servers.ae-control]
command = "node"
args = ["/absolute/path/to/ae-control-codex-harness/mcp-server/index.mjs"]
```

---

## License

MIT License. See LICENSE for details.

