// The landing page's pictures of the app (TON-155, DS-120), drawn from its own parts and tokens rather than
// screenshots: the workspace under the hero, a picture for each step of How it works and each feature, and a phone.
// Each is one image with a label (`role="img"`), so a screen reader hears what it shows rather than the mock's text.
// Static: no state, no `style` attributes (the CSP), and the albums are invented (albums.ts).
// A picture is drawn from elements, which an `<img>` can't hold, so the image role goes on a plain element.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  Inbox,
  ListMusic,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Wordmark } from "@tonaris/ui/components/logo";
import { cn } from "@tonaris/ui/lib/utils";

import { albumById, albumGroups, type AlbumId } from "./albums";
import { Cover } from "./covers";

/** One picture: a framed image with its label. */
function Picture({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("rounded-[10px] border border-subtle bg-app text-base", className)}
    >
      {children}
    </div>
  );
}

const chip = "rounded-sm bg-raised px-1.5 text-small text-fg-secondary";
const outlined = "rounded-md border border-subtle px-2.5 text-fg-secondary";

function Icon({ icon: Glyph, className }: { icon: LucideIcon; className?: string }) {
  return <Glyph strokeWidth={1.5} aria-hidden className={cn("size-4 shrink-0", className)} />;
}

/** A tree row as the sidebar draws it: an open or closed folder, or a list, at a depth. */
function TreeRow({
  name,
  kind,
  depth,
  open,
  count,
  selected = false,
}: {
  name: string;
  kind: "folder" | "list";
  depth: 0 | 1 | 2 | 3 | 4;
  open?: boolean;
  count?: number;
  selected?: boolean;
}) {
  const indent = ["pl-2", "pl-6", "pl-10", "pl-14", "pl-18"][depth];
  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md pr-2",
        indent,
        selected && "bg-selected text-fg-primary",
      )}
    >
      {kind === "folder" ? (
        <ChevronRight
          strokeWidth={2}
          aria-hidden
          className={cn("size-3.5 shrink-0 text-fg-tertiary", open && "rotate-90")}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <Icon icon={kind === "folder" ? Folder : ListMusic} />
      <span className="truncate">{name}</span>
      {count !== undefined && <span className="ml-auto text-fg-tertiary">{count}</span>}
    </div>
  );
}

function SidebarPicture() {
  return (
    <div className="hidden w-59 shrink-0 flex-col border-r border-subtle bg-app px-2 pb-2 text-fg-secondary md:flex">
      <div className="flex h-12 items-center px-2">
        <Wordmark />
      </div>
      <div className="flex h-7 items-center gap-2 px-2 text-fg-primary">
        <span className="flex size-5 items-center justify-center rounded-full bg-raised text-micro">
          A
        </span>
        Alex
      </div>
      <div className="mt-1 flex h-7 items-center gap-1.5 px-2">
        <Icon icon={Search} />
        Search
        <kbd className="ml-auto text-micro text-fg-tertiary">⌘K</kbd>
      </div>
      <div className="flex h-7 items-center gap-1.5 px-2">
        <Icon icon={Plus} />
        Add album
      </div>
      <div className="my-2 h-px bg-subtle" />
      <div className="flex h-7 items-center justify-between px-2 text-small font-medium text-fg-tertiary">
        Collection
        <Icon icon={Plus} className="size-3.5" />
      </div>
      <TreeRow name="Electronic" kind="folder" depth={0} open />
      <TreeRow name="Ambient" kind="folder" depth={1} />
      <TreeRow name="Trip-hop" kind="list" depth={1} />
      <TreeRow name="Jazz" kind="folder" depth={0} />
      <TreeRow name="Moods" kind="folder" depth={0} open />
      <TreeRow name="Late night" kind="list" depth={1} selected />
      <TreeRow name="Sunday morning" kind="list" depth={1} />
      <TreeRow name="Desert island" kind="list" depth={0} />
      <TreeRow name="To listen" kind="list" depth={0} />
      <div className="flex h-7 items-center gap-1.5 px-2">
        <Icon icon={Inbox} />
        Unsorted
        <span className="ml-auto text-fg-tertiary">12</span>
      </div>
      <div className="flex h-7 items-center gap-1.5 px-2">
        <Icon icon={Users} />
        Shared with me
      </div>
      <div className="flex-1" />
      <div className="flex h-7 items-center gap-1.5 px-2">
        <Icon icon={Trash2} />
        Trash
        <span className="ml-auto text-fg-tertiary">3</span>
      </div>
    </div>
  );
}

