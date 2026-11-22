import { Navigate } from "@tanstack/react-router";
import type { ComponentType } from "react";

import {
  getClientSettings,
  useClientSettings,
  useClientSettingsHydrated,
} from "../hooks/useSettings";
import { setHiddenShortcutCommands } from "../keybindings";
import { isDeveloperCommand, isDeveloperSettingId } from "./developerMode.logic";

export function useDeveloperMode() {
  return useClientSettings((settings) => settings.developerModeEnabled);
}

/** True for a settings row or section that developer mode currently hides. */
export function useDeveloperSettingHidden(id: string | undefined) {
  return !useDeveloperMode() && id !== undefined && isDeveloperSettingId(id);
}

/** Shortcuts resolve outside React, so they read the setting at key press time. */
export function startDeveloperModeShortcutGate() {
  setHiddenShortcutCommands(
    (command) => !getClientSettings().developerModeEnabled && isDeveloperCommand(command),
  );
}

/** Wraps a page that only developers use: with developer mode off it sends people home. */
export function developerOnlyRoute(Page: ComponentType) {
  return function DeveloperOnlyRoute() {
    const developerMode = useDeveloperMode();
    const settingsHydrated = useClientSettingsHydrated();
    if (settingsHydrated && !developerMode) return <Navigate to="/" replace />;
    return <Page />;
  };
}
