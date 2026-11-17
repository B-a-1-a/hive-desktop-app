import {
  BrowserUseError,
  BrowserUseToolCloseInput,
  BrowserUseToolListResult,
  BrowserUseToolOpenInput,
  BrowserUseToolOpenResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as BrowserUseService from "../../../browserUse/BrowserUseService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
  BrowserUseService.BrowserUseService,
];

const BrowserUseToolFailure = Schema.Union([BrowserUseError, OrchestratorMcpFailure]);

const BrowserUseListTool = Tool.make("browser_use_list", {
  description:
    "List the browsers on the user's computer that Browser use can drive, the one the user chose, and this thread's open browser sessions.",
  // An empty struct serializes as `anyOf [object, array]`, which some providers reject.
  parameters: Schema.Struct({
    threadOnly: Schema.optional(
      Schema.Boolean.annotate({ description: "Only this thread's sessions. Default: true." }),
    ),
  }),
  success: BrowserUseToolListResult,
  failure: BrowserUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "List browsers")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const BrowserUseOpenTool = Tool.make("browser_use_open", {
  description:
    "Open a new window of the user's chosen browser, with a fresh profile, that the user watches while you work. Returns an `agent-browser` CLI command bound to that window; drive the page with it. Each call opens a separate session.",
  parameters: BrowserUseToolOpenInput,
  success: BrowserUseToolOpenResult,
  failure: BrowserUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Open browser")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true);

const BrowserUseCloseTool = Tool.make("browser_use_close", {
  description:
    "Close a browser session from browser_use_open and its window. Without sessionId, closes every browser session in this thread.",
  parameters: BrowserUseToolCloseInput,
  success: Schema.Struct({ closed: Schema.Array(Schema.String) }),
  failure: BrowserUseToolFailure,
  dependencies,
})
  .annotate(Tool.Title, "Close browser")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

export const BrowserUseToolkit = Toolkit.make(
  BrowserUseListTool,
  BrowserUseOpenTool,
  BrowserUseCloseTool,
);
