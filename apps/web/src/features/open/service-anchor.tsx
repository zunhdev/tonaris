// A link to an album on a service (FR-06.5, FR-06.6; DS-25, DS-46, TS-43). It opens where the person's link setting
// says (TON-104): the canonical page in a new tab, with no referrer, or the service's app through `appLink()`. A link
// `appLink()` can't read opens its page either way. Guests have no setting, so their links open the pages.

import { useCollectionData } from "@/features/collection/data";
import type { ComponentProps } from "react";

import type { LinkTarget, ServiceLink } from "@tonaris/domain";

import { appLink } from "./app-links";

export type Destination = Pick<ServiceLink, "service" | "url">;

/** Where the person's links open; the web pages outside the workspace. */
export function useLinkTarget(): LinkTarget {
  return useCollectionData().defaults.linkTarget;
}

export function ServiceAnchor({
  link,
  children,
  ...props
}: { link: Destination } & Omit<ComponentProps<"a">, "href" | "target" | "rel">) {
  const app = useLinkTarget() === "app" ? appLink(link.url) : undefined;
  if (app !== undefined) {
    return (
      <a href={app} {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={link.url} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}
