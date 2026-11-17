import {
  BrowserUseError,
  type BrowserUseBrowser,
  type BrowserUseConfigureInput,
  type BrowserUseSessionSummary,
  type BrowserUseStatus,
} from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveNodeExecutable } from "@t3tools/shared/nodeRuntime";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as ServerConfig from "../config.ts";
import { ensurePinnedNpmTool, isPinnedNpmToolInstalled } from "../device/DeviceToolchain.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as ServerSettings from "../serverSettings.ts";
import {
  type BrowserSearchRoots,
  defaultSearchRoots,
  detectBrowsers,
  isDetectionSupported,
} from "./browserDetection.ts";
import { BROWSER_USE_CURSOR_SCRIPT } from "./browserUseCursor.ts";
import { writeBrowserUseLauncher } from "./browserUseLauncher.ts";
import BROWSER_USE_TOOL_VERSIONS from "./browserUseToolVersions.json" with { type: "json" };

export const AGENT_BROWSER_SPEC = {
  name: "agent-browser",
  version: BROWSER_USE_TOOL_VERSIONS["agent-browser"],
  entry: ["bin", "agent-browser.js"],
} as const;

/** More open windows than this is almost always an agent that forgot to close one. */
export const MAX_BROWSER_USE_SESSIONS = 6;
const OPEN_TIMEOUT = Duration.seconds(90);
const CLOSE_TIMEOUT = Duration.seconds(20);
// A headed agent-browser daemon never idles out by default; this bounds a forgotten session.
const IDLE_TIMEOUT = "30m";
// macOS limits a Unix socket path to 104 bytes and agent-browser puts `<session>.sock` in this
// folder, so a deep data folder (such as a worktree's) moves it to a short per-server one in /tmp.
const MAX_SOCKET_DIR_LENGTH = 86;

const shortHash = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/** Tests point detection at temporary folders instead of this machine's application folders. */
export const BrowserSearchRootsOverride = Context.Reference<BrowserSearchRoots | null>(
  "t3/browserUse/BrowserSearchRootsOverride",
  { defaultValue: () => null },
);

interface OpenSession {
  readonly summary: BrowserUseSessionSummary;
  readonly dir: string;
  readonly command: string;
}

export class BrowserUseService extends Context.Service<
  BrowserUseService,
  {
    readonly status: Effect.Effect<BrowserUseStatus, BrowserUseError>;
    /** Turning browser use on is the person's consent to install the pinned agent-browser. */
    readonly configure: (
      input: BrowserUseConfigureInput,
    ) => Effect.Effect<BrowserUseStatus, BrowserUseError>;
    /** Launches a new window of the chosen browser with a fresh profile and returns its bound CLI. */
    readonly open: (input: {
      readonly threadId: string;
      readonly url?: string | undefined;
    }) => Effect.Effect<
      { readonly session: BrowserUseSessionSummary; readonly command: string },
      BrowserUseError
    >;
    /** Closes one session, or every session of a thread. Returns the ids it closed. */
    readonly close: (input: {
      readonly threadId?: string | undefined;
      readonly sessionId?: string | undefined;
    }) => Effect.Effect<ReadonlyArray<string>, BrowserUseError>;
    readonly sessions: (
      threadId?: string,
    ) => Effect.Effect<ReadonlyArray<BrowserUseSessionSummary>>;
  }
>()("t3/browserUse/BrowserUseService") {}

const isBrowserUseError = Schema.is(BrowserUseError);

