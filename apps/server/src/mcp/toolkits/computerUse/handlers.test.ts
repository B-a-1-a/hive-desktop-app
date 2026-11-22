import { describe, expect, it } from "@effect/vitest";

import { computerUseQuickStart } from "./handlers.ts";

const commandLines = (text: string) => text.split("\n").filter((line) => line.startsWith("  "));

describe("computerUseQuickStart", () => {
  it("gives PowerShell commands with quoted refs on Windows", () => {
    const text = computerUseQuickStart(
      { app: "Notepad.exe" },
      String.raw`C:\Users\O'Neil\.hive\computer-use\bin\run-1\agent-desktop.cmd`,
      "win32",
    );
    const launcher = String.raw`& 'C:\Users\O''Neil\.hive\computer-use\bin\run-1\agent-desktop.cmd'`;
    expect(commandLines(text)).toEqual([
      `  ${launcher} snapshot --app "Notepad.exe" -i --compact  # accessibility tree with refs`,
      `  ${launcher} click '@s8f3k2p9:e8'  # a ref from the latest snapshot`,
      `  ${launcher} set-value '@s8f3k2p9:e5' "text"  # replaces the field's text`,
    ]);
    expect(text).toContain("need `--headed` before the command");
  });

  it("keeps POSIX commands on macOS and Linux", () => {
    const text = computerUseQuickStart(
      { app: "Notes", windowId: "w-2" },
      "/Users/o'neil/.hive/computer-use/bin/run-1/agent-desktop",
      "darwin",
    );
    const launcher = `'/Users/o'"'"'neil/.hive/computer-use/bin/run-1/agent-desktop'`;
    expect(commandLines(text)).toEqual([
      `  ${launcher} snapshot --window-id w-2 -i --compact  # accessibility tree with refs`,
      `  ${launcher} click @s8f3k2p9:e8  # a ref from the latest snapshot`,
      `  ${launcher} type @s8f3k2p9:e5 "text"`,
    ]);
    expect(text).not.toContain("--headed");
  });
});
