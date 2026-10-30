// An album's services in a list's view (DS-21, DS-22, DS-25; FR-06.5, TON-105): each service it has a link for, by
// name, in the services' order, each opening that service where the person's link setting says. Like a row's Open
// button they are for the pointer, as `O` is the keyboard's way: they take no focus, so the grid's focus and the
// inspector stay where they are, and a click opens the service rather than the album.

import { Fragment, type MouseEvent } from "react";

import { serviceNames, type ServiceLink } from "@tonaris/domain";

import { ServiceAnchor } from "./service-anchor";
import { ordered } from "./service-choices";

const keepFocus = (event: MouseEvent) => event.preventDefault();
const keepToLink = (event: MouseEvent) => event.stopPropagation();

export function ServiceNames({
  title,
  links,
  separator,
}: {
  /** The album's title, for each link's name. */
  title: string;
  links: readonly ServiceLink[] | undefined;
  separator: string;
}) {
  return ordered(links).map((link, index) => {
    const name = serviceNames[link.service];
    return (
      <Fragment key={link.service}>
        {index > 0 && <span aria-hidden>{separator}</span>}
        <ServiceAnchor
          link={link}
          tabIndex={-1}
          aria-label={`Open '${title}' in ${name}`}
          data-slot="service-link"
          onMouseDown={keepFocus}
          onClick={keepToLink}
          className="underline-offset-4 outline-none hover:text-fg-primary hover:underline"
        >
          {name}
        </ServiceAnchor>
      </Fragment>
    );
  });
}
