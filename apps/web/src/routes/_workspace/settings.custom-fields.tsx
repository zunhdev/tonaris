// Settings → Custom fields (DS-60): the account's fields, each to rename, retype, give options or delete.

import { CustomFieldsSettings } from "@/features/settings/custom-fields";
import { SettingsNav } from "@/features/settings/settings-nav";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/settings/custom-fields")({
  head: () => ({ meta: [{ title: "Custom fields · Tonaris" }] }),
  component: CustomFields,
});

function CustomFields() {
  return (
    <>
      <PageHeader title="Custom fields" />
      <SettingsNav />
      <CustomFieldsSettings />
    </>
  );
}
