import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
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
import { type BrowserSearchRoots, detectBrowsers } from "./browserDetection.ts";
import * as BrowserUseService from "./BrowserUseService.ts";

const CHROME = "Google Chrome.app/Contents/MacOS/Google Chrome";

interface Call {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

const result = (code: number) => ({
  code: ChildProcessSpawner.ExitCode(code),
  stdout: "",
  stderr: "",
  timedOut: false,
  stdoutTruncated: false,
  stderrTruncated: false,
  stdoutInvalidUtf8: false,
  stderrInvalidUtf8: false,
});

/** Stands in for agent-browser: records each launcher call and answers with `openExitCode`. */
const fakeRunner = (calls: Array<Call>, openExitCode = 0) =>
  ProcessRunner.ProcessRunner.of({
    run: (input) =>
      Effect.sync(() => {
        calls.push({ command: input.command, args: input.args });
        return result(input.args[0] === "open" ? openExitCode : 0);
      }),
  });

const writeFile = Effect.fn("test.writeFile")(function* (file: string, content = "") {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true });
  yield* fs.writeFileString(file, content);
});

/**
 * A temp Hive home with agent-browser already installed (so nothing is downloaded) and an
 * Applications folder holding Chrome and Firefox. /tmp keeps the socket folder path short.
 */
const fixture = Effect.fn("test.fixture")(function* (
  settings: { enableBrowserUse?: boolean; browserUseBrowserId?: string | null } = {
    enableBrowserUse: true,
    browserUseBrowserId: "chrome",
  },
  openExitCode = 0,
  nested = "",
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tempDir = yield* fs.makeTempDirectoryScoped({ directory: "/tmp", prefix: "hive-bu-" });
  const baseDir = path.join(tempDir, nested);
  const apps = path.join(baseDir, "Applications");
  yield* writeFile(path.join(apps, CHROME));
  yield* writeFile(path.join(apps, "Firefox.app/Contents/MacOS/firefox"));
  const tool = path.join(
    baseDir,
    "tools",
    "agent-browser",
    BrowserUseService.AGENT_BROWSER_SPEC.version,
  );
  yield* writeFile(path.join(tool, "node_modules/agent-browser/bin/agent-browser.js"));
  yield* writeFile(
    path.join(tool, ".install-complete"),
    `${BrowserUseService.AGENT_BROWSER_SPEC.version}\n`,
  );
  const roots: BrowserSearchRoots = {
    platform: "darwin",
    macApplications: [apps],
    linuxBin: [],
    windowsPrograms: [],
  };
  const calls: Array<Call> = [];
  const scope = yield* Scope.make();
  const context = yield* Layer.buildWithScope(
    BrowserUseService.layer.pipe(
      Layer.provide(ServerConfig.layerTest(baseDir, baseDir)),
      Layer.provide(ServerSettings.ServerSettingsService.layerTest(settings)),
      Layer.provide(Layer.succeed(ProcessRunner.ProcessRunner, fakeRunner(calls, openExitCode))),
      Layer.provide(NodeCrypto.layer),
    ),
    scope,
  );
  yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
  const service = Context.get(context, BrowserUseService.BrowserUseService);
  return { baseDir, calls, service, scope, roots };
});

const withRoots =
  (roots: BrowserSearchRoots) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, BrowserUseService.BrowserSearchRootsOverride, roots);

const sessionArgs = (calls: ReadonlyArray<Call>, command: string) =>
  calls.filter((call) => call.command === command).map((call) => call.args[0]);

