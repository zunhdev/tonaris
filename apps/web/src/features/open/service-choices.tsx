// The "Open in…" choices (DS-25; FR-06.5, FR-06.6, TS-43): the services an album has links for, in the person's order
// of services (TON-282), by name, for the workspace's chooser. Each opens where the person's link setting says, the service's page or its app
// (TON-104), and closes the popover.

import { useCollectionData } from "@/features/collection/data";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { serviceNames, servicesInOrder, type StreamingService } from "@tonaris/domain";
import { PopoverDescription, PopoverTitle } from "@tonaris/ui/components/popover";

import { ServiceAnchor, type Destination } from "./service-anchor";

/** The album's links in `order` (DS-25, TON-282), the services' own order when none is given. */
export function ordered<T extends Destination>(
  links: readonly T[] | undefined,
  order: readonly StreamingService[] = [],
): T[] {
  return servicesInOrder(order).flatMap(
    (service) => links?.find((link) => link.service === service) ?? [],
  );
}

/**
 * Every streaming service in the person's order, from Settings (TON-282): the services' own order until they choose
 * one, and for guests.
 */
export function useServiceOrder(): readonly StreamingService[] {
  const { serviceOrder } = useCollectionData().defaults;
  return useMemo(() => servicesInOrder(serviceOrder), [serviceOrder]);
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
  const order = useServiceOrder();
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => first.current?.focus(), []);
  return (
    <>
      <PopoverTitle className="text-base font-medium">Open in…</PopoverTitle>
      <PopoverDescription className="truncate text-small">{title}</PopoverDescription>
      <ul className="flex flex-col gap-1">
        {ordered(links, order).map((link, index) => (
          <li key={link.service}>
            <ServiceAnchor
              link={link}
              ref={index === 0 ? first : undefined}
              onClick={onClose}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-fg-primary focus-ring-flush outline-none hover:bg-hover"
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
