// A shared link (DS-72, TS-03, TS-32): public and server-rendered, so a guest sees the share on the first paint and a
// link preview has its words. The share is read once per visit and per change, server-side through the API's internal
// URL; `?c=` picks a folder or list inside it, on the client. The token never leaves in a Referer (security/headers.ts).

import { createApiClient } from "@/api";
import { serverApiUrl } from "@/config";
import { GuestPage, UnavailableShare } from "@/features/guest/guest-page";
import { useShareStream } from "@/features/guest/use-share-stream";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import type { SharedSnapshot } from "@tonaris/domain";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Loaded = { snapshot: SharedSnapshot } | { snapshot: undefined };

export const Route = createFileRoute("/s/$token")({
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search.c === "string" && uuid.test(search.c) ? { c: search.c } : {},
  loader: async ({ params }): Promise<Loaded> => {
    try {
      const { data } = await createApiClient(serverApiUrl).v1.s({ token: params.token }).get();
      return { snapshot: data ?? undefined };
    } catch {
      return { snapshot: undefined };
    }
  },
  head: ({ loaderData }) => {
    const snapshot = loaderData?.snapshot;
    const root = snapshot?.containers.find((each) => each.id === snapshot.rootId);
    if (!snapshot || !root) {
      return {
        meta: [{ title: "Not available · Tonaris" }, { name: "robots", content: "noindex" }],
      };
    }
    const owner = snapshot.owner.displayName ?? "a Tonaris member";
    const count = snapshot.albums.length;
    const description = `Shared by ${owner} · ${count} ${count === 1 ? "album" : "albums"}`;
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
  const { c } = Route.useSearch();
  const { snapshot } = Route.useLoaderData();
  const router = useRouter();
  const reread = useCallback(() => void router.invalidate(), [router]);
  useShareStream(token, snapshot !== undefined, reread);
  if (!snapshot) return <UnavailableShare />;
  return <GuestPage token={token} snapshot={snapshot} containerId={c} />;
}
