// @effect-diagnostics globalJsonInEffect:off - JSON string literals embed paths safely into generated JavaScript.
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveNodeExecutable } from "@t3tools/shared/nodeRuntime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const STALE =
  "This browser session has ended or Hive restarted. Call browser_use_open for a new session.";

const quoteShell = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

/**
 * Flags and commands that would leave the session Hive owns: another session, the person's own
 * browser (cdp, auto-connect, profile), a downloaded browser, or every Hive session at once.
 */
const REFUSED_FLAGS = [
  "--session",
  "--namespace",
  "--cdp",
  "--auto-connect",
  "--profile",
  "--executable-path",
  "--engine",
  "-p",
  "--provider",
  "--config",
  "--all",
];
const REFUSED_COMMANDS = ["connect", "install", "upgrade", "dashboard"];

const launcherSource = (input: {
  readonly node: string;
  readonly entryPath: string;
  readonly boundArgs: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
}) =>
  `import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const entry = ${JSON.stringify(input.entryPath)};
const bound = ${JSON.stringify(input.boundArgs)};
const refusedFlags = ${JSON.stringify(REFUSED_FLAGS)};
const refusedCommands = ${JSON.stringify(REFUSED_COMMANDS)};
const args = process.argv.slice(2);
const end = args.indexOf("--");
const options = end < 0 ? args : args.slice(0, end);
const informational = args.length === 0 || options.some(arg => ["help", "--help", "-h", "--version", "-V"].includes(arg));
const refused = options.find(arg => refusedFlags.includes(arg.split("=")[0]));
const name = options.find(arg => !arg.startsWith("-")) ?? "";
if (!informational && (refused || refusedCommands.includes(name))) {
  console.error("Hive runs this browser session for you, so " + (refused ?? name) + " is not available here. Call browser_use_open for another session.");
  process.exit(2);
}
if (!existsSync(entry)) {
  console.error(${JSON.stringify(STALE)});
  process.exit(1);
}
const env = { ...process.env, ...${JSON.stringify(input.env)}, ELECTRON_RUN_AS_NODE: "1" };
for (const key of ["AGENT_BROWSER_CDP", "AGENT_BROWSER_AUTO_CONNECT", "AGENT_BROWSER_PROVIDER", "AGENT_BROWSER_NAMESPACE", "AGENT_BROWSER_ENGINE"]) delete env[key];
const child = spawn(${JSON.stringify(input.node)}, [entry, ...bound, ...args], { stdio: "inherit", env });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
`;

/** Writes the launcher for one session into `dir` and returns the executable agents run. */
export const writeBrowserUseLauncher = Effect.fn("BrowserUseLauncher.write")(function* (input: {
  readonly dir: string;
  readonly entryPath: string;
  readonly boundArgs: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcess.Platform;
  const node = yield* resolveNodeExecutable("Browser use");
  yield* fs.makeDirectory(input.dir, { recursive: true });
  const launcherPath = path.join(input.dir, "agent-browser-launcher.mjs");
  yield* fs.writeFileString(launcherPath, launcherSource({ ...input, node }));
  if (platform === "win32") {
    const scriptPath = path.join(input.dir, "agent-browser.cmd");
    yield* fs.writeFileString(
      scriptPath,
      `@echo off\r\nsetlocal EnableExtensions DisableDelayedExpansion\r\nif not exist "${launcherPath}" (echo ${STALE} 1>&2 & exit /b 1)\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"${node}" "${launcherPath}" %*\r\n`,
    );
    return scriptPath;
  }
  const scriptPath = path.join(input.dir, "agent-browser");
  yield* fs.writeFileString(
    scriptPath,
    `#!/bin/sh\n[ -f ${quoteShell(launcherPath)} ] || { echo ${quoteShell(STALE)} >&2; exit 1; }\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quoteShell(node)} ${quoteShell(launcherPath)} "$@"\n`,
  );
  yield* fs.chmod(scriptPath, 0o755);
  return scriptPath;
});
