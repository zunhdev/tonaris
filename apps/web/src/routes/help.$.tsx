// `/help/{section}/{page}` (FR-16.1, DS-122): a Help page, public and rendered on the server with its content
// (features/help). An address that isn't a page is answered with Not found, and a way back to Help.

import { HelpFrame } from "@/features/help/help-frame";
import { HelpPageView } from "@/features/help/help-page";
import { helpPage } from "@/features/help/pages";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/help/$")({
  loader: ({ params }) => {
    // TanStack Router's name for what a splat matched.
    // oxlint-disable-next-line no-underscore-dangle
    const page = helpPage(params._splat ?? "");
    if (!page) throw notFound();
    return { slug: page.slug };
  },
  head: ({ loaderData }) => {
    const page = loaderData && helpPage(loaderData.slug);
    if (!page) return { meta: [{ title: "Not in Help · Tonaris" }] };
    return {
      meta: [
        { title: `${page.title} · Tonaris Help` },
        { name: "description", content: page.summary },
        { property: "og:title", content: page.title },
        { property: "og:description", content: page.summary },
      ],
    };
  },
  component: HelpPageRoute,
  notFoundComponent: NotInHelp,
});

function HelpPageRoute() {
  const { slug } = Route.useLoaderData();
  const page = helpPage(slug);
  return page ? <HelpPageView page={page} /> : <NotInHelp />;
}

function NotInHelp() {
  return (
    <HelpFrame>
      <div className="flex max-w-[42.5rem] flex-col gap-4">
        <h1 className="text-display text-fg-primary">This page isn't in Help</h1>
        <p className="text-lead">It may have moved. Help's home lists every page.</p>
        <Link to="/help" className="self-start text-accent-solid underline underline-offset-3">
          Go to Help's home
        </Link>
      </div>
    </HelpFrame>
  );
}
