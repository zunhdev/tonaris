// Settings → Data (DS-92, DS-98): the album usage meter for now; export joins with M10.

import { SettingsNav } from "@/features/settings/settings-nav";
import { UsageMeter } from "@/features/settings/usage";
import { PageHeader } from "@/features/shell/page-header";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/settings/data")({
  head: () => ({ meta: [{ title: "Data · Tonaris" }] }),
  component: Data,
});

function Data() {
  return (
    <>
      <PageHeader title="Data" />
      <SettingsNav />
      <div className="flex max-w-2xl flex-col gap-6 p-6">
        <section aria-labelledby="usage" className="flex flex-col gap-3">
          <h2 id="usage" className="text-title text-fg-primary">
            Usage
          </h2>
          <UsageMeter />
        </section>
      </div>
    </>
  );
}
