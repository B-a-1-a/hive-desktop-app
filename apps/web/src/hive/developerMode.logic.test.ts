import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import { resolveShortcutCommand, setHiddenShortcutCommands } from "../keybindings";
import {
  isDeveloperAuthScope,
  isDeveloperCommand,
  isDeveloperSettingId,
} from "./developerMode.logic";

const options = { platform: "MacIntel", context: { isDesktop: true } } as const;
const press = (key: string) => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
});

describe("developer mode shortcuts", () => {
  it("skips developer shortcuts while they are hidden and leaves the rest alone", () => {
    expect(resolveShortcutCommand(press("j"), DEFAULT_RESOLVED_KEYBINDINGS, options)).toBe(
      "terminal.toggle",
    );
    setHiddenShortcutCommands(isDeveloperCommand);
    try {
      expect(resolveShortcutCommand(press("j"), DEFAULT_RESOLVED_KEYBINDINGS, options)).toBeNull();
      expect(resolveShortcutCommand(press("k"), DEFAULT_RESOLVED_KEYBINDINGS, options)).toBe(
        "commandPalette.toggle",
      );
    } finally {
      setHiddenShortcutCommands(null);
    }
  });
});

describe("developer mode settings rows", () => {
  it.each([
    ["new-threads", true],
    ["keybinding-terminal.toggle", true],
    ["keybinding-sidebar.toggle", false],
    ["provider-instance-codex-runtime", true],
    ["provider-instance-codex-models", false],
    ["default-permissions", false],
  ])("treats %s as a developer setting: %s", (id, expected) => {
    expect(isDeveloperSettingId(id)).toBe(expected);
  });

  it("keeps terminal and source control out of pairing links, and leaves task access", () => {
    expect(
      ["terminal:read", "terminal:operate", "source-control:write"].every(isDeveloperAuthScope),
    ).toBe(true);
    expect(
      ["orchestration:read", "orchestration:operate", "filesystem:read"].some(isDeveloperAuthScope),
    ).toBe(false);
  });
});
