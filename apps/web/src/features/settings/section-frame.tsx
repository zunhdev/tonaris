// The frame Settings and Admin draw around their pages (DS-92, DS-100): the page's header, named by the page, and the
// section's tabs under it. Each section is a pathless layout route around its pages (routes/_workspace/_settings.tsx,
// _admin.tsx), so a page's route holds only its head, loader and body, and names itself in `staticData.title`.

import { PageHeader } from "@/features/shell/page-header";
import { useMatches } from "@tanstack/react-router";
import type { ReactNode } from "react";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The page's name in its header, for a section whose layout draws the header (Settings, Admin). */
    title?: string;
  }
}

export function SectionFrame({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const title = useMatches({ select: (matches) => matches.at(-1)?.staticData.title ?? "" });
  return (
    <>
      <PageHeader title={title} back={{ to: "/c", label: "Collection" }} />
      {nav}
      {children}
    </>
  );
}
