// An album's services in a list's view (DS-21, DS-22, DS-25; FR-06.5, TON-105): each service it has a link for, by
// name, in the services' order, each opening that service where the person's link setting says. Each reads as a
// link: underlined, with a ↗, in the link colour on hover (TON-125). Like a row's Open
// button they are for the pointer, as `O` is the keyboard's way: they take no focus, so the grid's focus and the
// inspector stay where they are, and a click opens the service rather than the album. Shared pages have no grid and
// no `O`, so there they take focus like any link (TON-127).

import { ArrowUpRight } from "lucide-react";
import type { MouseEvent } from "react";

import { serviceNames } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

import { ServiceAnchor, type Destination } from "./service-anchor";
import { ordered } from "./service-choices";

const keepFocus = (event: MouseEvent) => event.preventDefault();
const keepToLink = (event: MouseEvent) => event.stopPropagation();

export function ServiceNames({
  title,
  links,
  focusable = false,
}: {
  /** The album's title, for each link's name. */
  title: string;
  links: readonly Destination[] | undefined;
  /** Whether each takes focus, as on shared pages; the workspace's grid keeps it instead. */
  focusable?: boolean;
}) {
  const shown = ordered(links);
  return shown.map((link, index) => {
    const name = serviceNames[link.service];
    return (
      <ServiceAnchor
        key={link.service}
        link={link}
        aria-label={`Open '${title}' in ${name}`}
        data-slot="service-link"
        {...(focusable ? {} : { tabIndex: -1, onMouseDown: keepFocus, onClick: keepToLink })}
        // Spaced apart rather than separated, as each ends in its ↗; inline, so the cell still truncates. Each stays
        // whole, and a wrapped line starts flush (TON-127).
        className={cn(
          "group/service whitespace-nowrap text-fg-secondary hover:text-accent-solid",
          !focusable && "outline-none",
          index < shown.length - 1 && "mr-2.5",
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
