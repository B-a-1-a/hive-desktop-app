import { getClientSettings, useClientSettings } from "../hooks/useSettings";
import { setHiddenShortcutCommands } from "../keybindings";
import { isDeveloperCommand } from "./developerMode.logic";

export function useDeveloperMode() {
  return useClientSettings((settings) => settings.developerModeEnabled);
}

/** Shortcuts resolve outside React, so they read the setting at key press time. */
export function startDeveloperModeShortcutGate() {
  setHiddenShortcutCommands(
    (command) => !getClientSettings().developerModeEnabled && isDeveloperCommand(command),
  );
}
