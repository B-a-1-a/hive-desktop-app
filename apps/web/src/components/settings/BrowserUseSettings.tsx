import { useAtomValue } from "@effect/atom-react";
import type { BrowserUseStatus, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { browserUseCloseSession, browserUseConfigure, browserUseStatus } from "~/state/browserUse";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";

export function BrowserUseSettings() {
  const { environment } = useSettingsScope();
  const environmentId =
    environment?.connection.phase === "connected" ? environment.environmentId : null;
  const query = useEnvironmentQuery(
    environmentId === null ? null : browserUseStatus({ environmentId, input: {} }),
  );
  if (environmentId === null) {
    return <SettingsRow title="Browser use" description="Connect to an environment first." />;
  }
  if (query.data === null) {
    return (
      <SettingsRow
        title="Browser use"
        description={query.error ?? "Looking for browsers on this computer…"}
      />
    );
  }
  return (
    <BrowserUseControls environmentId={environmentId} status={query.data} refresh={query.refresh} />
  );
}

function BrowserUseControls({
  environmentId,
  status,
  refresh,
}: {
  readonly environmentId: EnvironmentId;
  readonly status: BrowserUseStatus;
  readonly refresh: () => void;
}) {
  const canConfigure = useAtomValue(browserUseConfigure.permissionAtom(environmentId));
  const canClose = useAtomValue(browserUseCloseSession.permissionAtom(environmentId));
  const configure = useAtomCommand(browserUseConfigure);
  const closeSession = useAtomCommand(browserUseCloseSession);
  const [pending, setPending] = useState<"enable" | "browser" | string | null>(null);

  const run = async (kind: string, action: () => Promise<unknown>) => {
    setPending(kind);
    await action();
    setPending(null);
    refresh();
  };

  const supported = status.browsers.filter((browser) => browser.supported);
  const selected = status.browsers.find((browser) => browser.id === status.selectedBrowserId);

  return (
    <>
      <SettingsRow
        {...searchableSetting("browser-use")}
        description={`Agents open their own window of a browser on this computer and use websites for you while you watch. Turning this on downloads agent-browser ${status.tool.requiredVersion}, the open-source tool that drives it.`}
        status={
          pending === "enable"
            ? status.tool.installed
              ? "Turning on…"
              : "Downloading agent-browser…"
            : status.platformSupported
              ? undefined
              : "Hive cannot look for browsers on this operating system yet."
        }
        control={
          <Switch
            aria-label="Let agents use a browser on this computer"
            checked={status.enabled}
            disabled={!canConfigure || pending !== null || !status.platformSupported}
            onCheckedChange={(enabled) =>
              void run("enable", () => configure({ environmentId, input: { enabled } }))
            }
          />
        }
      />
      <SettingsRow
        {...searchableSetting("browser-use-browser")}
        description={
          status.browsers.length === 0
            ? "No browsers were found on this computer. Install Google Chrome, Microsoft Edge, or Brave, then come back."
            : supported.length === 0
              ? "None of the browsers found here can be used yet. Browser use needs Chrome, Edge, Brave, Arc, Chromium, or Vivaldi."
              : "Agents open a separate window with a fresh profile, so they are not signed in to your accounts."
        }
        control={
          <Select
            value={status.selectedBrowserId ?? ""}
            disabled={!canConfigure || pending !== null || supported.length === 0}
            onValueChange={(browserId) => {
              if (typeof browserId !== "string" || browserId === status.selectedBrowserId) return;
              void run("browser", () => configure({ environmentId, input: { browserId } }));
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-48" aria-label="Browser agents use">
              <SelectValue>{selected?.name ?? "Choose a browser"}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {status.browsers.map((browser) => (
                <SelectItem
                  hideIndicator
                  key={browser.id}
                  value={browser.id}
                  disabled={!browser.supported}
                >
                  {browser.supported ? browser.name : `${browser.name} (not supported yet)`}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      {status.sessions.map((session) => (
        <SettingsRow
          key={session.sessionId}
          title={`${session.browserName} window opened by an agent`}
          description={`Opened ${new Date(session.openedAt).toLocaleTimeString()}.`}
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={!canClose || pending !== null}
              onClick={() =>
                void run(session.sessionId, () =>
                  closeSession({ environmentId, input: { sessionId: session.sessionId } }),
                )
              }
            >
              Close window
            </Button>
          }
        />
      ))}
    </>
  );
}
