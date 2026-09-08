# After Effects Control Guidelines for Codex

This repository provides direct, guarded control of Adobe After Effects from Codex via the `ae-control` MCP server and `after-effects-control` skill.

## Essential Rules

1. **Targeting Protocol**:
   - Always resolve the target project before modifying anything: `ae_status` → `ae_list_instances` → `ae_project_snapshot`.
   - Multiple After Effects instances can run simultaneously. Never assume the frontmost window or guess a PID. Pass `instance_pid` or `project_path` explicitly to every call.
   - If AE instances open, close, or restart, call `ae_list_instances` again to refresh PIDs.

2. **Non-Focusing & Non-Disruptive Control**:
   - Do not activate AE windows, steal keyboard focus, or use AppleScript System Events menu clicks.
   - All JSX executions must route through the PID-targeted Apple Event bridge (`ae-send-event`).

3. **Preservation & Undo Invariants**:
   - Never overwrite or save an existing project unless the user explicitly requests saving.
   - Wrap localized changes in a single undo block (`app.beginUndoGroup(...) ... app.endUndoGroup()`).
   - For large builds or refactors, create a dedicated composition, folder, or new project rather than mutating user source layers directly.
   - Execute complex JSX via `ae_run_script_file` using an absolute reviewed script file.

4. **Verification & Quality Gates**:
   - A successful JSX script run is not proof of visual aesthetic success. Separate structural/numerical verification from visual inspection.
   - When visual QA is needed, export representative frames (e.g., start, key cue, end) and inspect them directly.
   - Verify footage links, composition dimensions, frame rate, and alpha transparency boundaries.

5. **Cross-Version Stability**:
   - Reference properties and effects by their internal match names (e.g., `ADBE Brightness & Contrast`) rather than localized display names whenever possible.
   - Log meaningful error diagnostics on failure, including script line numbers and error strings.

## Typical Workflow

```text
1. Check AE status & running instances (ae_status, ae_list_instances)
2. Snapshot current composition state (ae_project_snapshot)
3. Review or draft targeted JSX script
4. Execute JSX safely on target instance (ae_run_script_file)
5. Verify results via snapshot or exported check frames
```
