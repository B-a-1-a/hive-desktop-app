import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ServerConfig from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as HostProcess from "@t3tools/shared/HostProcess";

import { AGENT_DESKTOP_VERSION, make } from "./ComputerUseService.ts";

type Platform = { readonly os: NodeJS.Platform; readonly arch: NodeJS.Architecture };
const MAC: Platform = { os: "darwin", arch: "arm64" };

interface FakeOptions {
  readonly accessibility?: "granted" | "denied";
  /** Sessions a previous server left open in Hive's agent-desktop state root. */
  readonly leftOver?: ReadonlyArray<string>;
}

/** A fake agent-desktop and npm at the process boundary. */
function fakeCli(fs: FileSystem.FileSystem, path: Path.Path, options: FakeOptions = {}) {
  const calls: Array<{ readonly command: string; readonly args: ReadonlyArray<string> }> = [];
  const traces = new Map<string, Array<Record<string, unknown>>>();
  let nextSession = 0;
  const envelope = (command: string, data: unknown) =>
    JSON.stringify({ version: "2.6", ok: true, command, data });
  const output = (stdout: string) => ({
    code: ChildProcessSpawner.ExitCode(0),
    stdout,
    stderr: "",
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutInvalidUtf8: false,
    stderrInvalidUtf8: false,
  });
  const install = (all: ReadonlyArray<string>) => {
    const bin = path.join(
      all[all.indexOf("--prefix") + 1]!,
      "node_modules",
      "agent-desktop",
      "bin",
    );
    return fs
      .makeDirectory(bin, { recursive: true })
      .pipe(
        Effect.andThen(fs.writeFileString(path.join(bin, "agent-desktop"), "")),
        Effect.orDie,
        Effect.as(""),
      );
  };
  const respond = (all: ReadonlyArray<string>): string => {
    const session = all[0] === "--session" ? all[1]! : undefined;
    const args = session === undefined ? all : all.slice(2);
    if (session !== undefined && args[0] !== "trace") {
      traces.get(session)?.push({ event: "command.end", command: args[0], ok: true, ts_ms: 1 });
    }
    switch (args[0]) {
      case "permissions":
        return envelope("permissions", {
          accessibility: { state: options.accessibility ?? "granted" },
          screen_recording: { state: "granted" },
          automation: { state: "unknown" },
        });
      case "list-apps":
        return envelope("list-apps", {
          apps: [
            { name: "Finder", pid: 1, bundle_id: "com.apple.finder", presentation: "foreground" },
            { name: "Notes", pid: 2, bundle_id: "com.apple.Notes", presentation: "foreground" },
            { name: "Dock helper", pid: 3, presentation: "background" },
          ],
        });
      case "list-windows":
        return envelope("list-windows", [
          { id: "w-1", app_name: "Finder", title: "Downloads", is_focused: true, visible: true },
          { id: "w-2", app_name: "Notes", title: "Notes", is_focused: false, visible: true },
        ]);
      case "session":
        if (args[1] === "start") {
          const id = `run-${nextSession++}`;
          traces.set(id, []);
          return envelope("session", { session_id: id, created_at: 100 });
        }
        if (args[1] === "list") {
          return envelope("session", {
            sessions: (options.leftOver ?? []).map((id) => ({ session_id: id, ended_at: null })),
          });
        }
        return envelope("session", { session_id: args[2] });
      case "trace":
        return envelope("trace", { events: traces.get(session!) ?? [] });
      default:
        return envelope(args[0]!, {});
    }
  };
  const runner: ProcessRunner.ProcessRunner["Service"] = {
    run: (input) =>
      Effect.suspend(() => {
        calls.push({ command: input.command, args: input.args });
        return input.command === "npm"
          ? install(input.args)
          : Effect.sync(() => respond(input.args));
      }).pipe(Effect.map(output)),
  };
  const toolCalls = (subcommand: string) =>
    calls.filter((call) => call.command !== "npm" && call.args.includes(subcommand));
  return { calls, runner, toolCalls, traces };
}

