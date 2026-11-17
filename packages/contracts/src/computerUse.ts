import * as Schema from "effect/Schema";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** agent-desktop's own permission vocabulary, kept as is. */
export const ComputerUsePermissionState = Schema.Literals([
  "granted",
  "denied",
  "not_required",
  "unknown",
]);
export type ComputerUsePermissionState = typeof ComputerUsePermissionState.Type;

export const ComputerUsePermissions = Schema.Struct({
  accessibility: ComputerUsePermissionState,
  screenRecording: ComputerUsePermissionState,
  automation: ComputerUsePermissionState,
});
export type ComputerUsePermissions = typeof ComputerUsePermissions.Type;

export const ComputerUseTarget = Schema.Struct({
  app: Schema.String,
  windowId: Schema.optional(Schema.String),
});
export type ComputerUseTarget = typeof ComputerUseTarget.Type;

export const ComputerUseAction = Schema.Struct({
  command: Schema.String,
  /** Null while the command is still running. */
  ok: Schema.NullOr(Schema.Boolean),
  at: Schema.Number,
});
export type ComputerUseAction = typeof ComputerUseAction.Type;

export const ComputerUseSession = Schema.Struct({
  /** agent-desktop's session id; Hive uses it as its own. */
  id: Schema.String,
  threadId: Schema.NullOr(ThreadId),
  target: ComputerUseTarget,
  openedAt: Schema.Number,
});
export type ComputerUseSession = typeof ComputerUseSession.Type;

export const ComputerUseSessionView = Schema.Struct({
  ...ComputerUseSession.fields,
  recentActions: Schema.Array(ComputerUseAction),
});
export type ComputerUseSessionView = typeof ComputerUseSessionView.Type;

export const ComputerUseState = Schema.Struct({
  enabled: Schema.Boolean,
  platform: Schema.Struct({
    os: Schema.String,
    supported: Schema.Boolean,
    detail: Schema.NullOr(Schema.String),
  }),
  tool: Schema.Struct({
    requiredVersion: Schema.String,
    installed: Schema.Boolean,
  }),
  /** Null until the tool is installed and asked; agent-desktop is what checks them. */
  permissions: Schema.NullOr(ComputerUsePermissions),
  permissionsDetail: Schema.NullOr(Schema.String),
  sessions: Schema.Array(ComputerUseSessionView),
});
export type ComputerUseState = typeof ComputerUseState.Type;

export const ComputerUseConfigureInput = Schema.Struct({
  enabled: Schema.Boolean,
});
export type ComputerUseConfigureInput = typeof ComputerUseConfigureInput.Type;

export const ComputerUseCloseSessionInput = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
});
export type ComputerUseCloseSessionInput = typeof ComputerUseCloseSessionInput.Type;

export const ComputerUseErrorCode = Schema.Literals([
  "disabled",
  "unsupported_platform",
  "permission_missing",
  "install_failed",
  "not_found",
  "tool_failed",
]);
export type ComputerUseErrorCode = typeof ComputerUseErrorCode.Type;

export class ComputerUseError extends Schema.TaggedError<ComputerUseError>()("ComputerUseError", {
  code: ComputerUseErrorCode,
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return this.reason;
  }
}

export const ComputerUseApp = Schema.Struct({
  name: Schema.String,
  pid: Schema.Number,
  bundleId: Schema.optional(Schema.String),
});
export type ComputerUseApp = typeof ComputerUseApp.Type;

export const ComputerUseWindow = Schema.Struct({
  id: Schema.String,
  app: Schema.String,
  title: Schema.String,
  focused: Schema.Boolean,
});
export type ComputerUseWindow = typeof ComputerUseWindow.Type;

export const ComputerUseToolListInput = Schema.Struct({
  app: Schema.optional(
    Schema.String.annotate({ description: "Only this app's windows. Default: all apps." }),
  ),
});
export type ComputerUseToolListInput = typeof ComputerUseToolListInput.Type;

export const ComputerUseToolListResult = Schema.Struct({
  apps: Schema.Array(ComputerUseApp),
  windows: Schema.Array(ComputerUseWindow),
  open: Schema.Array(ComputerUseSession),
});
export type ComputerUseToolListResult = typeof ComputerUseToolListResult.Type;

export const ComputerUseToolOpenInput = Schema.Struct({
  app: TrimmedNonEmptyString.annotate({ description: "App name from `computer_list`." }),
  windowId: Schema.optional(
    Schema.String.annotate({ description: "Window id from `computer_list`, for one window." }),
  ),
});
export type ComputerUseToolOpenInput = typeof ComputerUseToolOpenInput.Type;

export const ComputerUseToolOpenResult = Schema.Struct({
  session: ComputerUseSession,
  command: Schema.String,
  quickStart: Schema.String,
});
export type ComputerUseToolOpenResult = typeof ComputerUseToolOpenResult.Type;

export const ComputerUseToolCloseInput = Schema.Struct({
  sessionId: Schema.optional(
    Schema.String.annotate({ description: "Session to close. None: close all of this thread's." }),
  ),
});
export type ComputerUseToolCloseInput = typeof ComputerUseToolCloseInput.Type;