function RowsPicture() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-subtle px-4">
        <span className="text-fg-tertiary">
          Moods <span aria-hidden>›</span> <span className="text-fg-primary">Late night</span>
        </span>
        <span className="flex gap-1.5">
          <span className={outlined}>View</span>
          <span className={outlined}>Share</span>
        </span>
      </div>
      <div className="px-6 pt-4 pb-2">
        <div className="text-title text-fg-primary">Late night</div>
        <div className="text-fg-tertiary">After eleven, headphones on.</div>
      </div>
      <div className="px-4">
        {albumGroups.map(({ group, albums: inGroup }) => (
          <div key={group}>
            <div className="mt-1.5 flex h-7 items-center gap-2 px-2 text-small text-fg-tertiary">
              <ChevronRight strokeWidth={2} aria-hidden className="size-3 rotate-90" />
              <span className="font-medium text-fg-secondary">{group}</span>
              {inGroup.length}
            </div>
            {inGroup.map((album) => (
              <div
                key={album.id}
                className={cn(
                  "grid h-9 grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-3 rounded-md px-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_3.25rem] xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_3.25rem_minmax(0,1.5fr)]",
                  album.id === "field" && "bg-selected",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Cover album={album.id} size={28} className="rounded-sm" />
                  <span className="truncate text-fg-primary">{album.title}</span>
                </span>
                <span className="hidden truncate text-fg-secondary sm:block">{album.artist}</span>
                <span className="text-fg-tertiary">{album.year}</span>
                <span className="hidden truncate text-fg-tertiary xl:block">{album.services}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectorPicture() {
  const field = albumById("field");
  return (
    <div className="hidden w-75 shrink-0 flex-col gap-3.5 border-l border-subtle bg-panel p-4 lg:flex">
      <Cover album="field" size={200} className="rounded-md" />
      <div>
        <div className="text-title text-fg-primary">{field.title}</div>
        <div className="text-fg-secondary">{field.artist}</div>
        <div className="text-fg-tertiary">2021 · Album</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Spotify", "Apple Music", "Qobuz"].map((service) => (
          <span key={service} className={cn(outlined, "flex items-center gap-1")}>
            {service}
            <ArrowUpRight strokeWidth={1.5} aria-hidden className="size-3.5" />
          </span>
        ))}
      </div>
      <div className="h-px bg-subtle" />
      <div className="grid grid-cols-[4.75rem_1fr] gap-x-2.5 gap-y-2">
        <span className="text-fg-tertiary">Mood</span>
        <span>
          <span className={chip}>Calm</span>
        </span>
        <span className="text-fg-tertiary">Listened</span>
        <span className="text-fg-secondary">Yes</span>
        <span className="text-fg-tertiary">Notes</span>
        <span className="text-fg-secondary">Side B on a rainy day.</span>
        <span className="text-fg-tertiary">In lists</span>
        <span className="flex flex-wrap gap-1.5">
          <span className={chip}>Late night</span>
          <span className={chip}>Desert island</span>
        </span>
      </div>
    </div>
  );
}

/** The workspace under the hero: the sidebar, the list Late night and the album Field Notes in the inspector. */
export function WorkspacePicture() {
  return (
    <div className="rounded-2xl border border-subtle bg-panel p-2 shadow-[0_40px_120px_var(--shadow-color)]">
      <Picture
        label="The Tonaris workspace: folders and lists in the sidebar, the list Late night with its albums, EPs and live album, and the album Field Notes open beside it"
        className="flex h-112 overflow-hidden text-left text-fg-secondary md:h-155"
      >
        <SidebarPicture />
        <RowsPicture />
        <InspectorPicture />
      </Picture>
    </div>
  );
}

const stepFrame = "flex h-34 flex-col justify-center gap-2 p-3.5";

export function PastePicture() {
  return (
    <Picture label="The Add album box, with a Spotify link pasted in" className={stepFrame}>
      <span className="font-medium text-fg-primary">Add album</span>
      <span className="flex gap-1.5">
        <span className="min-w-0 flex-1 truncate rounded-md border border-accent-solid px-2 py-1 font-mono text-small text-fg-primary">
          open.spotify.com/album/…
        </span>
        <span className="rounded-md bg-accent-fill px-2.5 py-1 text-fg-on-accent">Add</span>
      </span>
      <span className="text-small text-fg-tertiary">Or enter it by hand</span>
    </Picture>
  );
}

export function FilledPicture() {
  const field = albumById("field");
  return (
    <Picture
      label="Field Notes by Noor Halvorsen, filled in from MusicBrainz"
      className={cn(stepFrame, "flex-row items-center justify-start gap-3.5")}
    >
      <Cover album="field" size={72} className="rounded-sm" />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-fg-primary">{field.title}</span>
        <span className="text-fg-secondary">{field.artist}</span>
        <span className="text-fg-tertiary">2021 · Album</span>
        <span className="mt-1 flex items-center gap-1 text-small text-status-success">
          <Check strokeWidth={2} aria-hidden className="size-3.5" />
          Filled in from MusicBrainz
        </span>
      </span>
    </Picture>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return checked ? (
    <span className="flex size-3.5 items-center justify-center rounded-sm bg-accent-fill text-fg-on-accent">
      <Check strokeWidth={3} aria-hidden className="size-2.5" />
    </span>
  ) : (
    <span className="size-3.5 rounded-sm border border-strong" />
  );
}

export function FilePicture() {
  return (
    <Picture
      label="Choosing lists for the album: Late night and Desert island are checked"
      className={cn(stepFrame, "gap-1")}
    >
      <span className="mb-0.5 text-small text-fg-tertiary">Add to list</span>
      {[
        { name: "Late night", checked: true },
        { name: "Desert island", checked: true },
        { name: "Sunday morning", checked: false },
      ].map(({ name, checked }, index) => (
        <span
          key={name}
          className={cn(
            "flex h-6.5 items-center gap-2 rounded-sm px-1.5",
            index === 0 && "bg-hover",
            checked ? "text-fg-primary" : "text-fg-secondary",
          )}
        >
          <Checkbox checked={checked} />
          {name}
        </span>
      ))}
    </Picture>
  );
}

export function PlayPicture() {
  return (
    <Picture
      label="The Open in menu: Spotify, Apple Music and Qobuz"
      className={cn(stepFrame, "gap-1")}
    >
      <span className="mb-0.5 text-small text-fg-tertiary">Open in…</span>
      {["Spotify", "Apple Music", "Qobuz"].map((service, index) => (
        <span
          key={service}
          className={cn(
            "flex h-6.5 items-center justify-between rounded-sm px-1.5 text-fg-primary",
            index === 0 && "bg-hover",
          )}
        >
          {service}
          <ArrowUpRight strokeWidth={1.5} aria-hidden className="size-3.5 text-fg-tertiary" />
        </span>
      ))}
    </Picture>
  );
}

export function FoldersPicture() {
  return (
    <Picture
      label="Folders four levels deep, down to the list Kankyō ongaku, and the album Static Bloom in three lists"
      className="flex min-h-70 flex-1 flex-col px-3 py-3.5 text-fg-secondary"
    >
      <TreeRow name="Electronic" kind="folder" depth={0} open />
      <TreeRow name="Ambient" kind="folder" depth={1} open />
      <TreeRow name="Japanese" kind="folder" depth={2} open />
      <TreeRow name="1980s" kind="folder" depth={3} open />
      <TreeRow name="Kankyō ongaku" kind="list" depth={4} count={14} selected />
      <TreeRow name="Tape loops" kind="list" depth={2} count={9} />
      <TreeRow name="Trip-hop" kind="list" depth={1} count={22} />
      <div className="flex-1" />
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-subtle px-1 pt-2.5">
        <Cover album="bloom" size={22} className="rounded-xs" />
        <span>Static Bloom is in</span>
        {["Late night", "Shoegaze", "Desert island"].map((list) => (
          <span
            key={list}
            className="rounded-sm bg-accent-soft px-1.5 text-small text-accent-solid"
          >
            {list}
          </span>
        ))}
      </div>
    </Picture>
  );
}

export function AgentsPicture() {
  return (
    <Picture
      label="A chat in which Claude makes a list of unheard 90s albums, then asks to move two duplicates to Trash, with Decline and Approve"
      className="flex min-h-70 flex-1 flex-col gap-2.5 p-3.5"
    >
      <span className="max-w-[82%] self-end rounded-[12px_12px_3px_12px] bg-raised px-3 py-2 text-fg-primary">
        Which 90s albums haven’t I listened to yet? Put them in a list.
      </span>
      <span className="flex flex-wrap gap-1.5">
        {["search", "create_container", "add_to_lists"].map((tool) => (
          <span
            key={tool}
            className="rounded-sm border border-subtle px-1.5 font-mono text-micro text-fg-tertiary"
          >
            {tool}
          </span>
        ))}
      </span>
      <span className="max-w-[90%] text-fg-secondary">
        Found 4. They’re in a new list, <span className="text-fg-primary">90s, not yet</span>, under
        To listen. I also spotted 2 duplicates; moving them to Trash needs your approval.
      </span>
      <span className="mt-auto flex flex-col gap-2.5 rounded-[10px] border border-accent-solid/40 bg-accent-soft px-3.5 py-3">
        <span className="flex items-start gap-2.5">
          <ShieldCheck
            strokeWidth={1.75}
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-accent-solid"
          />
          <span className="flex flex-col">
            <span className="font-medium text-fg-primary">Move 2 albums to Trash</span>
            <span className="text-fg-secondary">
              Asked by Claude. They leave Late night, and Trash keeps them for 30 days.
            </span>
          </span>
        </span>
        <span className="flex justify-end gap-1.5">
          <span className={cn(outlined, "bg-app")}>Decline</span>
          <span className="rounded-md bg-accent-fill px-2.5 text-fg-on-accent">Approve</span>
        </span>
      </span>
    </Picture>
  );
}

const featureFrame = "mt-auto p-3.5";

export function SharingPicture() {
  return (
    <Picture
      label="Sharing the list Late night with one person and by link"
      className={cn(featureFrame, "flex flex-col gap-3")}
    >
      <span className="font-medium text-fg-primary">Share “Late night”</span>
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-fg-secondary">
          <span className="flex size-5 items-center justify-center rounded-full bg-raised text-micro text-fg-primary">
            S
          </span>
          sam@example.com
        </span>
        <span className="text-fg-tertiary">Can view</span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="text-fg-secondary">Anyone with the link</span>
        <span className="flex h-4.5 w-7.5 items-center justify-end rounded-full bg-accent-fill p-0.5">
          <span className="size-3.5 rounded-full bg-fg-on-accent" />
        </span>
      </span>
      <span className="flex gap-1.5">
        <span className="min-w-0 flex-1 truncate rounded-md border border-subtle px-2 py-1 font-mono text-micro text-fg-tertiary">
          tonaris.app/s/…
        </span>
        <span className={cn(outlined, "py-0.5")}>Copy</span>
      </span>
    </Picture>
  );
}

export function ExportPicture() {
  return (
    <Picture
      label="An export: a ZIP holding the collection as JSON, its schema, Markdown and a README"
      className={cn(featureFrame, "font-mono text-small leading-6 text-fg-secondary")}
    >
      <div className="truncate text-fg-primary">tonaris-export-20261101-1430.zip</div>
      {["tonaris-export.json", "tonaris-export.schema.json", "collection.md", "README.md"].map(
        (file, index, files) => (
          <div key={file} className="truncate">
            <span className="text-fg-tertiary">{index === files.length - 1 ? "└" : "├"}</span>{" "}
            {file}
          </div>
        ),
      )}
    </Picture>
  );
}

export function SpeedPicture() {
  const bus = albumById("bus");
  return (
    <Picture
      label="Search finds the album Night Bus Hymns and the list Late night as you type"
      className={cn("mt-auto overflow-hidden")}
    >
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2.5">
        <Icon icon={Search} className="size-3.5 text-fg-tertiary" />
        <span className="text-fg-primary">
          night
          <span className="ml-px inline-block h-3.5 w-px bg-accent-solid align-[-2px]" />
        </span>
        <kbd className="ml-auto rounded-sm border border-subtle px-1 text-micro text-fg-tertiary">
          ⌘K
        </kbd>
      </div>
      <div className="p-1.5">
        <div className="flex items-center gap-2.5 rounded-md bg-hover px-2 py-1.5">
          <Cover album="bus" size={24} className="rounded-xs" />
          <span className="min-w-0 flex-1 truncate text-fg-primary">
            {bus.title} <span className="text-fg-tertiary">{bus.artist}</span>
          </span>
          <span className="text-small text-fg-tertiary">Album</span>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex size-6 items-center justify-center text-fg-secondary">
            <Icon icon={ListMusic} />
          </span>
          <span className="min-w-0 flex-1 truncate text-fg-primary">
            Late night <span className="text-fg-tertiary">Moods</span>
          </span>
          <span className="text-small text-fg-tertiary">List</span>
        </div>
      </div>
    </Picture>
  );
}

const phoneAlbums: readonly AlbumId[] = ["bus", "tide", "machines", "field", "bluehour", "bloom"];

export function PhonePicture() {
  return (
    <div
      role="img"
      aria-label="Tonaris on a phone: the list Late night, and Claude asking to move two albums to Trash"
      className="h-150 w-75 max-w-full shrink-0 rounded-[46px] border border-subtle bg-panel p-2.5 shadow-[0_40px_100px_var(--shadow-color)]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[37px] bg-app text-[0.875rem] leading-5">
        <div className="h-11 shrink-0" />
        <div className="flex items-center gap-1.5 border-b border-subtle px-4 pb-2.5">
          <ChevronLeft strokeWidth={1.75} aria-hidden className="size-4.5 text-fg-secondary" />
          <span className="text-[1.0625rem] font-semibold text-fg-primary">Late night</span>
        </div>
        <div className="flex flex-col px-2.5 py-1.5">
          {phoneAlbums.map(albumById).map((album) => (
            <div key={album.id} className="flex h-14 items-center gap-3 px-1.5">
              <Cover album={album.id} size={44} className="rounded-sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg-primary">{album.title}</span>
                <span className="truncate text-[0.8125rem] text-fg-tertiary">{album.artist}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <div className="mx-2.5 mb-3.5 flex items-center gap-2.5 rounded-2xl border border-subtle bg-raised px-3.5 py-3 text-[0.8125rem] leading-[1.0625rem]">
          <ShieldCheck
            strokeWidth={1.75}
            aria-hidden
            className="size-4.5 shrink-0 text-accent-solid"
          />
          <span className="flex-1 text-fg-primary">Claude asks to move 2 albums to Trash</span>
          <span className="font-medium text-accent-solid">Review</span>
        </div>
      </div>
    </div>
  );
}
