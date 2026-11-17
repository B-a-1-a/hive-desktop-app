import type { BrowserUseBrowser } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const NOT_CHROMIUM =
  "Browser use needs a Chromium-based browser such as Chrome, Edge, or Brave. This browser cannot be driven yet.";

interface KnownBrowser {
  readonly id: string;
  readonly name: string;
  readonly chromium: boolean;
  /** Path of the executable inside a macOS app folder such as /Applications. */
  readonly mac?: string;
  /** Executable names looked up in Linux bin directories, in order. */
  readonly linux?: ReadonlyArray<string>;
  /** Path below Program Files or the user's AppData\Local. */
  readonly windows?: string;
}

// Order is the order Settings lists them in.
const KNOWN_BROWSERS: ReadonlyArray<KnownBrowser> = [
  {
    id: "chrome",
    name: "Google Chrome",
    chromium: true,
    mac: "Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: ["google-chrome", "google-chrome-stable"],
    windows: "Google/Chrome/Application/chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    chromium: true,
    mac: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    linux: ["microsoft-edge", "microsoft-edge-stable"],
    windows: "Microsoft/Edge/Application/msedge.exe",
  },
  {
    id: "brave",
    name: "Brave",
    chromium: true,
    mac: "Brave Browser.app/Contents/MacOS/Brave Browser",
    linux: ["brave-browser", "brave"],
    windows: "BraveSoftware/Brave-Browser/Application/brave.exe",
  },
  { id: "arc", name: "Arc", chromium: true, mac: "Arc.app/Contents/MacOS/Arc" },
  {
    id: "chromium",
    name: "Chromium",
    chromium: true,
    mac: "Chromium.app/Contents/MacOS/Chromium",
    linux: ["chromium", "chromium-browser"],
    windows: "Chromium/Application/chrome.exe",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    chromium: true,
    mac: "Vivaldi.app/Contents/MacOS/Vivaldi",
    linux: ["vivaldi", "vivaldi-stable"],
    windows: "Vivaldi/Application/vivaldi.exe",
  },
  {
    id: "firefox",
    name: "Firefox",
    chromium: false,
    mac: "Firefox.app/Contents/MacOS/firefox",
    linux: ["firefox"],
    windows: "Mozilla Firefox/firefox.exe",
  },
  { id: "safari", name: "Safari", chromium: false, mac: "Safari.app/Contents/MacOS/Safari" },
];

/** Where to look. Absolute directories; the defaults come from `defaultSearchRoots`. */
export interface BrowserSearchRoots {
  readonly platform: NodeJS.Platform;
  readonly macApplications: ReadonlyArray<string>;
  readonly linuxBin: ReadonlyArray<string>;
  readonly windowsPrograms: ReadonlyArray<string>;
}

export const defaultSearchRoots = (
  platform: NodeJS.Platform,
  homeDir: string,
  env: NodeJS.ProcessEnv,
): BrowserSearchRoots => ({
  platform,
  macApplications: ["/Applications", `${homeDir}/Applications`],
  linuxBin: ["/usr/bin", "/usr/local/bin", "/snap/bin", "/opt/google/chrome"],
  windowsPrograms: [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  ),
});

export const isDetectionSupported = (platform: NodeJS.Platform) =>
  platform === "darwin" || platform === "linux" || platform === "win32";

const candidatePaths = (
  path: Path.Path,
  roots: BrowserSearchRoots,
  browser: KnownBrowser,
): ReadonlyArray<string> => {
  switch (roots.platform) {
    case "darwin":
      return browser.mac ? roots.macApplications.map((dir) => path.join(dir, browser.mac!)) : [];
    case "linux":
      return (browser.linux ?? []).flatMap((name) =>
        roots.linuxBin.map((dir) => path.join(dir, name)),
      );
    case "win32":
      return browser.windows
        ? roots.windowsPrograms.map((dir) => path.join(dir, ...browser.windows!.split("/")))
        : [];
    default:
      return [];
  }
};

/** The browsers installed under `roots`, first match per browser. Never launches anything. */
export const detectBrowsers = Effect.fn("browserUse.detectBrowsers")(function* (
  roots: BrowserSearchRoots,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found: Array<BrowserUseBrowser> = [];
  for (const browser of KNOWN_BROWSERS) {
    for (const candidate of candidatePaths(path, roots, browser)) {
      const exists = yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false));
      if (!exists) continue;
      found.push({
        id: browser.id,
        name: browser.name,
        executablePath: candidate,
        supported: browser.chromium,
        ...(browser.chromium ? {} : { unsupportedReason: NOT_CHROMIUM }),
      });
      break;
    }
  }
  return found;
});
