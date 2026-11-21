// What Help's pages are made of (FR-16.1, DS-122, the creator's pick 4A, "quiet parts"): Markdown styled for reading,
// numbered steps, notes, keys, pictures with a text alternative, and two choices side by side. Pages write plain
// Markdown: a numbered list is steps, bold is a label in the app. Links inside Tonaris stay in the page.

import { helpPictures, type HelpPictureName } from "@/help/pages.gen";
import { Link } from "@tanstack/react-router";
import { Info, Lightbulb, Link2, Smartphone, TriangleAlert } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { Limit } from "./facts";
import { Keys } from "./keys";

const linkClass =
  "text-accent-solid underline decoration-accent-solid/40 underline-offset-3 hover:decoration-accent-solid";

/** A link: to a Help page in place, elsewhere in Tonaris in the tab, outside Tonaris in a new one. */
function HelpLink({ href = "", children, className }: ComponentProps<"a">) {
  const [path = "", hash] = href.split("#");
  if (path.startsWith("/help/") && path !== "/help/recovery") {
    return (
      <Link
        to="/help/$"
        params={{ _splat: path.slice("/help/".length) }}
        hash={hash}
        className={cn(linkClass, className)}
      >
        {children}
      </Link>
    );
  }
  const outside = /^https?:/.test(href);
  return (
    <a
      href={href}
      className={cn(linkClass, className)}
      {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/** A section heading, with a link to itself that shows on hover and focus. */
function heading(level: "h2" | "h3") {
  return function Heading({ id, children }: ComponentProps<"h2">) {
    const Tag = level;
    return (
      <Tag
        id={id}
        className={cn(
          "group scroll-mt-24 text-fg-primary",
          level === "h2" ? "mt-6 text-page" : "mt-2 text-title",
        )}
      >
        {children}
        {id && (
          <a
            href={`#${id}`}
            aria-label="Link to this section"
            className="ml-2 inline-flex align-middle text-fg-tertiary opacity-0 group-hover:opacity-100 hover:text-fg-primary focus-visible:opacity-100"
          >
            <Link2 aria-hidden strokeWidth={1.5} className="size-4" />
          </a>
        )}
      </Tag>
    );
  };
}

const noteKinds = {
  tip: { icon: Lightbulb, iconClass: "text-folder-amber", boxClass: "bg-panel" },
  phone: { icon: Smartphone, iconClass: "text-folder-pink", boxClass: "bg-panel" },
  info: { icon: Info, iconClass: "text-status-info", boxClass: "bg-panel" },
  careful: {
    icon: TriangleAlert,
    iconClass: "text-status-danger",
    boxClass: "bg-status-danger/10",
  },
} as const;

/** A note beside the steps: a tip, what differs on a phone, more to know, or what can't be undone. */
export function Note({
  kind = "info",
  children,
}: {
  kind?: keyof typeof noteKinds;
  children: ReactNode;
}) {
  const { icon: Icon, iconClass, boxClass } = noteKinds[kind];
  return (
    <div className={cn("flex gap-3 rounded-lg px-4 py-3.5", boxClass)}>
      <Icon aria-hidden strokeWidth={1.5} className={cn("mt-0.5 size-4.5 shrink-0", iconClass)} />
      <div className="flex min-w-0 flex-col gap-2 [&>p]:m-0">{children}</div>
    </div>
  );
}

/** A picture of the app (TON-308's run), at the size it was taken for, with what it shows in words. */
export function Picture({
  name,
  alt,
  caption,
}: {
  name: HelpPictureName;
  alt: string;
  caption?: string;
}) {
  const { src, width, height } = helpPictures[name];
  const phone = name.startsWith("phone-");
  return (
    <figure className="my-2 flex flex-col gap-2.5">
      <div
        className={cn(
          "w-fit max-w-full overflow-hidden rounded-xl border border-subtle bg-panel",
          phone && "max-w-75 self-center",
        )}
      >
        <img
          src={src}
          width={width}
          height={height}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block h-auto max-w-full"
        />
      </div>
      {caption && <figcaption className="text-small text-fg-tertiary">{caption}</figcaption>}
    </figure>
  );
}

/** Two choices side by side, such as removing from a list or deleting. */
export function Compare({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function Choice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-subtle p-4 [&>p]:m-0">
      <span className="font-semibold text-fg-primary">{title}</span>
      <div className="flex flex-col gap-2 [&>p]:m-0">{children}</div>
    </div>
  );
}

export const helpComponents: MDXComponents = {
  a: HelpLink,
  h2: heading("h2"),
  h3: heading("h3"),
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg-primary">{children}</strong>,
  em: ({ children }) => <em className="text-fg-primary italic">{children}</em>,
  // Every numbered list is steps: numbers in circles, room between.
  ol: ({ children }) => (
    <ol className="flex list-none flex-col gap-3.5 p-0 [counter-reset:step]">{children}</ol>
  ),
  ul: ({ children }) => (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-fg-tertiary">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="relative [counter-increment:step] [ol>&]:min-h-6 [ol>&]:pl-10 [ol>&]:before:absolute [ol>&]:before:top-0 [ol>&]:before:left-0 [ol>&]:before:flex [ol>&]:before:size-6 [ol>&]:before:items-center [ol>&]:before:justify-center [ol>&]:before:rounded-full [ol>&]:before:bg-accent-soft [ol>&]:before:text-small [ol>&]:before:font-semibold [ol>&]:before:text-accent-solid [ol>&]:before:content-[counter(step)]">
      {children}
    </li>
  ),
  code: ({ children }) => (
    <code className="rounded-sm bg-raised px-1 py-0.5 font-mono text-small text-fg-primary">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-subtle py-2 pr-4 font-semibold text-fg-primary">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-subtle py-2 pr-4 align-top">{children}</td>,
  hr: () => <hr className="my-4 border-subtle" />,
  Keys,
  Limit,
  Note,
  Picture,
  Compare,
  Choice,
};
