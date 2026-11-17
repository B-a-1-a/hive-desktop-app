import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

/** Read on open and on Refresh; agent-desktop runs a permission check per read. */
export const computerUseState = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:computer-use:state",
  tag: WS_METHODS.computerUseGetState,
  staleTimeMs: 0,
  idleTtlMs: 0,
});

export const computerUseConfigure = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:computer-use:configure",
  tag: WS_METHODS.computerUseConfigure,
});

export const computerUseCloseSession = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:computer-use:close-session",
  tag: WS_METHODS.computerUseCloseSession,
});
