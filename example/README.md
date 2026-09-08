# AE Control Example Project

This folder contains a fully configured Adobe After Effects project and its linked assets for testing and demonstration with Codex.

## Project Details

- **File**: `example_project.aep`
- **Main Composition**: `OUTPUT_DOME` (1920x1080 @ 29.97 fps)
- **Assets**: Located in the `Footage/` folder (images, matte textures, audio)
- **Asset Manifest**: See `SOURCE_MANIFEST.tsv` for details on linked media

## How to Test with Codex

1. Launch **Adobe After Effects**.
2. Open `example/example_project.aep`.
   - *Note*: If After Effects prompts to locate missing footage on first open, select the adjacent `Footage/` directory.
3. In **Codex**, start a task and prompt:
   > "Check the open After Effects instance and take a snapshot of the active composition."
4. Codex will invoke `ae_status`, `ae_list_instances`, and `ae_project_snapshot` to report composition dimensions, frame rate, playhead, and layers without taking focus from your screen.

## Safe Experimentation

- Wrap custom JSX experiments in undo groups:
  ```javascript
  app.beginUndoGroup("Codex Test");
  // your modifications here
  app.endUndoGroup();
  ```
- Keep changes localized to a duplicate composition or test layer to preserve the original project structure.
