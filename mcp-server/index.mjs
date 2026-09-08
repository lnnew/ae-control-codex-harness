import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const AE_BUNDLE_ID = "com.adobe.AfterEffects.application";
const AE_SEND_EVENT_BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "ae-send-event");
const RUNTIME_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "CodexAEControl",
  "runtime-scripts",
);

function toolError(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function toolText(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function run(command, args, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

async function aeIsRunning() {
  const result = await run("/usr/bin/pgrep", ["-f", "Adobe After Effects"], 3_000);
  return result.code === 0;
}

async function aeProcessIds() {
  const result = await run("/usr/bin/pgrep", ["-f", "/Adobe After Effects[^/]*\\.app/Contents/MacOS/After Effects$"], 3_000);
  if (result.code !== 0) return [];
  return result.stdout.split(/\s+/).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0);
}

async function executeAeJsx(label, jsxBuilder, options = {}) {
  if (!(await aeIsRunning())) {
    throw new Error("After Effects is not running. Open the target .aep project first, then try again.");
  }

  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  const scriptPath = path.join(RUNTIME_DIR, `${label}-${Date.now()}-${randomUUID()}.jsx`);
  const resultPath = scriptPath.replace(/\.jsx$/, ".result.json");
  const jsx = jsxBuilder(resultPath);
  await fs.writeFile(scriptPath, jsx, "utf8");

  if (Number.isInteger(options.instancePid)) {
    try {
      const result = await run(AE_SEND_EVENT_BIN, [String(options.instancePid), scriptPath], 45_000);
      if (result.timedOut) throw new Error("After Effects did not finish the requested operation within 45 seconds.");
      if (result.code !== 0) throw new Error((result.stderr || result.stdout || "PID-targeted Apple Event failed.").trim());
      return (await fs.readFile(resultPath, "utf8")).trim();
    } finally {
      await fs.unlink(scriptPath).catch(() => undefined);
      await fs.unlink(resultPath).catch(() => undefined);
    }
  }

  const appleScript = [
    "on run argv",
    "  set scriptFile to POSIX file (item 1 of argv)",
    `  tell application id \"${AE_BUNDLE_ID}\"`,
    "    DoScriptFile scriptFile with override",
    "  end tell",
    "end run",
  ].join("\n");

  try {
    const result = await run("/usr/bin/osascript", ["-e", appleScript, scriptPath], 45_000);
    if (result.timedOut) {
      throw new Error("After Effects did not finish the requested operation within 45 seconds.");
    }
    if (result.code !== 0) {
      throw new Error((result.stderr || result.stdout || "AppleScript failed.").trim());
    }
    try {
      return (await fs.readFile(resultPath, "utf8")).trim();
    } catch {
      throw new Error(
        "After Effects ran the script but did not return a result file. In After Effects > Settings > Scripting & Expressions, enable ‘Allow Scripts to Write Files and Access Network’, then retry.",
      );
    }
  } finally {
    await fs.unlink(scriptPath).catch(() => undefined);
    await fs.unlink(resultPath).catch(() => undefined);
  }
}

async function listAeInstances() {
  const pids = await aeProcessIds();
  const instances = [];
  for (const pid of pids) {
    try {
      const output = await executeAeJsx(`instance-${pid}`, projectSnapshotJsx, { instancePid: pid });
      instances.push({ pid, ...JSON.parse(output), reachable: true });
    } catch (error) {
      instances.push({ pid, reachable: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return instances;
}

async function resolveInstancePid({ instancePid, projectPath } = {}) {
  if (Number.isInteger(instancePid)) return instancePid;
  const instances = await listAeInstances();
  if (projectPath) {
    const normalized = path.resolve(projectPath);
    const match = instances.find((item) => item.reachable && item.project && path.resolve(item.project) === normalized);
    if (!match) throw new Error(`No reachable After Effects instance has project open: ${projectPath}`);
    return match.pid;
  }
  const reachable = instances.filter((item) => item.reachable);
  if (reachable.length > 1) {
    throw new Error("Multiple After Effects instances are open. Call ae_list_instances, then pass instance_pid or project_path.");
  }
  return reachable[0]?.pid ?? null;
}

function projectSnapshotJsx(resultPath) {
  return `
(function () {
  function writeResult(text) {
    var output = new File(${JSON.stringify(resultPath)});
    output.encoding = "UTF-8";
    if (!output.open("w")) { throw new Error("Could not write the Codex AE result file."); }
    output.write(text);
    output.close();
  }
  function quote(value) {
    return '\"' + String(value).replace(/\\\\/g, '\\\\\\\\').replace(/\"/g, '\\\\"').replace(/\\r/g, '\\\\r').replace(/\\n/g, '\\\\n') + '\"';
  }
  var project = app.project;
  if (!project) {
    writeResult('{"project":null,"activeComp":null,"selectedLayers":[]}');
    return "ok";
  }
  var item = project.activeItem;
  var isComp = item && item instanceof CompItem;
  var selected = [];
  if (isComp) {
    for (var i = 0; i < item.selectedLayers.length; i++) {
      selected.push(quote(item.selectedLayers[i].name));
    }
  }
  var result = '{"project":' + quote(project.file ? project.file.fsName : "Unsaved project") +
    ',"activeComp":' + (isComp ? quote(item.name) : 'null') +
    ',"time":' + (isComp ? item.time : 'null') +
    ',"duration":' + (isComp ? item.duration : 'null') +
    ',"frameRate":' + (isComp ? item.frameRate : 'null') +
    ',"width":' + (isComp ? item.width : 'null') +
    ',"height":' + (isComp ? item.height : 'null') +
    ',"selectedLayers":[' + selected.join(',') + ']}' ;
  writeResult(result);
  return "ok";
})();
`.trim();
}

function runScriptFileJsx(scriptFilePath, resultPath) {
  return `
(function () {
  function writeResult(text) {
    var output = new File(${JSON.stringify(resultPath)});
    output.encoding = "UTF-8";
    if (!output.open("w")) { throw new Error("Could not write the Codex AE result file."); }
    output.write(text);
    output.close();
  }
  var target = new File(${JSON.stringify(scriptFilePath)});
  if (!target.exists) { throw new Error("JSX file does not exist: " + target.fsName); }
  var value = $.evalFile(target);
  writeResult('{"executed":true,"script":' + '"' + target.fsName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"}');
  return value;
})();
`.trim();
}

function skyShatterJsx({ compName, sourceLayerName, impactSeconds, shardCount, burstSeconds, seed }, resultPath) {
  return `
(function () {
  app.beginUndoGroup("Codex AE Sky Shatter");
  try {
    function fail(message) { throw new Error(message); }
    function writeResult(text) {
      var output = new File(${JSON.stringify(resultPath)});
      output.encoding = "UTF-8";
      if (!output.open("w")) { throw new Error("Could not write the Codex AE result file."); }
      output.write(text);
      output.close();
    }
    function findComp(name) {
      if (name) {
        for (var i = 1; i <= app.project.numItems; i++) {
          var candidate = app.project.item(i);
          if (candidate instanceof CompItem && candidate.name === name) { return candidate; }
        }
        fail("Composition not found: " + name);
      }
      if (app.project.activeItem && app.project.activeItem instanceof CompItem) { return app.project.activeItem; }
      fail("Select the target composition before running the sky shatter.");
    }
    function findLayer(comp, name) {
      for (var i = 1; i <= comp.numLayers; i++) {
        if (comp.layer(i).name === name) { return comp.layer(i); }
      }
      fail("Source layer not found: " + name);
    }
    function pseudoRandom(index) {
      var x = Math.sin((${seed} + index * 17.23)) * 10000;
      return x - Math.floor(x);
    }
    function moveValue(value, dx, dy) {
      if (value.length === 3) { return [value[0] + dx, value[1] + dy, value[2]]; }
      return [value[0] + dx, value[1] + dy];
    }

    var comp = findComp(${compName ? JSON.stringify(compName) : "null"});
    var source = findLayer(comp, ${JSON.stringify(sourceLayerName)});
    var impact = ${impactSeconds};
    var shardCount = ${shardCount};
    var burst = ${burstSeconds};
    var frame = 1 / comp.frameRate;

    if (impact <= 0 || impact >= comp.duration) { fail("Impact time must be inside the composition duration."); }
    if (source.threeDLayer) { fail("The source sky layer must be a 2D layer."); }
    if (Math.abs(source.transform.rotation.value) > 0.01) { fail("The source sky layer must be unrotated."); }
    if (!source.source || !source.source.width || !source.source.height) { fail("The source sky layer must be footage or a precomposition with visible dimensions."); }

    var width = source.source.width;
    var height = source.source.height;
    var cols = Math.ceil(Math.sqrt(shardCount * (width / height)));
    var rows = Math.ceil(shardCount / cols);
    var total = cols * rows;
    var points = [];
    var r, c;
    for (r = 0; r <= rows; r++) {
      points[r] = [];
      for (c = 0; c <= cols; c++) {
        var isEdge = r === 0 || r === rows || c === 0 || c === cols;
        var jitterX = isEdge ? 0 : (pseudoRandom(r * 101 + c) - 0.5) * (width / cols) * 0.30;
        var jitterY = isEdge ? 0 : (pseudoRandom(r * 211 + c) - 0.5) * (height / rows) * 0.30;
        points[r][c] = [(c * width / cols) + jitterX, (r * height / rows) + jitterY];
      }
    }

    var sourceOpacity = source.transform.opacity.valueAtTime(Math.max(0, impact - frame), false);
    var sourceScale = source.transform.scale.valueAtTime(Math.max(0, impact - (8 * frame)), false);
    var pullBackScale = [sourceScale[0] * 0.92, sourceScale[1] * 0.92];
    var impactScale = [sourceScale[0] * 1.08, sourceScale[1] * 1.08];
    source.transform.scale.setValueAtTime(Math.max(0, impact - (8 * frame)), sourceScale);
    source.transform.scale.setValueAtTime(Math.max(0, impact - (2 * frame)), pullBackScale);
    source.transform.scale.setValueAtTime(impact, impactScale);
    source.transform.opacity.setValueAtTime(Math.max(0, impact - frame), sourceOpacity);
    source.transform.opacity.setValueAtTime(impact + frame, 0);

    var created = [];
    var shardIndex = 0;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        shardIndex++;
        var shard = source.duplicate();
        shard.name = "SKY_SHARD_" + ("0" + shardIndex).slice(-2);
        shard.motionBlur = true;

        var mask = shard.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        var shape = new Shape();
        shape.vertices = [points[r][c], points[r][c + 1], points[r + 1][c + 1], points[r + 1][c]];
        shape.inTangents = [[0,0], [0,0], [0,0], [0,0]];
        shape.outTangents = [[0,0], [0,0], [0,0], [0,0]];
        shape.closed = true;
        mask.property("ADBE Mask Shape").setValue(shape);

        var center = [
          (points[r][c][0] + points[r][c + 1][0] + points[r + 1][c][0] + points[r + 1][c + 1][0]) / 4,
          (points[r][c][1] + points[r][c + 1][1] + points[r + 1][c][1] + points[r + 1][c + 1][1]) / 4
        ];
        var anchor = shard.transform.anchorPoint.valueAtTime(impact, false);
        var position = shard.transform.position.valueAtTime(impact, false);
        var scale = shard.transform.scale.valueAtTime(impact, false);
        var scaleX = scale[0] / 100;
        var scaleY = scale[1] / 100;
        shard.transform.anchorPoint.setValue([center[0], center[1]]);
        var stablePosition = moveValue(position, (center[0] - anchor[0]) * scaleX, (center[1] - anchor[1]) * scaleY);

        var radialX = (center[0] / width) - 0.5;
        var radialY = (center[1] / height) - 0.5;
        var randomX = (pseudoRandom(shardIndex * 5) - 0.5) * 0.45;
        var randomY = (pseudoRandom(shardIndex * 7) - 0.5) * 0.35;
        var distance = 180 + pseudoRandom(shardIndex * 11) * 150;
        var dx = (radialX * 1.5 + randomX) * distance;
        var dy = (radialY * 1.15 + randomY - 0.10) * distance;
        var rotation = (pseudoRandom(shardIndex * 13) - 0.5) * 18;

        shard.transform.opacity.setValueAtTime(Math.max(0, impact - frame), 0);
        shard.transform.opacity.setValueAtTime(impact, 100);
        shard.transform.opacity.setValueAtTime(impact + burst, 82);
        shard.transform.position.setValueAtTime(impact, stablePosition);
        shard.transform.position.setValueAtTime(impact + burst, moveValue(stablePosition, dx, dy));
        shard.transform.rotation.setValueAtTime(impact, 0);
        shard.transform.rotation.setValueAtTime(impact + burst, rotation);
        shard.transform.scale.setValueAtTime(impact, scale);
        shard.transform.scale.setValueAtTime(impact + burst, [scale[0] * 0.96, scale[1] * 0.96]);
        created.push(shard.name);
      }
    }

    comp.motionBlur = true;
    var escaped = [];
    for (var n = 0; n < created.length; n++) { escaped.push('\"' + created[n] + '\"'); }
    writeResult('{"composition":"' + comp.name.replace(/\"/g, '\\\\"') + '","sourceLayer":"' + source.name.replace(/\"/g, '\\\\"') + '","created":[' + escaped.join(',') + '],"impact":' + impact + '}');
    return "ok";
  } catch (error) {
    throw error;
  } finally {
    app.endUndoGroup();
  }
})();
`.trim();
}

const server = new McpServer({
  name: "ae-control",
  version: "0.2.0",
});

server.registerTool(
  "ae_status",
  {
    title: "After Effects status",
    description: "Check whether Adobe After Effects is running locally. This does not open or modify After Effects.",
    inputSchema: {},
  },
  async () => {
    const pids = await aeProcessIds();
    const running = pids.length > 0;
    return toolText(
      running ? `After Effects is running in ${pids.length} instance(s).` : "After Effects is not running. Open the target .aep project first.",
      { running, instanceCount: pids.length, pids },
    );
  },
);

server.registerTool(
  "ae_list_instances",
  {
    title: "List After Effects instances",
    description: "List every running AE process with its PID, open project path, and active composition by sending a PID-addressed Apple Event. This never focuses or changes an AE window.",
    inputSchema: {},
  },
  async () => {
    try {
      const instances = await listAeInstances();
      return toolText(JSON.stringify({ instances }, null, 2), { instances });
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  },
);

server.registerTool(
  "ae_project_snapshot",
  {
    title: "Open project snapshot",
    description: "Read the active After Effects composition, playhead time, dimensions, and selected layers. This does not modify the project.",
    inputSchema: {
      instance_pid: z.number().int().positive().optional().describe("Target AE PID from ae_list_instances."),
      project_path: z.string().min(1).optional().describe("Exact open .aep path. The matching AE instance is selected automatically."),
    },
  },
  async ({ instance_pid, project_path }) => {
    try {
      const pid = await resolveInstancePid({ instancePid: instance_pid, projectPath: project_path });
      const output = await executeAeJsx("project-snapshot", projectSnapshotJsx, { instancePid: pid });
      const snapshot = JSON.parse(output);
      if (pid) snapshot.instancePid = pid;
      return toolText(JSON.stringify(snapshot, null, 2), snapshot);
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  },
);

server.registerTool(
  "ae_create_sky_shatter",
  {
    title: "Create guarded sky shatter",
    description: "Create an 8–12 piece irregular sky breakup in an open 2D composition. It duplicates the specified full-frame sky layer into AE_SHATTER and fades the source one frame after impact.",
    inputSchema: {
      source_layer_name: z.string().min(1).describe("Exact source layer name verified in ae_project_snapshot."),
      impact_seconds: z.number().positive().describe("Impact time in composition seconds."),
      composition_name: z.string().min(1).optional().describe("Exact composition name. Omit to use the active composition."),
      shard_count: z.number().int().min(8).max(12).default(8).describe("Target count of large irregular sky pieces."),
      burst_seconds: z.number().min(0.2).max(2).default(0.7).describe("Time for the initial fragment spread."),
      instance_pid: z.number().int().positive().optional().describe("Target AE PID from ae_list_instances."),
      project_path: z.string().min(1).optional().describe("Exact open .aep path. The matching AE instance is selected automatically."),
    },
  },
  async ({ source_layer_name, impact_seconds, composition_name, shard_count, burst_seconds, instance_pid, project_path }) => {
    try {
      const pid = await resolveInstancePid({ instancePid: instance_pid, projectPath: project_path });
      const output = await executeAeJsx(
        "sky-shatter",
        (resultPath) => skyShatterJsx({
          compName: composition_name,
          sourceLayerName: source_layer_name,
          impactSeconds: impact_seconds,
          shardCount: shard_count,
          burstSeconds: burst_seconds,
          seed: Date.now() % 10_000,
        }, resultPath),
        { instancePid: pid },
      );
      const result = JSON.parse(output);
      return toolText(
        `Created ${result.created.length} irregular sky shards in ${result.composition} at ${result.impact}s. Preview the impact before changing anything else.`,
        result,
      );
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  },
);

server.registerTool(
  "ae_run_script_file",
  {
    title: "Run JSX in a selected AE project",
    description: "Run an existing local JSX file in an exact AE process selected by PID or project path. No AE window is focused.",
    inputSchema: {
      script_path: z.string().min(1).describe("Absolute path to an existing .jsx file."),
      instance_pid: z.number().int().positive().optional().describe("Target AE PID from ae_list_instances."),
      project_path: z.string().min(1).optional().describe("Exact open .aep path."),
    },
  },
  async ({ script_path, instance_pid, project_path }) => {
    try {
      const absoluteScriptPath = path.resolve(script_path);
      const stat = await fs.stat(absoluteScriptPath);
      if (!stat.isFile() || path.extname(absoluteScriptPath).toLowerCase() !== ".jsx") {
        throw new Error("script_path must point to an existing .jsx file.");
      }
      const pid = await resolveInstancePid({ instancePid: instance_pid, projectPath: project_path });
      const output = await executeAeJsx("run-script", (resultPath) => runScriptFileJsx(absoluteScriptPath, resultPath), { instancePid: pid });
      const result = JSON.parse(output);
      if (pid) result.instancePid = pid;
      return toolText(`Executed ${absoluteScriptPath} without focusing After Effects.`, result);
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error));
    }
  },
);

await server.connect(new StdioServerTransport());
