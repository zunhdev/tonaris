// Settings → Custom fields (DS-60): the account's fields, each to rename, retype, give options or delete. Set up on
// the desktop (DS-110).

import { CustomFieldsSettings } from "@/features/settings/custom-fields";
import { DesktopOnly } from "@/features/shell/desktop-only";
import { useNarrowScreen } from "@/features/shell/media";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings/settings/custom-fields")({
  staticData: { title: "Custom fields" },
  head: () => ({ meta: [{ title: "Custom fields · Tonaris" }] }),
  component: CustomFields,
});

function CustomFields() {
  const narrow = useNarrowScreen();
  return narrow ? <DesktopOnly what="Setting up custom fields" /> : <CustomFieldsSettings />;
}
