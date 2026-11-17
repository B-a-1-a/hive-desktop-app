import {
  ComputerUseError,
  ComputerUseSession,
  ComputerUseToolCloseInput,
  ComputerUseToolListInput,
  ComputerUseToolListResult,
  ComputerUseToolOpenInput,
  ComputerUseToolOpenResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ComputerUseService from "../../../computerUse/ComputerUseService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  ComputerUseService.ComputerUseService,
];

const ComputerUseToolFailure = Schema.Union([ComputerUseError, OrchestratorMcpFailure]);

const ComputerListTool = Tool.make("computer_list", {
  description:
    "List the apps and windows open on the user's computer and this thread's computer-use sessions. Call before `computer_open`.",
  parameters: ComputerUseToolListInput,
  success: ComputerUseToolListResult,
  failure: ComputerUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "List apps")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ComputerOpenTool = Tool.make("computer_open", {
  description:
    "Start a computer-use session on one app on the user's computer. The user sees a cursor for each action. Returns an `agent-desktop` CLI command bound to the session; read the app and act through it.",
  parameters: ComputerUseToolOpenInput,
  success: ComputerUseToolOpenResult,
  failure: ComputerUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Open app session")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

const ComputerCloseTool = Tool.make("computer_close", {
  description: "End a computer-use session. Its command stops working.",
  parameters: ComputerUseToolCloseInput,
  success: Schema.Struct({ closed: Schema.Array(ComputerUseSession) }),
  failure: ComputerUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Close app session")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const ComputerUseToolkit = Toolkit.make(
  ComputerListTool,
  ComputerOpenTool,
  ComputerCloseTool,
);
