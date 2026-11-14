// A shared link (DS-72, TS-03, TS-32): public and server-rendered, so a guest sees the share on the first paint and a
// link preview has its words. The share is read once per visit, server-side through the API's internal URL, naming
// the visitor's address so the API's limit counts them (TS-104), then again in the browser after each change
// (guest-share.ts); `?c=` picks a folder or list inside it, on the client. The token never leaves in a Referer
// (security/headers.ts).

import { createApiClient, visitorHeaders } from "@/api";
import { count } from "@/common/words";
import { serverApiUrl } from "@/config";
import { GuestPage, UnavailableShare } from "@/features/guest/guest-page";
import { loadGuestShare, useGuestShare } from "@/features/guest/guest-share";
import { uuidSearch } from "@/search";
import { createFileRoute } from "@tanstack/react-router";

import { ownerLabel } from "@tonaris/domain";

// `?c=`, the folder or list inside the share; anything but an ID is dropped.
// Made outside the route's options: inferred inside them, beside the functions there, its key's type is lost.
const containerSearch = uuidSearch("c");

export const Route = createFileRoute("/s/$token")({
  validateSearch: containerSearch,
  loader: ({ params }) =>
    loadGuestShare(() =>
      createApiClient(serverApiUrl)
        .v1.s({ token: params.token })
        .get({ headers: visitorHeaders() }),
    ),
  head: ({ loaderData }) => {
    const snapshot = loaderData?.snapshot;
    const root = snapshot?.containers.find((each) => each.id === snapshot.rootId);
    if (!snapshot || !root) {
      return {
        meta: [{ title: "Not available · Tonaris" }, { name: "robots", content: "noindex" }],
      };
    }
    const owner = ownerLabel(snapshot.owner.displayName);
    const description = `Shared by ${owner} · ${count(snapshot.albums.length, "album", "albums")}`;
    // Text only: no artwork in previews (DS-72).
    return {
      meta: [
        { title: `${root.name} · Tonaris` },
        { name: "description", content: description },
        { property: "og:title", content: root.name },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SharedLinkPage,
});

function SharedLinkPage() {
  const { token } = Route.useParams();
  // Another link starts afresh.
  return <SharedLink key={token} token={token} />;
}

function SharedLink({ token }: { token: string }) {
  const { c } = Route.useSearch();
  const { snapshot, gone } = useGuestShare(token, Route.useLoaderData());
  if (gone) return <UnavailableShare />;
  // Until a read lands: the server's was refused for now, and the page tries again.
  if (!snapshot) return <UnavailableShare busy />;
  return <GuestPage token={token} snapshot={snapshot} containerId={c} />;
}
