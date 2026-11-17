// A folder's or list's description as read (DS-41; FR-03.5, TON-292): its simple Markdown rendered as React elements,
// never as HTML made from the text (TS-101), at most 672 px wide. It shows its first three lines, fading out, and More
// shows the rest in place, Less folds it again. Whether it is longer than three lines is measured once it is on screen;
// on the server, where guest pages are drawn, its length decides until then. Links open in a new tab and send no
// referrer (TS-32). Classes only, no style attributes: the guest pages' CSP refuses them.

import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { parseDescription, type DescriptionInline } from "@tonaris/domain";
import { cn } from "@tonaris/ui/lib/utils";

/** Three lines of text: `max-h-15`, 60 px. */
const foldHeight = 60;

/** Whether a text is likely longer than three lines, before it can be measured. */
const looksLong = (text: string) => text.length > 180 || text.trim().split("\n").length > 3;

function Runs({ runs }: { runs: readonly DescriptionInline[] }): ReactNode {
  return runs.map((run, index) => {
    // A run's place in its line is its identity: the line is rendered whole each time.
    const key = index;
    if (run.kind === "text") return <Fragment key={key}>{run.text}</Fragment>;
    const inner = <Runs runs={run.children} />;
    if (run.kind === "strong")
      return (
        <strong key={key} className="font-semibold text-fg-primary">
          {inner}
        </strong>
      );
    if (run.kind === "em") return <em key={key}>{inner}</em>;
    return (
      <a
        key={key}
        href={run.href}
        target="_blank"
        rel="noreferrer nofollow ugc"
        className="rounded-xs text-accent-solid underline-offset-4 focus-ring outline-none hover:underline"
      >
        {inner}
      </a>
    );
  });
}

/** Lines of a paragraph or list item, their breaks kept. */
function Lines({ lines }: { lines: readonly (readonly DescriptionInline[])[] }): ReactNode {
  return lines.map((line, index) => (
    // oxlint-disable-next-line react/no-array-index-key
    <Fragment key={index}>
      {index > 0 && <br />}
      <Runs runs={line} />
    </Fragment>
  ));
}

/** The description's Markdown, rendered: paragraphs and lists, 8 px apart. */
export function DescriptionMarkdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 break-words">
      {parseDescription(text).map((block, index) =>
        block.kind === "paragraph" ? (
          // oxlint-disable-next-line react/no-array-index-key
          <p key={index}>
            <Lines lines={block.lines} />
          </p>
        ) : (
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {block.ordered ? (
              <ol
                start={block.start}
                className="flex list-decimal flex-col gap-0.5 pl-[18px] marker:text-fg-tertiary"
              >
                {block.items.map((item, at) => (
                  // oxlint-disable-next-line react/no-array-index-key
                  <li key={at}>
                    <Lines lines={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="flex list-disc flex-col gap-0.5 pl-[18px] marker:text-fg-tertiary">
                {block.items.map((item, at) => (
                  // oxlint-disable-next-line react/no-array-index-key
                  <li key={at}>
                    <Lines lines={item} />
                  </li>
                ))}
              </ul>
            )}
          </Fragment>
        ),
      )}
    </div>
  );
}

/** The description, three lines and More (DS-41). Key it by its folder or list, so another one starts folded. */
export function DescriptionText({ text, className }: { text: string; className?: string }) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(() => looksLong(text));
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return undefined;
    const measure = () => setLong(element.offsetHeight > foldHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const folded = long && !open;
  return (
    <div className={cn("max-w-2xl text-fg-secondary", className)}>
      <div
        id={id}
        className={cn(
          folded &&
            "max-h-15 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-1.25rem),transparent)]",
        )}
      >
        <div ref={content}>
          <DescriptionMarkdown text={text} />
        </div>
      </div>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((shown) => !shown)}
          className="mt-0.5 -ml-1.5 inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-small font-medium text-fg-secondary focus-ring outline-none hover:bg-hover hover:text-fg-primary"
        >
          {open ? "Less" : "More"}
          {open ? (
            <ChevronUp aria-hidden strokeWidth={1.5} className="size-3.5" />
          ) : (
            <ChevronDown aria-hidden strokeWidth={1.5} className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
