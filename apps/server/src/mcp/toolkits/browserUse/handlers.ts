import * as Effect from "effect/Effect";

import * as BrowserUseService from "../../../browserUse/BrowserUseService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { BrowserUseToolkit } from "./tools.ts";

const threadId = McpInvocationContext.McpInvocationContext.pipe(
  Effect.flatMap((scope) => McpInvocationContext.requireThreadScope(scope, "Browser use")),
  Effect.map((scope) => scope.thread.threadId),
);

/** How to drive a session, returned from browser_use_open so it matches the pinned CLI. */
function browserUseQuickStart(input: {
  readonly browserName: string;
  readonly sessionId: string;
  readonly command: string;
}): string {
  const run = (args: string) => `  '${input.command.replaceAll("'", "'\"'\"'")}' ${args}`;
  return [
    `The user is watching this ${input.browserName} window. A cursor shows where you click and type.`,
    "Drive it only with this command. Use the exact path; it is bound to this window and needs no --session, --profile, or --executable-path flags.",
    run("open <url>"),
    run("snapshot -i  # interactive elements with @eN refs"),
    run("click @e2"),
    run('fill @e3 "text"'),
    run("press Enter"),
    run("get url"),
    run("screenshot /tmp/page.png"),
    "Take a new snapshot after the page changes before reusing refs. Run the command with --help for everything else.",
    "The profile is fresh, so the user is not signed in to any site in this window.",
    `When you are done, call browser_use_close with sessionId ${input.sessionId}; it closes the window.`,
  ].join("\n");
}

const handlers = {
  browser_use_list: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const service = yield* BrowserUseService.BrowserUseService;
      const thread = yield* threadId;
      const status = yield* service.status;
      return {
        enabled: status.enabled,
        browsers: status.browsers,
        selectedBrowserId: status.selectedBrowserId,
        open:
          input?.threadOnly === false
            ? status.sessions
            : status.sessions.filter((session) => session.threadId === thread),
      };
    }),
  ),
  browser_use_open: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const service = yield* BrowserUseService.BrowserUseService;
      const opened = yield* service.open({ threadId: yield* threadId, url: input.url });
      return {
        session: opened.session,
        command: opened.command,
        quickStart: browserUseQuickStart({
          browserName: opened.session.browserName,
          sessionId: opened.session.sessionId,
          command: opened.command,
        }),
      };
    }),
  ),
  browser_use_close: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const service = yield* BrowserUseService.BrowserUseService;
      const closed = yield* service.close({
        threadId: yield* threadId,
        sessionId: input.sessionId,
      });
      return { closed };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof BrowserUseToolkit.tools>;

export const layer = McpToolAccess.toLayer(BrowserUseToolkit, handlers);