const settingsError = (cause: unknown) =>
  new BrowserUseError({ reason: "Could not read or save the Browser use settings.", cause });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const settings = yield* ServerSettings.ServerSettingsService;
  const runner = yield* ProcessRunner.ProcessRunner;
  const random = yield* SecureRandom.SecureRandom;
  const context = yield* Effect.context<
    FileSystem.FileSystem | Path.Path | ProcessRunner.ProcessRunner
  >();

  const rootDir = path.join(config.stateDir, "browser-use");
  const preferredSocketDir = path.join(rootDir, "s");
  const socketDir =
    preferredSocketDir.length <= MAX_SOCKET_DIR_LENGTH || (yield* HostProcess.Platform) === "win32"
      ? preferredSocketDir
      : path.join("/tmp", `hive-browser-use-${shortHash(config.stateDir)}`);
  const sessionsDir = path.join(rootDir, "sessions");
  const cursorPath = path.join(rootDir, "cursor.js");
  const configPath = path.join(rootDir, "agent-browser.json");
  const registry = yield* SynchronizedRef.make(new Map<string, OpenSession>());

  const searchRoots = Effect.gen(function* () {
    const override = yield* BrowserSearchRootsOverride;
    if (override) return override;
    return defaultSearchRoots(
      yield* HostProcess.Platform,
      yield* HostProcess.HomeDirectory,
      yield* HostProcess.Environment,
    );
  });

  const browsers = searchRoots.pipe(Effect.flatMap(detectBrowsers), Effect.provide(context));

  const summaries = (threadId?: string) =>
    SynchronizedRef.get(registry).pipe(
      Effect.map((sessions) =>
        [...sessions.values()]
          .filter((session) => session.command !== "")
          .map((session) => session.summary)
          .filter((summary) => threadId === undefined || summary.threadId === threadId),
      ),
    );

  const status = Effect.gen(function* () {
    const current = yield* settings.getSettings.pipe(Effect.mapError(settingsError));
    const roots = yield* searchRoots;
    return {
      enabled: current.enableBrowserUse,
      platformSupported: isDetectionSupported(roots.platform),
      browsers: yield* browsers,
      selectedBrowserId: current.browserUseBrowserId,
      tool: {
        requiredVersion: AGENT_BROWSER_SPEC.version,
        installed: yield* isPinnedNpmToolInstalled(config.baseDir, AGENT_BROWSER_SPEC).pipe(
          Effect.provide(context),
          Effect.orElseSucceed(() => false),
        ),
      },
      sessions: yield* summaries(),
    } satisfies BrowserUseStatus;
  }).pipe(Effect.withSpan("BrowserUseService.status"));

  const installTool = ensurePinnedNpmTool(config.baseDir, AGENT_BROWSER_SPEC).pipe(
    Effect.provide(context),
    Effect.mapError(
      (cause) =>
        new BrowserUseError({
          reason:
            "Hive could not install agent-browser, the tool that drives the browser. Check the internet connection and try again.",
          cause,
        }),
    ),
  );

  const configure = Effect.fn("BrowserUseService.configure")(function* (
    input: BrowserUseConfigureInput,
  ) {
    const detected = yield* browsers;
    if (input.browserId) {
      const chosen = detected.find((browser) => browser.id === input.browserId);
      if (!chosen?.supported) {
        return yield* new BrowserUseError({
          reason: chosen
            ? (chosen.unsupportedReason ?? `${chosen.name} cannot be used yet.`)
            : "That browser was not found on this computer.",
        });
      }
    }
    const current = yield* settings.getSettings.pipe(Effect.mapError(settingsError));
    const browserId =
      input.browserId !== undefined
        ? input.browserId
        : input.enabled && current.browserUseBrowserId === null
          ? (detected.find((browser) => browser.supported)?.id ?? null)
          : undefined;
    yield* settings
      .updateSettings({
        ...(input.enabled === undefined ? {} : { enableBrowserUse: input.enabled }),
        ...(browserId === undefined ? {} : { browserUseBrowserId: browserId }),
      })
      .pipe(Effect.mapError(settingsError));
    if (input.enabled) yield* installTool;
    return yield* status;
  });

  const run = (command: string, args: ReadonlyArray<string>, timeout: Duration.Input) =>
    runner.run({
      command,
      args,
      timeout,
      timeoutBehavior: "timedOutResult",
      maxOutputBytes: 64_000,
    });

  const removeSessionFiles = (dir: string) =>
    fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore);

  // A server that crashed can leave daemons behind. They live only in Hive's own socket folder,
  // so `close --all` there cannot reach any other agent-browser on this machine.
  const sweepLeftovers = Effect.gen(function* () {
    const leftovers = yield* fs.readDirectory(socketDir).pipe(Effect.orElseSucceed(() => []));
    if (leftovers.length > 0) {
      const node = yield* resolveNodeExecutable("Browser use");
      const entry = path.join(
        config.baseDir,
        "tools",
        AGENT_BROWSER_SPEC.name,
        AGENT_BROWSER_SPEC.version,
        "node_modules",
        AGENT_BROWSER_SPEC.name,
        ...AGENT_BROWSER_SPEC.entry,
      );
      yield* runner
        .run({
          command: node,
          args: [entry, "close", "--all"],
          env: {
            AGENT_BROWSER_SOCKET_DIR: socketDir,
            AGENT_BROWSER_CONFIG: configPath,
            ELECTRON_RUN_AS_NODE: "1",
          },
          timeout: CLOSE_TIMEOUT,
          timeoutBehavior: "timedOutResult",
        })
        .pipe(Effect.ignore);
    }
    yield* removeSessionFiles(sessionsDir);
  }).pipe(Effect.ignore, Effect.provide(context));
  const sweepOnce = yield* Effect.cached(sweepLeftovers);

  const closeSession = Effect.fn("BrowserUseService.closeSession")(function* (
    session: OpenSession,
  ) {
    const result = yield* run(session.command, ["close"], CLOSE_TIMEOUT).pipe(Effect.option);
    yield* removeSessionFiles(session.dir);
    // agent-browser keeps the tab binding for a reattach that cannot happen once Hive closes it.
    yield* removeSessionFiles(path.join(socketDir, `${session.summary.sessionId}.target`));
    yield* SynchronizedRef.update(registry, (sessions) => {
      const next = new Map(sessions);
      next.delete(session.summary.sessionId);
      return next;
    });
    if (result._tag === "None" || result.value.code !== 0) {
      yield* Effect.logWarning("agent-browser close did not confirm", {
        sessionId: session.summary.sessionId,
      });
    }
  });

  const open = Effect.fn("BrowserUseService.open")(function* (input: {
    readonly threadId: string;
    readonly url?: string | undefined;
  }) {
    const current = yield* settings.getSettings.pipe(Effect.mapError(settingsError));
    if (!current.enableBrowserUse) {
      return yield* new BrowserUseError({
        reason:
          "Browser use is turned off. Ask the user to turn it on in Settings > Browser > Browser use.",
      });
    }
    const roots = yield* searchRoots;
    if (!isDetectionSupported(roots.platform)) {
      return yield* new BrowserUseError({
        reason: `Browser use does not support this operating system (${roots.platform}) yet.`,
      });
    }
    const detected = yield* browsers;
    const browser: BrowserUseBrowser | undefined = detected.find(
      (candidate) => candidate.id === current.browserUseBrowserId,
    );
    if (!browser) {
      return yield* new BrowserUseError({
        reason:
          current.browserUseBrowserId === null
            ? "No browser is chosen for Browser use. Ask the user to choose one in Settings > Browser > Browser use."
            : "The browser chosen for Browser use is no longer installed. Ask the user to choose another in Settings > Browser > Browser use.",
      });
    }
    if (!browser.supported) {
      return yield* new BrowserUseError({
        reason: browser.unsupportedReason ?? `${browser.name} cannot be used yet.`,
      });
    }
    const toolPaths = yield* installTool;
    yield* sweepOnce;

    const sessionId = `b${(yield* random.uuidV4()).replaceAll("-", "").slice(0, 8)}`;
    const reserved = yield* SynchronizedRef.modify(registry, (sessions) => {
      if (sessions.size >= MAX_BROWSER_USE_SESSIONS) return [false, sessions] as const;
      const next = new Map(sessions);
      // Placeholder until the window is up, so parallel opens count against the limit.
      next.set(sessionId, {
        summary: {
          sessionId,
          threadId: input.threadId,
          browserId: browser.id,
          browserName: browser.name,
          openedAt: "",
        },
        dir: "",
        command: "",
      });
      return [true, next] as const;
    });
    if (!reserved) {
      return yield* new BrowserUseError({
        reason: `${MAX_BROWSER_USE_SESSIONS} browser sessions are already open. Close one with browser_use_close first.`,
      });
    }

    const dir = path.join(sessionsDir, sessionId);
    const release = SynchronizedRef.update(registry, (sessions) => {
      const next = new Map(sessions);
      next.delete(sessionId);
      return next;
    }).pipe(Effect.andThen(removeSessionFiles(dir)));

    return yield* Effect.gen(function* () {
      yield* fs.makeDirectory(rootDir, { recursive: true });
      yield* fs.makeDirectory(socketDir, { recursive: true, mode: 0o700 });
      yield* fs.writeFileString(cursorPath, BROWSER_USE_CURSOR_SCRIPT);
      // An explicit config stops agent-browser from reading the person's ~/.agent-browser config.
      yield* fs.writeFileString(configPath, "{}\n");
      const command = yield* writeBrowserUseLauncher({
        dir,
        entryPath: toolPaths.entryPath,
        boundArgs: [
          "--session",
          sessionId,
          "--headed",
          "--executable-path",
          browser.executablePath,
          "--profile",
          path.join(dir, "profile"),
          "--init-script",
          cursorPath,
          "--input-mode",
          "smooth",
          "--idle-timeout",
          IDLE_TIMEOUT,
        ],
        env: {
          AGENT_BROWSER_SOCKET_DIR: socketDir,
          AGENT_BROWSER_CONFIG: configPath,
          AGENT_BROWSER_NO_VERSION_CHECK: "1",
        },
      });
      const result = yield* run(command, ["open", input.url ?? "about:blank"], OPEN_TIMEOUT);
      if (result.code !== 0) {
        yield* run(command, ["close"], CLOSE_TIMEOUT).pipe(Effect.ignore);
        return yield* new BrowserUseError({
          reason: result.timedOut
            ? `${browser.name} did not start in time.`
            : `${browser.name} could not be started for Browser use (agent-browser exit code ${result.code}).`,
          cause: result,
        });
      }
      const summary: BrowserUseSessionSummary = {
        sessionId,
        threadId: input.threadId,
        browserId: browser.id,
        browserName: browser.name,
        openedAt: DateTime.formatIso(yield* DateTime.now),
      };
      yield* SynchronizedRef.update(registry, (sessions) =>
        new Map(sessions).set(sessionId, { summary, dir, command }),
      );
      return { session: summary, command };
    }).pipe(
      Effect.provide(context),
      Effect.mapError((cause) =>
        isBrowserUseError(cause)
          ? cause
          : new BrowserUseError({ reason: "Hive could not prepare the browser session.", cause }),
      ),
      Effect.onError(() => release),
    );
  });

  const close = Effect.fn("BrowserUseService.close")(function* (input: {
    readonly threadId?: string | undefined;
    readonly sessionId?: string | undefined;
  }) {
    const sessions = [...(yield* SynchronizedRef.get(registry)).values()].filter(
      (session) =>
        session.command !== "" &&
        (input.sessionId === undefined || session.summary.sessionId === input.sessionId) &&
        (input.threadId === undefined || session.summary.threadId === input.threadId),
    );
    if (input.sessionId !== undefined && sessions.length === 0) {
      return yield* new BrowserUseError({
        reason: `No open browser session ${input.sessionId.slice(0, 64)}${input.threadId === undefined ? "" : " in this thread"}.`,
      });
    }
    yield* Effect.forEach(sessions, closeSession, { concurrency: "unbounded", discard: true });
    return sessions.map((session) => session.summary.sessionId);
  });

  yield* Effect.addFinalizer(() =>
    SynchronizedRef.get(registry).pipe(
      Effect.flatMap((sessions) =>
        Effect.forEach(
          [...sessions.values()].filter((session) => session.command !== ""),
          closeSession,
          { concurrency: "unbounded", discard: true },
        ),
      ),
      Effect.ignore,
    ),
  );

  return BrowserUseService.of({
    status,
    configure,
    open,
    close,
    sessions: summaries,
  });
});

export const layer = Layer.effect(BrowserUseService, make);
