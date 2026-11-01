// Settings → Data (DS-92, DS-96, DS-98): the album usage meter, and downloading your data (TON-89).

import { DataExport } from "@/features/export/data-export";
import { UsageMeter } from "@/features/settings/usage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_workspace/_settings/settings/data")({
  staticData: { title: "Data" },
  head: () => ({ meta: [{ title: "Data · Tonaris" }] }),
  component: Data,
});

function Data() {
  return (
    <div className="flex max-w-2xl flex-col gap-6 p-6">
      <section aria-labelledby="usage" className="flex flex-col gap-3">
        <h2 id="usage" className="text-title text-fg-primary">
          Usage
        </h2>
        <UsageMeter />
      </section>
      <DataExport />
    </div>
  );
}
