import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  type ComputerUsePermissionState,
  type ComputerUseState,
  type EnvironmentId,
} from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { useState } from "react";

import {
  computerUseCloseSession,
  computerUseConfigure,
  computerUseState,
} from "~/state/computerUse";
import { formatEnvironmentQueryError, useEnvironmentQuery } from "~/state/query";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";

const PERMISSION_LABELS: Record<
  ComputerUsePermissionState,
  { readonly label: string; readonly variant: "success" | "error" | "outline" }
> = {
  granted: { label: "Allowed", variant: "success" },
  denied: { label: "Not allowed", variant: "error" },
  not_required: { label: "Not needed", variant: "outline" },
  unknown: { label: "Unknown", variant: "outline" },
};

const PERMISSION_HELP: Record<
  "darwin" | "win32" | "other",
  { readonly accessibility: string; readonly screenRecording: string }
> = {
  darwin: {
    accessibility:
      "Required. Lets Hive read and operate other apps. Turn on Hive in System Settings > Privacy & Security > Accessibility.",
    screenRecording:
      "Only for screenshots of an app. Turn on Hive in System Settings > Privacy & Security > Screen Recording.",
  },
  win32: {
    accessibility:
      "Lets Hive read and operate other apps. Windows allows this by default; it is only blocked when Hive runs inside a restricted sandbox.",
    screenRecording: "Not needed on Windows.",
  },
  other: {
    accessibility:
      "Required. Lets Hive read and operate other apps through the desktop's accessibility service.",
    screenRecording: "Only for screenshots of an app.",
  },
};

const permissionHelp = (os: string | undefined) =>
  PERMISSION_HELP[os === "darwin" || os === "win32" ? os : "other"];

function PermissionBadge({ state }: { readonly state: ComputerUsePermissionState | null }) {
  const view =
    state === null
      ? { label: "Not checked", variant: "outline" as const }
      : PERMISSION_LABELS[state];
  return <Badge variant={view.variant}>{view.label}</Badge>;
}

export function ComputerUseSettingsPanel() {
  const { environment: selected } = useSettingsScope();
  const connected = selected?.connection.phase === "connected" && selected.serverConfig !== null;
  const environmentId = connected ? selected.environmentId : null;
  return (
    <SettingsPageContainer>
      <ComputerUseSettings key={environmentId ?? "none"} environmentId={environmentId} />
    </SettingsPageContainer>
  );
}

function ComputerUseSettings({ environmentId }: { readonly environmentId: EnvironmentId | null }) {
  const query = useEnvironmentQuery(
    environmentId === null ? null : computerUseState({ environmentId, input: {} }),
  );
  const canConfigure = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const canStop = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const configure = useAtomCommand(computerUseConfigure, { reportFailure: false });
  const closeSession = useAtomCommand(computerUseCloseSession, { reportFailure: false });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state: ComputerUseState | null = query.data;

  const run = async (key: string, action: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setPending(key);
    setError(null);
    const result = await action();
    if (result._tag === "Failure") setError(formatEnvironmentQueryError(result.cause));
    setPending(null);
    query.refresh();
  };

  const supported = state?.platform.supported ?? false;
  const permissions = state?.permissions ?? null;

  return (
    <>
      <SettingsSection id="computer-use" title="Computer use">
        <SettingsRow
          {...searchableSetting("computer-use")}
          serverScoped
          settingKeys={["enableComputerUse"]}
          description={
            state !== null && !supported
              ? (state.platform.detail ?? "Computer use is not available on this computer.")
              : `Agents can see and operate the apps open on the computer Hive runs on. You see a cursor for each thing they do. Turning this on downloads the agent-desktop tool (version ${state?.tool.requiredVersion ?? "…"}).`
          }
          control={
            <Switch
              checked={state?.enabled ?? false}
              disabled={!environmentId || !canConfigure || !supported || pending !== null}
              aria-label="Let agents use apps on this computer"
              onCheckedChange={(checked) =>
                environmentId &&
                void run("configure", () =>
                  configure({ environmentId, input: { enabled: Boolean(checked) } }),
                )
              }
            />
          }
        />
        {(error ?? query.error) ? (
          <p role="alert" className="px-3 text-xs text-destructive sm:px-4">
            {error ?? query.error}
          </p>
        ) : null}
      </SettingsSection>
      {supported ? (
        <SettingsSection
          id="computer-use-permissions"
          title="Permissions"
          headerAction={
            <Button
              size="sm"
              variant="outline"
              disabled={!environmentId || query.isPending}
              onClick={() => query.refresh()}
            >
              {query.isPending ? "Checking…" : "Check again"}
            </Button>
          }
        >
          <SettingsRow
            title="Accessibility"
            description={permissionHelp(state?.platform.os).accessibility}
            control={<PermissionBadge state={permissions?.accessibility ?? null} />}
          />
          <SettingsRow
            title="Screen Recording"
            description={permissionHelp(state?.platform.os).screenRecording}
            control={<PermissionBadge state={permissions?.screenRecording ?? null} />}
          />
          {state?.permissionsDetail ? (
            <p className="px-3 text-xs text-muted-foreground sm:px-4">{state.permissionsDetail}</p>
          ) : null}
        </SettingsSection>
      ) : null}
      {state?.enabled ? (
        <SettingsSection
          id="computer-use-sessions"
          title="Apps in use"
          headerAction={
            <Button
              size="sm"
              variant="outline"
              disabled={!environmentId || query.isPending}
              onClick={() => query.refresh()}
            >
              Refresh
            </Button>
          }
        >
          {state.sessions.length === 0 ? (
            <SettingsRow title="No agent is using an app right now." />
          ) : (
            state.sessions.map((session) => (
              <SettingsRow
                key={session.id}
                title={session.target.app}
                description={
                  session.recentActions.length === 0
                    ? "No actions yet."
                    : `Recent: ${session.recentActions
                        .slice(-5)
                        .map((action) =>
                          action.ok === false
                            ? `${action.command} (failed)`
                            : action.ok === null
                              ? `${action.command} (running)`
                              : action.command,
                        )
                        .join(", ")}`
                }
                control={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!environmentId || !canStop || pending !== null}
                    onClick={() =>
                      environmentId &&
                      void run(session.id, () =>
                        closeSession({ environmentId, input: { sessionId: session.id } }),
                      )
                    }
                  >
                    {pending === session.id ? "Stopping…" : "Stop"}
                  </Button>
                }
              />
            ))
          )}
        </SettingsSection>
      ) : null}
    </>
  );
}
