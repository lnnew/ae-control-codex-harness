---
name: after-effects-control
description: Inspect or directly modify one or more open local Adobe After Effects projects through PID-targeted, non-focusing Apple Events. Use for AE composition inspection, scripted builds, effect changes, rendering setup, or guarded sky-shatter work. Do not use for generic motion-design advice when no direct AE control is requested.
---

# After Effects Control

Control AE without stealing keyboard or window focus. The MCP addresses each AE process by PID, so multiple projects can stay open independently.

## Targeting protocol

1. Call `ae_status`, then `ae_list_instances` before every new project target or after an AE instance opens/closes.
2. Match the exact `.aep` path. If the project is unsaved or paths are ambiguous, use the PID returned by `ae_list_instances`; never infer from the frontmost window.
3. Pass `instance_pid` or `project_path` to every project-specific call. Re-list instances after a script creates, closes, or replaces a project.
4. Never activate an AE process, click menus, type into dialogs, or route through bundle ID when multiple AE instances exist.

## Change protocol

1. Snapshot first with `ae_project_snapshot`. Record target project, active comp, playhead, dimensions, frame rate, and selected layers.
2. Preserve user work. Do not close, replace, save, or render an existing project unless the request authorizes that exact action.
3. Prefer one undo group for localized edits. For substantial builds, create a new project or new comp/folder namespace instead of rewriting unrelated layers.
4. Use `ae_run_script_file` only with a reviewed absolute `.jsx` path and an explicitly resolved target PID/project.
5. Do not claim success from script completion alone. Export representative frames or a short preview and visually inspect composition, timing, masks, alpha edges, and motion.
6. Keep generated assets and build scripts beside the project so the result is reproducible. Log the created project path, comp name, duration, layer count, and any fallbacks.

For non-trivial JSX builds, read [references/safe-jsx-builds.md](references/safe-jsx-builds.md).

## Sky shatter boundary

Use `ae_create_sky_shatter` only when the user explicitly requests that effect and the snapshot confirms the source layer and impact time. The source must be a 2D, unrotated full-frame image or precomp. The operation preserves the source layer, creates `AE_SHATTER`, and hides the source one frame after impact. Preview the impact before further aesthetic changes.

## Completion evidence

Report the exact targeted project/PID, artifact paths, comp settings, and visual checks performed. Distinguish a saved `.aep`, a successful render process, and a visually verified output; they are separate completion gates.
