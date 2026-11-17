import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import { MenuCheckboxItem, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator } from "../ui/menu";
import {
  availableThreadDetailsItems,
  isDefaultThreadDetailsVisibility,
  resolveThreadDetailsVisibility,
  RESET_THREAD_DETAILS_ITEMS,
  setThreadDetailsItem,
} from "./threadDetailsItems";

/** Menu body that shows and hides thread details items. The card's context menu and Settings share it. */
export function ThreadDetailsItemsMenuItems() {
  const visibility = useClientSettings(resolveThreadDetailsVisibility);
  const developerModeEnabled = useClientSettings((settings) => settings.developerModeEnabled);
  const items = availableThreadDetailsItems({ developerModeEnabled });
  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>Show in thread details</MenuGroupLabel>
        {items.map((item) => (
          <MenuCheckboxItem
            key={item.id}
            checked={visibility[item.id]}
            onCheckedChange={(checked) =>
              updateClientSettings({
                threadDetailsItems: setThreadDetailsItem(getClientSettings(), item, checked),
              })
            }
          >
            {item.label}
          </MenuCheckboxItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem
        disabled={isDefaultThreadDetailsVisibility(visibility, items)}
        onClick={() => updateClientSettings(RESET_THREAD_DETAILS_ITEMS)}
      >
        Reset to default
      </MenuItem>
    </>
  );
}
