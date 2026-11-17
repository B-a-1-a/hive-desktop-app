import {
  type ComputerUseAction,
  type ComputerUseApp,
  ComputerUseError,
  type ComputerUseErrorCode,
  type ComputerUsePermissions,
  type ComputerUsePermissionState,
  type ComputerUseSession,
  type ComputerUseState,
  type ComputerUseWindow,
  type ThreadId,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as ServerConfig from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as ServerSettings from "../serverSettings.ts";
import {
  ensurePinnedNpmTool,
  isPinnedNpmToolInstalled,
  type ToolSpec,
} from "../device/DeviceToolchain.ts";
import TOOL_VERSIONS from "./computerUseToolVersions.json" with { type: "json" };

export const AGENT_DESKTOP_VERSION = TOOL_VERSIONS["agent-desktop"];

const AGENT_DESKTOP_SPEC: ToolSpec = {
  name: "agent-desktop",
  version: AGENT_DESKTOP_VERSION,
  entry: ["bin", "agent-desktop"],
};

const COMMAND_TIMEOUT = Duration.seconds(30);
const RECENT_ACTIONS = 10;
// Hive's own bookkeeping calls land in the session trace too; they are not the agent's actions.
const BOOKKEEPING_COMMANDS = new Set(["trace", "session", "status", "permissions", "version"]);

interface ComputerUsePlatform {
  readonly os: NodeJS.Platform;
  readonly arch: string;
}

interface PlatformSupport {
  readonly supported: boolean;
  readonly detail: string | null;
}

/** agent-desktop also ships for Windows; Hive's bound launcher is a POSIX script, so not yet. */
const platformSupport = (platform: ComputerUsePlatform): PlatformSupport => {
  const arch = platform.arch === "arm64" || platform.arch === "x64";
  if ((platform.os === "darwin" || platform.os === "linux") && arch) {
    return { supported: true, detail: null };
  }
  if (platform.os === "win32") {
    return { supported: false, detail: "Computer use is not available on Windows in Hive yet." };
  }
  return {
    supported: false,
    detail: `Computer use is not available on this computer (${platform.os} ${platform.arch}).`,
  };
};

const fail = (code: ComputerUseErrorCode, reason: string, cause?: unknown) =>
  new ComputerUseError({ code, reason, ...(cause === undefined ? {} : { cause }) });

interface Envelope {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: { readonly code?: string; readonly message?: string };
}

const parseEnvelope = (stdout: string): Envelope | null => {
  try {
    const value: unknown = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
    return typeof value === "object" && value !== null && "ok" in value
      ? (value as Envelope)
      : null;
  } catch {
    return null;
  }
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const PERMISSION_STATES = new Set<string>(["granted", "denied", "not_required", "unknown"]);
const permissionState = (value: unknown): ComputerUsePermissionState => {
  const state = record(value).state;
  return typeof state === "string" && PERMISSION_STATES.has(state)
    ? (state as ComputerUsePermissionState)
    : "unknown";
};

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

export class ComputerUseService extends Context.Service<
  ComputerUseService,
  {
    readonly state: Effect.Effect<ComputerUseState>;
    /** Turning it on is the person's consent to install the pinned agent-desktop. */
    readonly configure: (input: {
      readonly enabled: boolean;
    }) => Effect.Effect<ComputerUseState, ComputerUseError>;
    readonly listTargets: (input: { readonly app?: string | undefined }) => Effect.Effect<
      {
        readonly apps: ReadonlyArray<ComputerUseApp>;
        readonly windows: ReadonlyArray<ComputerUseWindow>;
      },
      ComputerUseError
    >;
    readonly open: (input: {
      readonly threadId: ThreadId | null;
      readonly app: string;
      readonly windowId?: string | undefined;
    }) => Effect.Effect<
      { readonly session: ComputerUseSession; readonly command: string },
      ComputerUseError
    >;
    readonly close: (sessionId: string) => Effect.Effect<void, ComputerUseError>;
    readonly sessions: Effect.Effect<ReadonlyArray<ComputerUseSession>>;
  }
>()("t3/computerUse/ComputerUseService") {}

export const make = Effect.fn("ComputerUseService.make")(function* (
  options: { readonly cursorOverlay?: boolean } = {},
) {
  const platform: ComputerUsePlatform = {
    os: yield* HostProcess.Platform,
    arch: yield* HostProcess.Architecture,
  };
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runner = yield* ProcessRunner.ProcessRunner;
  const config = yield* ServerConfig.ServerConfig;
  const settings = yield* ServerSettings.ServerSettingsService;
  const toolchain = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | ProcessRunner.ProcessRunner
  >();
  const support = platformSupport(platform);
  const cursorOverlay = options.cursorOverlay ?? true;

  const root = path.join(config.stateDir, "computer-use");
  // Hive owns this agent-desktop state root, so every session in it is Hive's to end.
  const stateRoot = path.join(root, "agent-desktop");
  const launcherRoot = path.join(root, "bin");
  const packageBin = path.join(
    config.baseDir,
    "tools",
    AGENT_DESKTOP_SPEC.name,
    AGENT_DESKTOP_SPEC.version,
    "node_modules",
    AGENT_DESKTOP_SPEC.name,
    "bin",
  );
  // The native binary directly: the package's Node launcher adds a process and ~125 ms per call.
  const binary = path.join(packageBin, `agent-desktop-${platform.os}-${platform.arch}`);
  const toolEnv: Record<string, string> = {
    AGENT_DESKTOP_HOME: stateRoot,
    ...(platform.os === "darwin"
      ? {
          AGENT_DESKTOP_MACOS_HELPER_PATH: path.join(
            packageBin,
            `agent-desktop-macos-helper-darwin-${platform.arch}`,
          ),
        }
      : {}),
  };

  const sessionsRef = yield* SynchronizedRef.make(new Map<string, ComputerUseSession>());

  const enabled = settings.getSettings.pipe(
    Effect.map((value) => value.enableComputerUse),
    Effect.orElseSucceed(() => false),
  );
  const installed = isPinnedNpmToolInstalled(config.baseDir, AGENT_DESKTOP_SPEC).pipe(
    Effect.orElseSucceed(() => false),
    Effect.provide(toolchain),
  );

  const run = Effect.fn("ComputerUseService.run")(function* (
    args: ReadonlyArray<string>,
    sessionId?: string,
  ) {
    const result = yield* runner
      .run({
        command: binary,
        args: sessionId === undefined ? args : ["--session", sessionId, ...args],
        env: { ...process.env, ...toolEnv },
        timeout: COMMAND_TIMEOUT,
      })
      .pipe(
        Effect.mapError((cause) =>
          fail("tool_failed", `agent-desktop ${args[0]} could not run.`, cause),
        ),
      );
    const envelope = parseEnvelope(result.stdout);
    if (envelope === null) {
      return yield* fail(
        "tool_failed",
        `agent-desktop ${args[0]} returned no result (exit code ${String(result.code)}).`,
        result.stderr,
      );
    }
    if (!envelope.ok) {
      const code = envelope.error?.code;
      const message = envelope.error?.message ?? "unknown error";
      return yield* code === "PERM_DENIED"
        ? fail("permission_missing", permissionMessage(platform), envelope.error)
        : fail("tool_failed", `agent-desktop ${args[0]} failed: ${message}`, envelope.error);
    }
    return envelope.data;
  });

  const ensureStateRoot = Effect.gen(function* () {
    yield* fs.makeDirectory(stateRoot, { recursive: true });
    // agent-desktop refuses a state root other users can read.
    yield* fs.chmod(stateRoot, 0o700);
    yield* fs.makeDirectory(launcherRoot, { recursive: true });
  }).pipe(
    Effect.mapError((cause) =>
      fail("tool_failed", "Hive could not prepare its computer-use folder.", cause),
    ),
  );

  const permissions = Effect.gen(function* () {
    const data = record(yield* run(["permissions"]));
    return {
      accessibility: permissionState(data.accessibility),
      screenRecording: permissionState(data.screen_recording),
      automation: permissionState(data.automation),
    } satisfies ComputerUsePermissions;
  });

  /** Everything that must hold before an agent may touch an app. */
  const ready = Effect.gen(function* () {
    if (!support.supported) {
      return yield* fail("unsupported_platform", support.detail ?? "Unsupported platform.");
    }
    if (!(yield* enabled)) {
      return yield* fail(
        "disabled",
        "Computer use is turned off. Ask the person to turn it on in Settings > Computer use.",
      );
    }
    yield* ensurePinnedNpmTool(config.baseDir, AGENT_DESKTOP_SPEC).pipe(
      Effect.mapError((cause) => fail("install_failed", cause.message, cause)),
      Effect.provide(toolchain),
    );
    yield* ensureStateRoot;
  });

  const recentActions = Effect.fn("ComputerUseService.recentActions")(function* (
    sessionId: string,
  ) {
    const data = record(yield* run(["trace", "show", "--limit", "50"], sessionId));
    const events = Array.isArray(data.events) ? data.events.map(record) : [];
    const actions: Array<ComputerUseAction> = [];
    for (const event of events) {
      const command = event.command;
      if (typeof command !== "string" || BOOKKEEPING_COMMANDS.has(command)) continue;
      const at = typeof event.ts_ms === "number" ? event.ts_ms : 0;
      if (event.event === "command.start") actions.push({ command, ok: null, at });
      if (event.event === "command.end") {
        const started = actions.findLastIndex(
          (action) => action.command === command && action.ok === null,
        );
        const ended = { command, ok: event.ok === true, at };
        if (started === -1) actions.push(ended);
        else actions[started] = ended;
      }
    }
    return actions.slice(-RECENT_ACTIONS);
  });

  const state: ComputerUseService["Service"]["state"] = Effect.gen(function* () {
    const isEnabled = yield* enabled;
    const isInstalled = support.supported && (yield* installed);
    const checked =
      isEnabled && isInstalled
        ? yield* permissions.pipe(
            Effect.map((value) => ({ permissions: value, detail: null })),
            Effect.catch((error: ComputerUseError) =>
              Effect.succeed({ permissions: null, detail: error.reason }),
            ),
          )
        : { permissions: null, detail: null };
    const sessions = [...(yield* SynchronizedRef.get(sessionsRef)).values()];
    const views = yield* Effect.forEach(
      sessions,
      (session) =>
        recentActions(session.id).pipe(
          Effect.orElseSucceed((): ReadonlyArray<ComputerUseAction> => []),
          Effect.map((recent) => ({ ...session, recentActions: recent })),
        ),
      { concurrency: 4 },
    );
    return {
      enabled: isEnabled,
      platform: { os: platform.os, supported: support.supported, detail: support.detail },
      tool: { requiredVersion: AGENT_DESKTOP_VERSION, installed: isInstalled },
      permissions: checked.permissions,
      permissionsDetail: checked.detail,
      sessions: views,
    } satisfies ComputerUseState;
  }).pipe(Effect.withSpan("ComputerUseService.state"));

  const endSession = Effect.fn("ComputerUseService.endSession")(function* (sessionId: string) {
    // `session end` also stops the session's cursor overlay renderer.
    yield* run(["session", "end", sessionId]).pipe(
      Effect.catch((error: ComputerUseError) =>
        Effect.logWarning("Ending a computer-use session failed", { sessionId, error }),
      ),
    );
    yield* fs
      .remove(path.join(launcherRoot, sessionId), { recursive: true, force: true })
      .pipe(Effect.ignore);
  });

  const endAll = SynchronizedRef.modifyEffect(sessionsRef, (sessions) =>
    Effect.forEach(sessions.keys(), endSession, { discard: true }).pipe(
      Effect.as([undefined, new Map<string, ComputerUseSession>()] as const),
    ),
  );

  const configure: ComputerUseService["Service"]["configure"] = Effect.fn(
    "ComputerUseService.configure",
  )(function* (input) {
    if (input.enabled && !support.supported) {
      return yield* fail("unsupported_platform", support.detail ?? "Unsupported platform.");
    }
    yield* settings
      .updateSettings({ enableComputerUse: input.enabled })
      .pipe(
        Effect.mapError((cause) =>
          fail("tool_failed", "Hive could not save the Computer use setting.", cause),
        ),
      );
    if (input.enabled) yield* ready;
    else yield* endAll;
    return yield* state;
  });

  const listTargets: ComputerUseService["Service"]["listTargets"] = Effect.fn(
    "ComputerUseService.listTargets",
  )(function* (input) {
    yield* ready;
    const appFilter = input.app === undefined ? [] : ["--app", input.app];
    const [appsData, windowsData] = yield* Effect.all(
      [run(["list-apps", ...appFilter]), run(["list-windows", ...appFilter])],
      { concurrency: 2 },
    );
    const appsList = record(appsData).apps;
    const apps = (Array.isArray(appsList) ? appsList.map(record) : [])
      .filter((app) => app.presentation === "foreground" && typeof app.name === "string")
      .map((app): ComputerUseApp => ({
        name: app.name as string,
        pid: typeof app.pid === "number" ? app.pid : 0,
        ...(typeof app.bundle_id === "string" ? { bundleId: app.bundle_id } : {}),
      }));
    const windows = (Array.isArray(windowsData) ? windowsData.map(record) : [])
      .filter((window) => window.visible !== false && typeof window.id === "string")
      .map((window): ComputerUseWindow => ({
        id: window.id as string,
        app: typeof window.app_name === "string" ? window.app_name : "",
        title: typeof window.title === "string" ? window.title : "",
        focused: window.is_focused === true,
      }));
    return { apps, windows };
  });

  const open: ComputerUseService["Service"]["open"] = Effect.fn("ComputerUseService.open")(
    function* (input) {
      yield* ready;
      const access = yield* permissions;
      if (access.accessibility === "denied") {
        return yield* fail("permission_missing", permissionMessage(platform));
      }
      const { apps, windows } = yield* listTargets({ app: input.app });
      const app = apps.find(
        (candidate) => candidate.name.toLowerCase() === input.app.toLowerCase(),
      );
      if (app === undefined) {
        const near = apps.map((candidate) => candidate.name).slice(0, 5);
        return yield* fail(
          "not_found",
          `No open app named ${input.app}.${near.length > 0 ? ` Did you mean: ${near.join(", ")}?` : ""} Call computer_list for names.`,
        );
      }
      if (
        input.windowId !== undefined &&
        !windows.some((window) => window.id === input.windowId && window.app === app.name)
      ) {
        return yield* fail(
          "not_found",
          `${app.name} has no window ${input.windowId}. Call computer_list for window ids.`,
        );
      }
      const started = record(
        yield* run([
          "session",
          "start",
          "--name",
          `Hive: ${app.name}`.slice(0, 128),
          ...(cursorOverlay ? ["--cursor"] : []),
        ]),
      );
      const sessionId = started.session_id;
      if (typeof sessionId !== "string" || !/^[\w.-]+$/.test(sessionId)) {
        return yield* fail("tool_failed", "agent-desktop did not return a usable session id.");
      }
      const session: ComputerUseSession = {
        id: sessionId,
        threadId: input.threadId,
        target: {
          app: app.name,
          ...(input.windowId === undefined ? {} : { windowId: input.windowId }),
        },
        openedAt:
          typeof started.created_at === "number"
            ? started.created_at
            : yield* Clock.currentTimeMillis,
      };
      const command = path.join(launcherRoot, sessionId, "agent-desktop");
      const script = [
        "#!/bin/sh",
        `# Hive computer-use session for ${app.name.replaceAll("\n", " ")}. Removed when the session closes.`,
        ...Object.entries({ ...toolEnv, AGENT_DESKTOP_SESSION: sessionId }).map(
          ([name, value]) => `export ${name}=${shellQuote(value)}`,
        ),
        `exec ${shellQuote(binary)} "$@"`,
        "",
      ].join("\n");
      yield* Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(command), { recursive: true });
        yield* fs.writeFileString(command, script);
        yield* fs.chmod(command, 0o700);
      }).pipe(
        Effect.mapError((cause) =>
          fail("tool_failed", "Hive could not write the session command.", cause),
        ),
        Effect.tapError(() => endSession(sessionId)),
      );
      yield* SynchronizedRef.update(sessionsRef, (sessions) =>
        new Map(sessions).set(sessionId, session),
      );
      return { session, command };
    },
  );

  const close: ComputerUseService["Service"]["close"] = Effect.fn("ComputerUseService.close")(
    function* (sessionId) {
      yield* SynchronizedRef.modifyEffect(sessionsRef, (sessions) =>
        Effect.gen(function* () {
          if (!sessions.has(sessionId)) {
            return yield* fail("not_found", `No open computer-use session ${sessionId}.`);
          }
          yield* endSession(sessionId);
          const next = new Map(sessions);
          next.delete(sessionId);
          return [undefined, next] as const;
        }),
      );
    },
  );

  // A crashed server leaves sessions (and their cursor overlays) running; end them on start.
  if (support.supported && (yield* installed)) {
    yield* run(["session", "list"]).pipe(
      Effect.flatMap((data) => {
        const listed = record(data).sessions;
        const stale = (Array.isArray(listed) ? listed.map(record) : []).filter(
          (session) => typeof session.session_id === "string" && session.ended_at == null,
        );
        return Effect.forEach(stale, (session) => endSession(session.session_id as string), {
          discard: true,
        });
      }),
      // Ended sessions keep their traces on disk until collected.
      Effect.andThen(run(["session", "gc"])),
      Effect.ignore,
    );
  }
  yield* fs.remove(launcherRoot, { recursive: true, force: true }).pipe(Effect.ignore);
  yield* Effect.addFinalizer(() => endAll);

  return ComputerUseService.of({
    state,
    configure,
    listTargets,
    open,
    close,
    sessions: SynchronizedRef.get(sessionsRef).pipe(Effect.map((value) => [...value.values()])),
  });
});

const permissionMessage = (platform: ComputerUsePlatform) =>
  platform.os === "darwin"
    ? "Hive needs Accessibility permission to operate apps. Ask the person to turn on Hive in System Settings > Privacy & Security > Accessibility, then try again."
    : "The accessibility service is not available in this desktop session. Hive needs it to operate apps.";

export const layer = Layer.effect(ComputerUseService, make());
