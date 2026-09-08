# Safe JSX Builds

Use this reference for whole-project creation, multi-layer animation builds, or render automation through `ae_run_script_file`.

## Build contract

- Resolve the destination AE PID before execution and probe it read-only when another project is open.
- For a new project, use a dedicated empty AE instance. Close only that instance's unsaved scratch project with `CloseOptions.DO_NOT_SAVE_CHANGES` before `app.newProject()`.
- For edits to an existing project, wrap reversible changes in `app.beginUndoGroup` / `app.endUndoGroup` and avoid `app.project.save()` unless saving was requested.
- Address effects and properties by match name where possible. AE display names and numeric property indexes can differ by version; test uncertain properties in the targeted AE version.
- Write a result log even on failure, including `error.toString()`, `error.line`, and `error.fileName`.
- Save new projects to a new explicit path. Never reuse an existing `.aep` path implicitly.

## Visual verification

- Export at least start, middle, and end frames for a time-based build.
- Inspect generated alpha layers for black backgrounds, hard rectangles, seams, and duplicated silhouettes.
- Compare motion across frames. Large position changes, uniform drift, and strong Turbulent Displace usually read as sliding or wobbling rather than living paint.
- For final delivery, render the requested work area through `aerender` when available so the user's interactive AE process remains untouched.

## Multi-instance invariant

PID-targeted Apple Events are the only supported direct-control route. Do not fall back to `tell application id`, `frontmost`, System Events menu clicks, or shared single command files when more than one AE process is running.
