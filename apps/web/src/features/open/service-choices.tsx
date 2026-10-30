// The "Open in…" choices (DS-25; FR-06.5, FR-06.6, TS-43): the services an album has links for, in their order, by
// name, for the workspace's chooser and the shared pages' Open popover. Each opens where the person's link setting
// says, the service's page or its app (TON-104), and closes the popover.

import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { serviceNames, streamingServices } from "@tonaris/domain";
import { PopoverDescription, PopoverTitle } from "@tonaris/ui/components/popover";

import { ServiceAnchor, type Destination } from "./service-anchor";

/** The album's links, in the services' order (DS-25). */
export function ordered<T extends Destination>(links: readonly T[] | undefined): T[] {
  return streamingServices.flatMap(
    (service) => links?.find((link) => link.service === service) ?? [],
  );
}

/** The choices for an album titled `title`, inside a popover; `onClose` closes it. */
export function ServiceChoices({
  title,
  links,
  onClose,
}: {
  title: string;
  links: readonly Destination[];
  onClose: () => void;
}) {
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <>
      <PopoverTitle className="text-body font-medium">Open in…</PopoverTitle>
      <PopoverDescription className="truncate text-small">{title}</PopoverDescription>
      <ul className="flex flex-col gap-1">
        {ordered(links).map((link, index) => (
          <li key={link.service}>
            <ServiceAnchor
              link={link}
              ref={index === 0 ? first : undefined}
              onClick={onClose}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-fg-primary outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
            >
              Open in {serviceNames[link.service]}
              <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5 text-fg-tertiary" />
            </ServiceAnchor>
          </li>
        ))}
      </ul>
    </>
  );
}
