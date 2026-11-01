// A view's presentation and the choices that change it (FR-05.2, FR-11.7, FR-11.8, DS-49): what the view shows,
// whether it has choices of its own, and the writes behind View options. Each write goes through the sync client's
// collections, so it shows at once, is saved to the account and reaches the person's other sessions; the save-state
// layer reports one that fails. Choosing is not a collection edit (X-04), so it works offline too, waiting in the
// outbox.

import { sent } from "@/client/sync/writer";
import { useAccountDefaults } from "@/features/settings/account-defaults";
import { useSyncClient } from "@/features/sync/sync-provider";

import {
  unsetView,
  type FolderSortMode,
  type ListSortMode,
  type ViewPrefsFields,
} from "@tonaris/domain";

import { useCollectionData } from "./data";
import { defaultsFrom, presentationOf, type Presentation, type ViewKind } from "./presentation";

export type ViewPresentation<Mode = ListSortMode | FolderSortMode> = {
  presentation: Presentation<Mode>;
  /** Whether the view has choices of its own, which "Use account defaults" would clear. */
  remembered: boolean;
  /** Whether the view already shows what the defaults give it, so saving them would change nothing. */
  isDefault: boolean;
  /** Remembers a choice for this view. The sort goes with its direction, as one choice. */
  choose: (change: Partial<Presentation<Mode>>) => void;
  /** Clears the view's choices, so it follows the account defaults again. */
  resetToDefaults: () => void;
  /** Makes what the view shows the account defaults for its kind of view. */
  saveAsDefault: () => void;
};

export function usePresentation(viewKey: string, kind: "albums"): ViewPresentation<ListSortMode>;
export function usePresentation(
  viewKey: string,
  kind: "containers",
): ViewPresentation<FolderSortMode>;
export function usePresentation(
  viewKey: string,
  kind: ViewKind,
): ViewPresentation<ListSortMode> | ViewPresentation<FolderSortMode> {
  const client = useSyncClient();
  const { views, defaults } = useCollectionData();
  const accountDefaults = useAccountDefaults();
  const prefs = views.get(viewKey);

  function viewOf<Mode extends ListSortMode | FolderSortMode>(
    presentation: Presentation<Mode>,
    fromDefaults: Presentation<Mode>,
  ): ViewPresentation<Mode> {
    return {
      presentation,
      remembered: prefs !== undefined,
      isDefault:
        presentation.sortMode === fromDefaults.sortMode &&
        presentation.sortDir === fromDefaults.sortDir &&
        presentation.grouped === fromDefaults.grouped &&
        presentation.layout === fromDefaults.layout,

      choose: (change) => {
        if (!client) return;
        const next: Partial<ViewPrefsFields> = {};
        if (change.sortMode !== undefined || change.sortDir !== undefined) {
          next.sortMode = change.sortMode ?? presentation.sortMode;
          next.sortDir = change.sortDir ?? presentation.sortDir;
        }
        if (change.grouped !== undefined) next.grouped = change.grouped;
        if (change.layout !== undefined) next.layout = change.layout;
        sent(
          client.views.has(viewKey)
            ? client.views.update(viewKey, (draft) => {
                Object.assign(draft, next);
              })
            : client.views.insert({ ...unsetView(viewKey), ...next }),
        );
      },

      resetToDefaults: () => {
        if (client?.views.has(viewKey)) sent(client.views.delete(viewKey));
      },

      saveAsDefault: () => accountDefaults.set(defaultsFrom(kind, presentation)),
    };
  }

  return kind === "albums"
    ? viewOf(
        presentationOf("albums", prefs, defaults),
        presentationOf("albums", undefined, defaults),
      )
    : viewOf(
        presentationOf("containers", prefs, defaults),
        presentationOf("containers", undefined, defaults),
      );
}