it.effect("detects installed browsers per platform and marks non-Chromium ones unsupported", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "hive-bu-detect-" });
    yield* writeFile(path.join(root, "mac2", CHROME));
    yield* writeFile(path.join(root, "mac2", "Safari.app/Contents/MacOS/Safari"));
    yield* writeFile(path.join(root, "bin", "chromium-browser"));
    yield* writeFile(path.join(root, "win", "Microsoft", "Edge", "Application", "msedge.exe"));

    const mac = yield* detectBrowsers({
      platform: "darwin",
      macApplications: [path.join(root, "mac1"), path.join(root, "mac2")],
      linuxBin: [],
      windowsPrograms: [],
    });
    expect(mac.map((browser) => [browser.id, browser.supported])).toEqual([
      ["chrome", true],
      ["safari", false],
    ]);
    expect(mac[0]!.executablePath).toBe(path.join(root, "mac2", CHROME));
    expect(mac[1]!.unsupportedReason).toContain("Chromium-based");

    const linux = yield* detectBrowsers({
      platform: "linux",
      macApplications: [],
      linuxBin: [path.join(root, "bin")],
      windowsPrograms: [],
    });
    expect(linux.map((browser) => browser.id)).toEqual(["chromium"]);

    const windows = yield* detectBrowsers({
      platform: "win32",
      macApplications: [],
      linuxBin: [],
      windowsPrograms: [path.join(root, "win")],
    });
    expect(windows.map((browser) => browser.id)).toEqual(["edge"]);

    const other = yield* detectBrowsers({
      platform: "freebsd",
      macApplications: [path.join(root, "mac2")],
      linuxBin: [path.join(root, "bin")],
      windowsPrograms: [],
    });
    expect(other).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("turning browser use on picks the first supported browser and refuses others", () =>
  Effect.gen(function* () {
    const { service, roots } = yield* fixture({
      enableBrowserUse: false,
      browserUseBrowserId: null,
    });
    const status = yield* service.configure({ enabled: true }).pipe(withRoots(roots));
    expect(status.enabled).toBe(true);
    expect(status.selectedBrowserId).toBe("chrome");
    expect(status.tool.installed).toBe(true);
    expect(status.browsers.map((browser) => browser.id)).toEqual(["chrome", "firefox"]);

    const firefox = yield* service
      .configure({ browserId: "firefox" })
      .pipe(withRoots(roots), Effect.flip);
    expect(firefox.reason).toContain("Chromium-based");
    const missing = yield* service
      .configure({ browserId: "edge" })
      .pipe(withRoots(roots), Effect.flip);
    expect(missing.reason).toBe("That browser was not found on this computer.");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("refuses to open while browser use is off or no browser is chosen", () =>
  Effect.gen(function* () {
    const off = yield* fixture({ enableBrowserUse: false, browserUseBrowserId: "chrome" });
    const offError = yield* off.service
      .open({ threadId: "t1" })
      .pipe(withRoots(off.roots), Effect.flip);
    expect(offError.reason).toContain("turned off");
    expect(off.calls).toEqual([]);

    const unchosen = yield* fixture({ enableBrowserUse: true, browserUseBrowserId: null });
    const unchosenError = yield* unchosen.service
      .open({ threadId: "t1" })
      .pipe(withRoots(unchosen.roots), Effect.flip);
    expect(unchosenError.reason).toContain("No browser is chosen");
    expect(unchosen.calls).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("parallel sessions get their own launcher and profile, and close independently", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { service, calls, roots } = yield* fixture();
    const [first, second] = yield* Effect.all(
      [
        service.open({ threadId: "t1", url: "https://example.com" }),
        service.open({ threadId: "t1" }),
      ],
      { concurrency: "unbounded" },
    ).pipe(withRoots(roots));
    expect(first.session.sessionId).not.toBe(second.session.sessionId);
    expect(first.command).not.toBe(second.command);
    expect(sessionArgs(calls, first.command)).toEqual(["open"]);
    expect(calls.find((call) => call.command === first.command)?.args).toEqual([
      "open",
      "https://example.com",
    ]);
    expect(calls.find((call) => call.command === second.command)?.args).toEqual([
      "open",
      "about:blank",
    ]);

    const launcher = yield* fs.readFileString(
      first.command.replace(/agent-browser$/, "agent-browser-launcher.mjs"),
    );
    expect(launcher).toContain(JSON.stringify(first.session.sessionId));
    expect(launcher).not.toContain(second.session.sessionId);
    expect(launcher).toContain("--headed");

    const third = yield* service.open({ threadId: "t2" }).pipe(withRoots(roots));
    expect((yield* service.sessions("t1")).map((s) => s.sessionId).sort()).toEqual(
      [first.session.sessionId, second.session.sessionId].sort(),
    );

    expect(yield* service.close({ threadId: "t1", sessionId: first.session.sessionId })).toEqual([
      first.session.sessionId,
    ]);
    expect(sessionArgs(calls, first.command)).toEqual(["open", "close"]);
    expect(sessionArgs(calls, second.command)).toEqual(["open"]);
    expect(yield* fs.exists(first.command)).toBe(false);
    expect(yield* fs.exists(second.command)).toBe(true);

    // Another thread cannot close this thread's session.
    const foreign = yield* service
      .close({ threadId: "t2", sessionId: second.session.sessionId })
      .pipe(Effect.flip);
    expect(foreign.reason).toContain("in this thread");

    expect(yield* service.close({ threadId: "t1" })).toEqual([second.session.sessionId]);
    expect((yield* service.sessions()).map((s) => s.sessionId)).toEqual([third.session.sessionId]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("a deep data folder still opens sessions, with sockets in a short folder", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { service, roots } = yield* fixture(undefined, 0, "a".repeat(40) + "/" + "b".repeat(40));
    const { command } = yield* service.open({ threadId: "t1" }).pipe(withRoots(roots));
    const launcher = yield* fs.readFileString(
      command.replace(/agent-browser$/, "agent-browser-launcher.mjs"),
    );
    const socketDir = /"AGENT_BROWSER_SOCKET_DIR":"([^"]+)"/.exec(launcher)?.[1];
    expect(socketDir).toMatch(/^\/tmp\/hive-browser-use-[0-9a-f]{8}$/);
    yield* Effect.addFinalizer(() =>
      fs.remove(socketDir!, { recursive: true, force: true }).pipe(Effect.ignore),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("a browser that fails to start leaves no session or files behind", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { service, calls, roots } = yield* fixture(undefined, 1);
    const error = yield* service.open({ threadId: "t1" }).pipe(withRoots(roots), Effect.flip);
    expect(error.reason).toContain("could not be started");
    const command = calls[0]!.command;
    expect(calls.map((call) => call.args[0])).toEqual(["open", "close"]);
    expect(yield* fs.exists(command)).toBe(false);
    expect(yield* service.sessions()).toEqual([]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("stopping the server closes every open session", () =>
  Effect.gen(function* () {
    const { service, calls, roots, scope } = yield* fixture();
    const a = yield* service.open({ threadId: "t1" }).pipe(withRoots(roots));
    const b = yield* service.open({ threadId: "t2" }).pipe(withRoots(roots));
    yield* Scope.close(scope, Exit.void);
    expect(sessionArgs(calls, a.command)).toEqual(["open", "close"]);
    expect(sessionArgs(calls, b.command)).toEqual(["open", "close"]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("limits how many sessions can be open at once", () =>
  Effect.gen(function* () {
    const { service, roots } = yield* fixture();
    yield* Effect.forEach(
      Array.from({ length: BrowserUseService.MAX_BROWSER_USE_SESSIONS }, (_, index) => `t${index}`),
      (threadId) => service.open({ threadId }),
    ).pipe(withRoots(roots));
    const error = yield* service.open({ threadId: "extra" }).pipe(withRoots(roots), Effect.flip);
    expect(error.reason).toContain("already open");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.live("the session launcher refuses flags that would leave Hive's session", () =>
  Effect.gen(function* () {
    const { service, roots } = yield* fixture();
    const { command } = yield* service.open({ threadId: "t1" }).pipe(withRoots(roots));
    const runner = yield* ProcessRunner.ProcessRunner.pipe(Effect.provide(ProcessRunner.layer));
    const runLauncher = (args: ReadonlyArray<string>) =>
      runner
        .run({ command, args })
        .pipe(Effect.map((output) => ({ code: output.code, stderr: output.stderr })));
    for (const args of [
      ["--cdp", "9222", "snapshot"],
      ["--auto-connect", "open", "https://example.com"],
      ["--profile=/somewhere", "open", "https://example.com"],
      ["close", "--all"],
      ["connect", "9222"],
    ]) {
      const refused = yield* runLauncher(args);
      expect(refused.code).toBe(2);
      expect(refused.stderr).toContain("Hive runs this browser session for you");
    }
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
