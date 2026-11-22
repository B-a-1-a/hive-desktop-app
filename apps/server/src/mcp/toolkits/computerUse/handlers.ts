import { ComputerUseError, type ComputerUseTarget } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ComputerUseService from "../../../computerUse/ComputerUseService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { ComputerUseToolkit } from "./tools.ts";

const threadId = McpInvocationContext.McpInvocationContext.pipe(
  Effect.flatMap((scope) => McpInvocationContext.requireThreadScope(scope, "Computer use")),
  Effect.map((scope) => scope.thread.threadId),
);

/** How to drive the session, returned with it so it costs nothing in threads that never open one. */
export function computerUseQuickStart(
  target: ComputerUseTarget,
  command: string,
  os: NodeJS.Platform,
): string {
  const { app } = target;
  const windows = os === "win32";
  // An app with several windows refuses a bare --app snapshot as AMBIGUOUS_TARGET.
  const scope =
    target.windowId === undefined
      ? `--app ${JSON.stringify(app)}`
      : `--window-id ${target.windowId}`;
  // PowerShell runs a quoted path only after `&`, and reads a bare @token as splatting.
  const run = windows
    ? (args: string) => `  & '${command.replaceAll("'", "''")}' ${args}`
    : (args: string) => `  '${command.replaceAll("'", `'"'"'`)}' ${args}`;
  const ref = (id: string) => (windows ? `'@s8f3k2p9:${id}'` : `@s8f3k2p9:${id}`);
  return [
    `The user is watching you work in ${app}. Every action shows on their screen with a cursor.`,
    `Drive it only with this command; it is bound to this session and needs no --session flag. Use the exact path.`,
    run(`snapshot ${scope} -i --compact`) + "  # accessibility tree with refs",
    run(`click ${ref("e8")}`) + "  # a ref from the latest snapshot",
    windows
      ? run(`set-value ${ref("e5")} "text"`) + "  # replaces the field's text"
      : run(`type ${ref("e5")} "text"`),
    ...(windows
      ? [
          "On Windows, `type` and mouse or keyboard actions such as `hover`, `drag` and `press` need `--headed` before the command and use the real mouse and keyboard. Prefer `click` and `set-value`, which run in the background. In Git Bash, leave out the leading `& `.",
        ]
      : []),
    "Take a new snapshot after each action to check it worked. If several windows match, pass --window-id from computer_list. Stay in this app unless the user asks otherwise.",
    "Before your first action, run it with `skills get desktop` and follow that guide. `<command> --help` lists flags.",
    "Ask the user before sending, buying, or deleting anything. Call computer_close when you are done.",
  ].join("\n");
}

const handlers = {
  computer_list: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const thread = yield* threadId;
      const service = yield* ComputerUseService.ComputerUseService;
      const targets = yield* service.listTargets({ app: input.app });
      const open = (yield* service.sessions).filter((session) => session.threadId === thread);
      return { ...targets, open };
    }),
  ),
  computer_open: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const thread = yield* threadId;
      const service = yield* ComputerUseService.ComputerUseService;
      const opened = yield* service.open({
        threadId: thread,
        app: input.app,
        windowId: input.windowId,
      });
      return {
        ...opened,
        quickStart: computerUseQuickStart(opened.session.target, opened.command, service.os),
      };
    }),
  ),
  computer_close: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const thread = yield* threadId;
      const service = yield* ComputerUseService.ComputerUseService;
      const mine = (yield* service.sessions).filter((session) => session.threadId === thread);
      const targets =
        input.sessionId === undefined
          ? mine
          : mine.filter((session) => session.id === input.sessionId);
      if (input.sessionId !== undefined && targets.length === 0) {
        return yield* new ComputerUseError({
          code: "not_found",
          reason: `This thread has no computer-use session ${input.sessionId}.`,
        });
      }
      yield* Effect.forEach(targets, (session) => service.close(session.id), { discard: true });
      return { closed: targets };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof ComputerUseToolkit.tools>;

export const layer = McpToolAccess.toLayer(ComputerUseToolkit, handlers);
