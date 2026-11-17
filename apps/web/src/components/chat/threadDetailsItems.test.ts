import { describe, expect, it } from "vite-plus/test";

import {
  availableThreadDetailsItems,
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  setThreadDetailsItem,
  THREAD_DETAILS_ITEMS,
} from "./threadDetailsItems";

const usage = THREAD_DETAILS_ITEMS.find((item) => item.id === "usage")!;
const servers = THREAD_DETAILS_ITEMS.find((item) => item.id === "servers")!;

describe("thread details items", () => {
  it.each([
    { legacy: false, items: {}, usage: false, context: false },
    { legacy: true, items: {}, usage: true, context: true },
    { legacy: true, items: { usage: false }, usage: false, context: true },
    { legacy: false, items: { usage: true, retired: false }, usage: true, context: false },
  ])("resolves Usage and Context from overrides and the retired Labs flag: %o", (row) => {
    const visibility = resolveThreadDetailsVisibility({
      threadDetailsItems: row.items,
      threadDetailsUsageEnabled: row.legacy,
      developerModeEnabled: true,
    });
    expect(visibility.usage).toBe(row.usage);
    expect(visibility.context).toBe(row.context);
    expect(visibility.servers).toBe(true);
  });

  it("stores only choices that differ from the default", () => {
    const legacyOn = {
      threadDetailsItems: {},
      threadDetailsUsageEnabled: true,
      developerModeEnabled: true,
    };
    expect(setThreadDetailsItem(legacyOn, usage, false)).toEqual({ usage: false });
    expect(setThreadDetailsItem(legacyOn, usage, true)).toEqual({});

    const hidden = {
      threadDetailsItems: { servers: false },
      threadDetailsUsageEnabled: false,
      developerModeEnabled: true,
    };
    expect(setThreadDetailsItem(hidden, servers, true)).toEqual({});
  });

  it("hides developer items until developer mode is on, even when a saved choice shows them", () => {
    const saved = { threadDetailsItems: { openIn: true }, threadDetailsUsageEnabled: false };
    const off = resolveThreadDetailsVisibility({ ...saved, developerModeEnabled: false });
    expect(off).toMatchObject({
      openIn: false,
      scripts: false,
      branch: false,
      gitActions: false,
      servers: false,
      changes: true,
      automations: true,
    });
    expect(
      availableThreadDetailsItems({ developerModeEnabled: false }).map((item) => item.id),
    ).toEqual([
      "environment",
      "changes",
      "automations",
      "lineage",
      "sideChats",
      "usage",
      "context",
    ]);

    // Hidden developer items must not make an untouched card look customized.
    const untouched = { threadDetailsItems: {}, threadDetailsUsageEnabled: false };
    expect(
      isDefaultThreadDetailsVisibility(
        resolveThreadDetailsVisibility({ ...untouched, developerModeEnabled: false }),
        availableThreadDetailsItems({ developerModeEnabled: false }),
      ),
    ).toBe(true);

    const on = resolveThreadDetailsVisibility({ ...saved, developerModeEnabled: true });
    expect(on).toMatchObject({ openIn: true, gitActions: true, servers: true });
    expect(availableThreadDetailsItems({ developerModeEnabled: true })).toHaveLength(
      THREAD_DETAILS_ITEMS.length,
    );
  });
});
