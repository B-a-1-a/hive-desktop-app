import type { KeybindingCommand } from "@t3tools/contracts";

// Hive hides software-development tools until developer mode is on. Every list of what counts as
// a developer tool lives here, so upstream files carry only a one-line filter.

const DEVELOPER_SETTINGS_PATHS: ReadonlySet<string> = new Set([
  "/settings/diffs",
  "/settings/devices",
  "/settings/source-control",
  "/settings/worktrees",
]);

const DEVELOPER_THREAD_DETAILS_ITEMS: ReadonlySet<string> = new Set([
  "openIn",
  "scripts",
  "branch",
  "gitActions",
  "servers",
]);

const DEVELOPER_PANEL_SURFACES: ReadonlySet<string> = new Set([
  "Terminal",
  "Pull request",
  "Linked pull requests",
  "Device",
]);

const DEVELOPER_PALETTE_ACTIONS: ReadonlySet<string> = new Set([
  "action:triage",
  "action:link-pull-request",
  "action:open-thread-pull-requests",
  "action:pull-requests",
  "action:add-project:wsl-folder",
]);

const DEVELOPER_COMMAND_PREFIXES = ["terminal.", "pullRequest.", "editor."] as const;
const DEVELOPER_COMMANDS: ReadonlySet<string> = new Set([
  "composer.branch",
  "composer.previousWorktree",
  "composer.stash",
]);

export function isDeveloperSettingsPath(pathname: string) {
  return DEVELOPER_SETTINGS_PATHS.has(pathname);
}

export function isDeveloperThreadDetailsItem(id: string) {
  return DEVELOPER_THREAD_DETAILS_ITEMS.has(id);
}

export function isDeveloperPanelSurface(label: string) {
  return DEVELOPER_PANEL_SURFACES.has(label);
}

export function isDeveloperPaletteAction(value: string) {
  return DEVELOPER_PALETTE_ACTIONS.has(value);
}

export function isDeveloperCommand(command: KeybindingCommand) {
  return (
    DEVELOPER_COMMANDS.has(command) ||
    DEVELOPER_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix))
  );
}
