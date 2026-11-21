// Help's search, loaded when it's first wanted (FR-16.4, TON-314): the engine and every page's sections come in
// their own files, so a Help page doesn't carry them. The server loads them for /help/search; the browser when
// search opens. Once loaded, they stay.

import { useEffect, useState } from "react";

import type { HelpSearch } from "./engine";

let loading: Promise<HelpSearch> | undefined;

export function loadHelpSearch(): Promise<HelpSearch> {
  loading ??= Promise.all([import("./engine"), import("@/help/search.gen.json")]).then(
    ([engine, docs]) => engine.createHelpSearch(docs.default),
  );
  return loading;
}

/** The search once it has loaded; it starts loading when this is first used. */
export function useHelpSearch(): HelpSearch | undefined {
  const [search, setSearch] = useState<HelpSearch>();
  useEffect(() => {
    let current = true;
    const load = async () => {
      const loaded = await loadHelpSearch();
      if (current) setSearch(loaded);
    };
    void load();
    return () => {
      current = false;
    };
  }, []);
  return search;
}
