import * as Schema from "effect/Schema";

/** Stable id of a known browser, such as `chrome` or `edge`. */
export const BrowserUseBrowserId = Schema.String.check(Schema.isPattern(/^[a-z0-9-]{1,32}$/));
export type BrowserUseBrowserId = typeof BrowserUseBrowserId.Type;

/** Browser use drives browsers through the Chrome DevTools Protocol, so only Chromium browsers work. */
export const BrowserUseBrowser = Schema.Struct({
  id: BrowserUseBrowserId,
  name: Schema.String,
  executablePath: Schema.String,
  supported: Schema.Boolean,
  unsupportedReason: Schema.optional(Schema.String),
});
export type BrowserUseBrowser = typeof BrowserUseBrowser.Type;

export const BrowserUseSessionSummary = Schema.Struct({
  sessionId: Schema.String,
  threadId: Schema.String,
  browserId: BrowserUseBrowserId,
  browserName: Schema.String,
  openedAt: Schema.String,
});
export type BrowserUseSessionSummary = typeof BrowserUseSessionSummary.Type;

export const BrowserUseStatus = Schema.Struct({
  enabled: Schema.Boolean,
  /** False when Hive cannot look for browsers on this operating system yet. */
  platformSupported: Schema.Boolean,
  browsers: Schema.Array(BrowserUseBrowser),
  selectedBrowserId: Schema.NullOr(BrowserUseBrowserId),
  tool: Schema.Struct({
    requiredVersion: Schema.String,
    installed: Schema.Boolean,
  }),
  sessions: Schema.Array(BrowserUseSessionSummary),
});
export type BrowserUseStatus = typeof BrowserUseStatus.Type;

export const BrowserUseStatusInput = Schema.Struct({});
export type BrowserUseStatusInput = typeof BrowserUseStatusInput.Type;

export const BrowserUseConfigureInput = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  browserId: Schema.optional(Schema.NullOr(BrowserUseBrowserId)),
});
export type BrowserUseConfigureInput = typeof BrowserUseConfigureInput.Type;

export const BrowserUseCloseSessionInput = Schema.Struct({
  sessionId: Schema.String,
});
export type BrowserUseCloseSessionInput = typeof BrowserUseCloseSessionInput.Type;

export class BrowserUseError extends Schema.TaggedError<BrowserUseError>()("BrowserUseError", {
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return this.reason;
  }
}

export const BrowserUseToolListResult = Schema.Struct({
  enabled: Schema.Boolean,
  browsers: Schema.Array(BrowserUseBrowser),
  selectedBrowserId: Schema.NullOr(BrowserUseBrowserId),
  open: Schema.Array(BrowserUseSessionSummary),
});
export type BrowserUseToolListResult = typeof BrowserUseToolListResult.Type;

export const BrowserUseToolOpenInput = Schema.Struct({
  url: Schema.optional(
    Schema.String.annotate({ description: "Page to load first. Default: a blank page." }),
  ),
});
export type BrowserUseToolOpenInput = typeof BrowserUseToolOpenInput.Type;

export const BrowserUseToolOpenResult = Schema.Struct({
  session: BrowserUseSessionSummary,
  command: Schema.String,
  quickStart: Schema.String,
});
export type BrowserUseToolOpenResult = typeof BrowserUseToolOpenResult.Type;

export const BrowserUseToolCloseInput = Schema.Struct({
  sessionId: Schema.optional(
    Schema.String.annotate({
      description: "Session from browser_use_open. Default: every session in this thread.",
    }),
  ),
});
export type BrowserUseToolCloseInput = typeof BrowserUseToolCloseInput.Type;
