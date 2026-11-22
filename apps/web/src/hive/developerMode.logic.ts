import {
  AuthSourceControlWriteScope,
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
  type KeybindingCommand,
} from "@t3tools/contracts";

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
  "composer.workspace",
]);

// Ids of single rows and sections on settings pages that otherwise stay visible.
const DEVELOPER_SETTING_IDS: ReadonlySet<string> = new Set([
  "new-threads",
  "auto-settle-merged-threads",
  "keep-threads-with-pull-requests",
  "ghq-clone-layout",
  "code-font",
  "terminal-font",
  "separate-fonts",
  "pull-request-routing",
  "composer-context",
  "simlock-hosts",
  "worktree-fast-checkout",
  "project-actions",
  "wsl-backend",
]);
const KEYBINDING_SETTING_PREFIX = "keybinding-";
const PROVIDER_RUNTIME_SETTING = /^provider-instance-.+-runtime$/;

const DEVELOPER_AUTH_SCOPES: ReadonlySet<string> = new Set([
  AuthTerminalReadScope,
  AuthTerminalOperateScope,
  AuthSourceControlWriteScope,
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

export function isDeveloperSettingId(id: string) {
  return (
    DEVELOPER_SETTING_IDS.has(id) ||
    PROVIDER_RUNTIME_SETTING.test(id) ||
    (id.startsWith(KEYBINDING_SETTING_PREFIX) &&
      isDeveloperCommand(id.slice(KEYBINDING_SETTING_PREFIX.length) as KeybindingCommand))
  );
}

export function isDeveloperAuthScope(scope: string) {
  return DEVELOPER_AUTH_SCOPES.has(scope);
}

export function isDeveloperCommand(command: KeybindingCommand) {
  return (
    DEVELOPER_COMMANDS.has(command) ||
    DEVELOPER_COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix))
  );
}