const provideDeps = (
  cli: ReturnType<typeof fakeCli>,
  settings: { readonly enableComputerUse: boolean },
  baseDir: string,
) =>
  Layer.mergeAll(
    ServerConfig.layerTest(process.cwd(), baseDir),
    ServerSettings.ServerSettingsService.layerTest(settings),
    Layer.succeed(ProcessRunner.ProcessRunner, cli.runner),
  ).pipe(Layer.provideMerge(NodeServices.layer));

const preinstall = (baseDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = path.join(baseDir, "tools", "agent-desktop", AGENT_DESKTOP_VERSION);
    yield* fs.makeDirectory(path.join(dir, "node_modules/agent-desktop/bin"), {
      recursive: true,
    });
    yield* fs.writeFileString(path.join(dir, "node_modules/agent-desktop/bin/agent-desktop"), "");
    yield* fs.writeFileString(path.join(dir, ".install-complete"), `${AGENT_DESKTOP_VERSION}\n`);
  });

/** Runs `use` against a service built in its own scope, which the test may close early. */
const withService = <A, E>(
  input: {
    readonly fake?: FakeOptions;
    readonly enabled: boolean;
    readonly installed: boolean;
    readonly platform?: Platform;
  },
  use: (
    service: Effect.Success<ReturnType<typeof make>>,
    context: {
      readonly cli: ReturnType<typeof fakeCli>;
      readonly scope: Scope.Closeable;
      readonly fs: FileSystem.FileSystem;
    },
  ) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const cli = fakeCli(fs, yield* Path.Path, input.fake);
    const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "hive-computer-use-" });
    if (input.installed) yield* preinstall(baseDir);
    const scope = yield* Scope.make();
    const platform = input.platform ?? MAC;
    const service = yield* make({ cursorOverlay: false }).pipe(
      Scope.provide(scope),
      Effect.provideService(HostProcess.Platform, platform.os),
      Effect.provideService(HostProcess.Architecture, platform.arch),
      Effect.provide(provideDeps(cli, { enableComputerUse: input.enabled }, baseDir)),
    );
    return yield* use(service, { cli, scope, fs }).pipe(
      Effect.ensuring(Scope.close(scope, Exit.void)),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const thread = ThreadId.make("thread-1");

describe("ComputerUseService", () => {
  it.effect("installs the pinned agent-desktop only after Computer use is turned on", () => {
    return withService({ enabled: false, installed: false }, (service, { cli }) =>
      Effect.gen(function* () {
        const off = yield* service.state;
        expect(off).toMatchObject({ enabled: false, permissions: null });
        expect(off.tool).toEqual({ requiredVersion: AGENT_DESKTOP_VERSION, installed: false });

        const refused = yield* service.open({ threadId: thread, app: "Finder" }).pipe(Effect.flip);
        expect(refused.code).toBe("disabled");
        expect(cli.calls).toEqual([]);

        const on = yield* service.configure({ enabled: true });
        const npm = cli.calls.filter((call) => call.command === "npm");
        expect(npm).toHaveLength(1);
        expect(npm[0]!.args).toContain(`agent-desktop@${AGENT_DESKTOP_VERSION}`);
        expect(on).toMatchObject({
          enabled: true,
          tool: { installed: true },
          permissions: { accessibility: "granted", screenRecording: "granted" },
        });
      }),
    );
  });

  it.effect("keeps two sessions on different apps independent", () => {
    return withService({ enabled: true, installed: true }, (service, { cli, fs }) =>
      Effect.gen(function* () {
        const finder = yield* service.open({ threadId: thread, app: "finder" });
        const notes = yield* service.open({ threadId: thread, app: "Notes", windowId: "w-2" });
        expect(finder.session.target).toEqual({ app: "Finder" });
        expect(notes.session.target).toEqual({ app: "Notes", windowId: "w-2" });
        expect(finder.session.id).not.toBe(notes.session.id);

        const finderScript = yield* fs.readFileString(finder.command);
        expect(finderScript).toContain(`AGENT_DESKTOP_SESSION='${finder.session.id}'`);
        expect(finderScript).not.toContain(notes.session.id);

        // An action in one session shows only in that session's recent actions.
        cli.traces.get(finder.session.id)!.push({
          event: "command.end",
          command: "click",
          ok: true,
          ts_ms: 5,
        });
        const before = yield* service.state;
        const recent = (id: string) =>
          before.sessions.find((session) => session.id === id)!.recentActions;
        expect(recent(finder.session.id)).toEqual([{ command: "click", ok: true, at: 5 }]);
        expect(recent(notes.session.id)).toEqual([]);

        yield* service.close(finder.session.id);
        expect(cli.toolCalls("end").map((call) => call.args.at(-1))).toEqual([finder.session.id]);
        expect(yield* fs.exists(finder.command)).toBe(false);
        expect(yield* fs.exists(notes.command)).toBe(true);
        expect((yield* service.sessions).map((session) => session.id)).toEqual([notes.session.id]);

        const missing = yield* service.close(finder.session.id).pipe(Effect.flip);
        expect(missing.code).toBe("not_found");
      }),
    );
  });

  it.effect("ends every open session when the server stops", () => {
    return withService({ enabled: true, installed: true }, (service, { cli, scope, fs }) =>
      Effect.gen(function* () {
        const a = yield* service.open({ threadId: thread, app: "Finder" });
        const b = yield* service.open({ threadId: null, app: "Notes" });
        yield* Scope.close(scope, Exit.void);
        expect(cli.toolCalls("end").map((call) => call.args.at(-1))).toEqual([
          a.session.id,
          b.session.id,
        ]);
        expect(yield* fs.exists(a.command)).toBe(false);
      }),
    );
  });

  it.effect("ends sessions a previous server left open", () => {
    return withService(
      { fake: { leftOver: ["run-old"] }, enabled: true, installed: true },
      (_service, { cli }) =>
        Effect.sync(() => {
          expect(cli.toolCalls("end").map((call) => call.args.at(-1))).toEqual(["run-old"]);
        }),
    );
  });

  it.effect("refuses to open without Accessibility permission and says how to grant it", () => {
    return withService(
      { fake: { accessibility: "denied" }, enabled: true, installed: true },
      (service, { cli }) =>
        Effect.gen(function* () {
          const error = yield* service.open({ threadId: thread, app: "Finder" }).pipe(Effect.flip);
          expect(error.code).toBe("permission_missing");
          expect(error.reason).toContain("Privacy & Security > Accessibility");
          expect(cli.toolCalls("start")).toEqual([]);
          expect((yield* service.state).permissions?.accessibility).toBe("denied");
        }),
    );
  });

  it.effect("rejects an app that is not open", () => {
    return withService({ enabled: true, installed: true }, (service, { cli }) =>
      Effect.gen(function* () {
        const error = yield* service.open({ threadId: thread, app: "Mail" }).pipe(Effect.flip);
        expect(error.code).toBe("not_found");
        expect(cli.toolCalls("start")).toEqual([]);
      }),
    );
  });

  it.effect(
    "says an unsupported platform is unsupported without installing or running anything",
    () => {
      return withService(
        { enabled: false, installed: false, platform: { os: "win32", arch: "x64" } },
        (service, { cli }) =>
          Effect.gen(function* () {
            expect((yield* service.state).platform).toEqual({
              os: "win32",
              supported: false,
              detail: "Computer use is not available on Windows in Hive yet.",
            });
            const error = yield* service.configure({ enabled: true }).pipe(Effect.flip);
            expect(error.code).toBe("unsupported_platform");
            expect(cli.calls).toEqual([]);
          }),
      );
    },
  );
});
