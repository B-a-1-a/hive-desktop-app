import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it } from "vite-plus/test";

import { resolveShortcutCommand, setHiddenShortcutCommands } from "../keybindings";
import { isDeveloperCommand } from "./developerMode.logic";

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
