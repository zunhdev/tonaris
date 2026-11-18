// Picking an invitation's role in the sharing dialog (DS-65, FR-07.18): Can view or Can edit, for the invite field and
// each person's row.

import type { ShareRole } from "@tonaris/domain";
import { Select } from "@tonaris/ui/components/select";

/** The roles an invitation gives (FR-07.18), as the dialog names them. */
export const roleNames: Record<ShareRole, string> = { view: "Can view", edit: "Can edit" };

/** Pick a role (FR-07.18): Can view or Can edit. */
export function RolePicker({
  role,
  label,
  disabled,
  onChange,
}: {
  role: ShareRole;
  label: string;
  disabled: boolean;
  onChange: (role: ShareRole) => void;
}) {
  return (
    <Select
      aria-label={label}
      value={role}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === "edit" ? "edit" : "view")}
      className="shrink-0"
    >
      <option value="view">{roleNames.view}</option>
      <option value="edit">{roleNames.edit}</option>
    </Select>
  );
}
