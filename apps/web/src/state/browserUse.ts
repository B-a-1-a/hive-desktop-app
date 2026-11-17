import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const browserUseStatus = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:browser-use:status",
  tag: WS_METHODS.browserUseStatus,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const browserUseConfigure = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:browser-use:configure",
  tag: WS_METHODS.browserUseConfigure,
});

export const browserUseCloseSession = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:browser-use:close-session",
  tag: WS_METHODS.browserUseCloseSession,
});
