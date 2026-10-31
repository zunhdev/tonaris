// An album's services in a list's view (DS-21, DS-22, DS-25; FR-06.5, TON-105): each service it has a link for, by
// name, in the services' order, each opening that service where the person's link setting says. Each reads as a
// link: underlined, with a ↗, in the link colour on hover (TON-125). Like a row's Open
// button they are for the pointer, as `O` is the keyboard's way: they take no focus, so the grid's focus and the
// inspector stay where they are, and a click opens the service rather than the album.

import { ArrowUpRight } from "lucide-react";
import type { MouseEvent } from "react";

import { serviceNames, type ServiceLink } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { ServiceAnchor } from "./service-anchor";
import { ordered } from "./service-choices";

const keepFocus = (event: MouseEvent) => event.preventDefault();
const keepToLink = (event: MouseEvent) => event.stopPropagation();

export function ServiceNames({
  title,
  links,
}: {
  /** The album's title, for each link's name. */
  title: string;
  links: readonly ServiceLink[] | undefined;
}) {
  return ordered(links).map((link, index) => {
    const name = serviceNames[link.service];
    return (
      <ServiceAnchor
        key={link.service}
        link={link}
        tabIndex={-1}
        aria-label={`Open '${title}' in ${name}`}
        data-slot="service-link"
        onMouseDown={keepFocus}
        onClick={keepToLink}
        // Spaced apart rather than separated, as each ends in its ↗; inline, so the cell still truncates.
        className={cn(
          "group/service text-fg-secondary outline-none hover:text-accent-solid",
          index > 0 && "ml-2.5",
        )}
      >
        <span className="underline decoration-fg-tertiary/50 underline-offset-4 group-hover/service:decoration-accent-solid">
          {name}
        </span>
        <ArrowUpRight aria-hidden strokeWidth={2} className="ml-px inline size-3 align-[-1px]" />
      </ServiceAnchor>
    );
  });
}
