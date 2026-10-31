// Settings → Preferences (DS-94, FR-11.7, FR-11.8): the account defaults every view follows where its person made no
// choice of its own: the sort, direction, grouping and layout of lists and Unsorted, and the sort and direction of
// folders and the collection. Each choice is saved to the account at once, and reaches the person's other sessions.
// Views with choices of their own keep them. Links: whether service links open the services' web pages or their apps
// (FR-06.6, TON-104). Streaming services: the ones the person uses, a switch each; the album panel and New album
// show link fields only for those, while saved links still show (TON-138).

import { defaultsKey } from "@/client/sync/views";
import { useCollectionData } from "@/features/collection/data";
import {
  Choice,
  directionOptions,
  folderSortOptions,
  groupingOptions,
  layoutOptions,
  listSortOptions,
} from "@/features/collection/view-options";
import { SettingsNav } from "@/features/settings/settings-nav";
import { PageHeader } from "@/features/shell/page-header";
import { useSyncClient } from "@/features/sync/sync-provider";
import { createFileRoute } from "@tanstack/react-router";

import {
  serviceNames,
  streamingServices,
  type AccountDefaults,
  type LinkTarget,
  type StreamingService,
} from "@tonaris/domain";
import { SegmentedControl, type SegmentedOption } from "@tonaris/ui/components/segmented-control";
import { Switch } from "@tonaris/ui/components/switch";

const linkTargetOptions: readonly SegmentedOption<LinkTarget>[] = [
  { value: "web", label: "Web page" },
  { value: "app", label: "App" },
];

export const Route = createFileRoute("/_workspace/settings/preferences")({
  head: () => ({ meta: [{ title: "Preferences · Tonaris" }] }),
  component: Preferences,
});

function Preferences() {
  const client = useSyncClient();
  const { defaults, ready } = useCollectionData();

  function set(values: Partial<AccountDefaults>) {
    if (!client?.defaults.has(defaultsKey)) return;
    // The save-state layer reports a write that fails.
    client.defaults
      .update(defaultsKey, (draft) => {
        Object.assign(draft, values);
      })
      .isPersisted.promise.catch(() => {});
  }

  /** Turns a service on or off, keeping the list in the services' order. */
  function setService(service: StreamingService, on: boolean) {
    const hidden = new Set(defaults.hiddenServices);
    if (on) hidden.delete(service);
    else hidden.add(service);
    set({ hiddenServices: streamingServices.filter((each) => hidden.has(each)) });
  }

  return (
    <>
      <PageHeader title="Preferences" back={{ to: "/c", label: "Collection" }} />
      <SettingsNav />
      <div className="flex max-w-2xl flex-col gap-8 overflow-y-auto p-6">
        <section aria-labelledby="list-defaults" className="flex max-w-sm flex-col gap-3">
          <h2 id="list-defaults" className="text-title text-fg-primary">
            Lists and Unsorted
          </h2>
          <Choice label="Sort">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={listSortOptions}
                value={defaults.listSortMode}
                disabled={!ready}
                onValueChange={(listSortMode) => set({ listSortMode })}
              />
            )}
          </Choice>
          <Choice label="Direction">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={directionOptions}
                value={defaults.listSortDir}
                disabled={!ready || defaults.listSortMode === "manual"}
                onValueChange={(listSortDir) => set({ listSortDir })}
              />
            )}
          </Choice>
          <Choice label="Grouping">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={groupingOptions}
                value={defaults.grouped ? "type" : "none"}
                disabled={!ready}
                onValueChange={(grouping) => set({ grouped: grouping === "type" })}
              />
            )}
          </Choice>
          <Choice label="Layout">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={layoutOptions}
                value={defaults.layout}
                disabled={!ready}
                onValueChange={(layout) => set({ layout })}
              />
            )}
          </Choice>
        </section>

        <section aria-labelledby="folder-defaults" className="flex max-w-sm flex-col gap-3">
          <h2 id="folder-defaults" className="text-title text-fg-primary">
            Folders and Collection
          </h2>
          <Choice label="Sort">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={folderSortOptions}
                value={defaults.folderSortMode}
                disabled={!ready}
                onValueChange={(folderSortMode) => set({ folderSortMode })}
              />
            )}
          </Choice>
          <Choice label="Direction">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={directionOptions}
                value={defaults.folderSortDir}
                disabled={!ready || defaults.folderSortMode === "manual"}
                onValueChange={(folderSortDir) => set({ folderSortDir })}
              />
            )}
          </Choice>
        </section>

        <p className="max-w-md text-fg-secondary">
          Folders, lists and views where you've chosen options in View options keep them when you
          change these defaults. Choose "Use account defaults" there to follow these again.
        </p>

        <section aria-labelledby="link-target" className="flex max-w-sm flex-col gap-3">
          <h2 id="link-target" className="text-title text-fg-primary">
            Links
          </h2>
          <Choice label="Open links in">
            {(id) => (
              <SegmentedControl
                aria-labelledby={id}
                options={linkTargetOptions}
                value={defaults.linkTarget}
                disabled={!ready}
                onValueChange={(linkTarget) => set({ linkTarget })}
              />
            )}
          </Choice>
          <p className="text-small text-fg-secondary">
            App opens Spotify, Apple Music, Qobuz and Tidal links in their apps, on every device you
            use. A link to a service whose app isn't installed won't open.
          </p>
        </section>

        <section aria-labelledby="streaming-services" className="flex max-w-sm flex-col gap-3">
          <h2 id="streaming-services" className="text-title text-fg-primary">
            Streaming services
          </h2>
          <ul className="flex flex-col gap-2.5">
            {streamingServices.map((service) => (
              <li key={service} className="flex items-center justify-between gap-3">
                <span id={`service-${service}`} className="text-fg-primary">
                  {serviceNames[service]}
                </span>
                <Switch
                  aria-labelledby={`service-${service}`}
                  checked={!defaults.hiddenServices.includes(service)}
                  disabled={!ready}
                  onCheckedChange={(on) => setService(service, on)}
                />
              </li>
            ))}
          </ul>
          <p className="text-small text-fg-secondary">
            The album panel and New album show link fields only for the services that are on. Links
            you've already saved still show, and you can paste a link from any service.
          </p>
        </section>
      </div>
    </>
  );
}
