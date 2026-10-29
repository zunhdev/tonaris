// Settings → Custom fields (DS-60): the account's fields, each to rename, retype, give options or delete.

import { useNarrowScreen } from "@/features/collection/collection-ui";
import { CustomFieldsSettings } from "@/features/settings/custom-fields";
import { SettingsNav } from "@/features/settings/settings-nav";
import { DesktopOnly } from "@/features/shell/desktop-only";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/settings/custom-fields")({
  head: () => ({ meta: [{ title: "Custom fields · Tonaris" }] }),
  component: CustomFields,
});

function CustomFields() {
  const narrow = useNarrowScreen();
  return (
    <>
      <PageHeader title="Custom fields" back={{ to: "/c", label: "Collection" }} />
      <SettingsNav />
      {narrow ? <DesktopOnly what="Setting up custom fields" /> : <CustomFieldsSettings />}
    </>
  );
}
