// The landing page's pictures of the app (TON-155, DS-120), drawn from its own parts and tokens rather than
// screenshots: the workspace under the hero, a picture for each step of How it works and each feature, and a phone.
// As the app looks since TON-176: covers with their edge and shadow, the open album's ring and title, release labels;
// colored folders and lists with guide lines; the round avatar; frosted menus and filled fields; the panel's wash and
// Properties; and a folder's cards with their covers fanned.
// Each is one image with a label (`role="img"`), so a screen reader hears what it shows rather than the mock's text.
// Static: no state, no `style` attributes (the CSP), and the albums are invented (albums.ts).
// A picture is drawn from elements, which an `<img>` can't hold, so the image role goes on a plain element.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */

import { iconColorClass, tintedChip } from "@/features/collection/container-palette";
import { ReleaseLabel } from "@/features/collection/release-label";
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
import { Fragment, type ReactNode } from "react";

import type { ContainerColor } from "@tonaris/domain";
import { Wordmark } from "@tonaris/ui/components/logo";
import { cn } from "@tonaris/ui/lib/utils";

import { albumById, albums, type AlbumId } from "./albums";
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

/** A folder's or list's icon, in its color and lightly filled with it (DS-27, TON-175). */
function ContainerGlyph({ kind, color }: { kind: "folder" | "list"; color?: ContainerColor }) {
  return (
    <Icon
      icon={kind === "folder" ? Folder : ListMusic}
      className={cn(color && [iconColorClass[color], "fill-current/25"])}
    />
  );
}

/**
 * A cover as the app draws it (DS-22, TON-167): a faint light edge inside it, and on cards and the panel a shadow
 * under it. Without a size it fills its box's width. The open album's has the accent's ring.
 */
function Art({
  album,
  size,
  raised = false,
  open = false,
  className,
}: {
  album: AlbumId;
  size?: number;
  raised?: boolean;
  open?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden",
        // A cover of a set size keeps to it, in a column too.
        size !== undefined && "w-fit",
        raised && "shadow-artwork",
        open && "outline-2 outline-offset-3 outline-accent-solid outline-solid",
        className,
      )}
    >
      <Cover
        album={album}
        size={size ?? 200}
        className={size === undefined ? "block h-auto w-full" : "block"}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] inset-ring inset-ring-artwork"
      />
    </span>
  );
}

/** Each level's guide line, under its chevron: 8 px in, 16 px a level, and half the 14 px chevron (TON-169). */
const guideAt = ["left-[15px]", "left-[31px]", "left-[47px]", "left-[63px]"];

/** A tree row as the sidebar draws it: an open or closed folder, or a list, at a depth, in its color. */
function TreeRow({
  name,
  kind,
  depth,
  open,
  count,
  color,
  selected = false,
}: {
  name: string;
  kind: "folder" | "list";
  depth: 0 | 1 | 2 | 3 | 4;
  open?: boolean;
  count?: number;
  /** Its own or its folder's. */
  color?: ContainerColor;
  selected?: boolean;
}) {
  const indent = ["pl-2", "pl-6", "pl-10", "pl-14", "pl-18"][depth];
  return (
    <div
      className={cn(
        "relative flex h-7 items-center gap-1.5 rounded-md pr-2",
        indent,
        selected && "bg-selected text-fg-primary",
      )}
    >
      {guideAt.slice(0, depth).map((left) => (
        <span key={left} aria-hidden className={cn("absolute inset-y-0 w-px bg-subtle", left)} />
      ))}
      {kind === "folder" ? (
        <ChevronRight
          strokeWidth={2}
          aria-hidden
          className={cn("size-3.5 shrink-0 text-fg-tertiary", open && "rotate-90")}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <ContainerGlyph kind={kind} color={color} />
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
        {/* The avatar's hue comes from the name, as the app's does (DS-31): 285 for "Alex". */}
        <span className="flex size-5 items-center justify-center rounded-full bg-[oklch(0.52_0.12_285)] text-micro font-semibold text-fg-on-accent">
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
      <TreeRow name="Electronic" kind="folder" depth={0} open color="blue" />
      <TreeRow name="Ambient" kind="folder" depth={1} color="blue" />
      <TreeRow name="Trip-hop" kind="list" depth={1} color="blue" />
      <TreeRow name="Jazz" kind="folder" depth={0} color="amber" />
      <TreeRow name="Moods" kind="folder" depth={0} open color="violet" />
      <TreeRow name="Late night" kind="list" depth={1} selected color="violet" />
      <TreeRow name="Sunday morning" kind="list" depth={1} color="violet" />
      <TreeRow name="Desert island" kind="list" depth={0} color="pink" />
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

/** Late night as the app sorts a list at first, by year, oldest first (FR-05.5), with Blue Hour Sessions open. */
const byYear = albums.toSorted((a, b) => a.year.localeCompare(b.year));
const openAlbum: AlbumId = "bluehour";

function GridPicture() {
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-5 px-6 pt-2">
        {byYear.map((album) => {
          const open = album.id === openAlbum;
          return (
            <div key={album.id} className="flex min-w-0 flex-col gap-1">
              <span className="relative block">
                <Art album={album.id} raised open={open} className="rounded-md" />
                <ReleaseLabel label={album.group === "Album" ? undefined : album.group} />
              </span>
              <span
                className={cn(
                  "mt-1 truncate font-medium text-fg-primary",
                  open &&
                    "-mx-1.5 max-w-[calc(100%+0.75rem)] self-start rounded-sm bg-accent-fill px-1.5 text-fg-on-accent",
                )}
              >
                {album.title}
              </span>
              <span className="truncate text-small text-fg-secondary">{album.artist}</span>
              <span className="text-small text-fg-tertiary">{album.year}</span>
              <span className="truncate text-small text-fg-tertiary">{album.services}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One of the album panel's sections, a thin line above it (DS-46, TON-173). */
function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-subtle pt-5">
      <span className="text-small font-medium text-fg-secondary">{title}</span>
      {children}
    </div>
  );
}

/** A list chip on the album panel, tinted with its list's color (DS-46, TON-175). */
const listChip =
  "flex h-6 items-center rounded-full border border-subtle bg-raised px-2.5 text-small text-fg-primary";

function InspectorPicture() {
  const album = albumById(openAlbum);
  return (
    <div className="relative isolate hidden w-75 shrink-0 flex-col gap-5 overflow-hidden border-l border-subtle bg-panel p-4 lg:flex">
      {/* The wash: the cover's hue as the app reads it, oklch(0.21 0.08 263), fading into the panel (TON-173). */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-linear-to-b from-[oklch(0.21_0.08_263)] to-transparent"
      />
      <div className="flex flex-col gap-3">
        <Art album={openAlbum} size={176} raised className="rounded-md" />
        <div className="flex flex-col gap-0.5">
          <div className="text-title text-fg-primary">{album.title}</div>
          <div className="text-fg-secondary">{album.artist}</div>
        </div>
      </div>
      <PanelSection title="Links">
        <div className="flex flex-wrap gap-1.5">
          {album.services.split(", ").map((service) => (
            <span key={service} className={cn(outlined, "flex items-center gap-1")}>
              {service}
              <ArrowUpRight strokeWidth={1.5} aria-hidden className="size-3.5" />
            </span>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Custom fields">
        <div className="grid grid-cols-[4.75rem_1fr] gap-x-2.5 gap-y-2">
          <span className="text-fg-tertiary">Mood</span>
          <span>
            <span className={chip}>Calm</span>
          </span>
          <span className="text-fg-tertiary">Notes</span>
          <span className="text-fg-secondary">Side B on a rainy day.</span>
        </div>
      </PanelSection>
      <PanelSection title="Lists">
        <span className="flex flex-wrap gap-1.5">
          {(
            [
              { name: "Late night", color: "violet" },
              { name: "Desert island", color: "pink" },
            ] as const
          ).map(({ name, color }) => (
            <span key={name} className={cn(listChip, tintedChip(color))}>
              {name}
            </span>
          ))}
        </span>
      </PanelSection>
      <PanelSection title="Properties">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          {[
            ["Release type", "Album"],
            ["Live", "No"],
            ["Original release year", album.year],
            ["Added", "2 Nov 2026"],
            ["In lists", "2"],
            ["Links", album.services],
          ].map(([term, value]) => (
            <Fragment key={term}>
              <span className="text-fg-tertiary">{term}</span>
              <span className="min-w-0 text-fg-primary tabular-nums">{value}</span>
            </Fragment>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}

/** The workspace under the hero: the sidebar, the list Late night and the album Field Notes in the inspector. */
export function WorkspacePicture() {
  return (
    <div className="rounded-2xl border border-subtle bg-panel p-2 shadow-[0_40px_120px_var(--shadow-color)]">
      <Picture
        label="The Tonaris workspace: colored folders and lists in the sidebar, the list Late night as a grid of covers with its EPs and live album marked, and the album Blue Hour Sessions open beside it"
        className="flex h-112 overflow-hidden text-left text-fg-secondary md:h-155 lg:h-170"
      >
        <SidebarPicture />
        <GridPicture />
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
      <span className="flex gap-2.5">
        {/* A filled field with the focus ring (TON-168). */}
        <span className="min-w-0 flex-1 truncate rounded-md border border-subtle bg-field px-2 py-1 font-mono text-small text-fg-primary outline-2 outline-offset-2 outline-focus outline-solid">
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
      <Art album="field" size={72} raised className="rounded-sm" />
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
      label="The Open in menu over the cover of Field Notes: Spotify, Apple Music and Qobuz"
      className={cn(stepFrame, "relative overflow-hidden")}
    >
      <Art album="field" size={104} raised className="absolute top-4 left-3.5 rounded-md" />
      {/* A frosted popover, the cover showing faintly through it (TON-168). */}
      <span className="relative ml-auto flex w-[64%] flex-col rounded-lg bg-frosted p-1 shadow-floating backdrop-blur-xl backdrop-saturate-150">
        <span className="px-1.5 pt-0.5 pb-1 text-small text-fg-tertiary">Open in…</span>
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
      </span>
    </Picture>
  );
}

/** Each cover's place in a fan of three, back to front, as the app's cards place them (DS-41, TON-178). */
const fanPlaces = [
  "left-[12%] top-0 brightness-50",
  "left-[6%] top-[6%] brightness-75",
  "left-0 top-[12%]",
];

/** A folder's or list's card: its first three covers fanned, the first in front; its icon and name; what it holds. */
function ContainerCard({
  name,
  kind,
  color,
  covers,
  contents,
}: {
  name: string;
  kind: "folder" | "list";
  color?: ContainerColor;
  covers: readonly [AlbumId, AlbumId, AlbumId];
  contents: string;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="relative block aspect-square w-full">
        {covers.toReversed().map((album, index) => (
          <span key={album} className={cn("absolute w-[88%]", fanPlaces[index])}>
            <Art album={album} raised className="rounded-md" />
          </span>
        ))}
      </span>
      <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <ContainerGlyph kind={kind} color={color} />
        <span className="truncate font-medium text-fg-primary">{name}</span>
      </span>
      <span className="truncate text-small text-fg-tertiary">{contents}</span>
    </span>
  );
}

export function FoldersPicture() {
  return (
    <Picture
      label="Folders four levels deep, in their colors, down to the list Kankyō ongaku; the folder Japanese's folder and list as cards with their covers; and the album Static Bloom in three lists"
      className="flex min-h-70 flex-1 flex-col px-3 py-3.5 text-fg-secondary"
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <TreeRow name="Electronic" kind="folder" depth={0} open color="blue" />
          <TreeRow name="Ambient" kind="folder" depth={1} open color="blue" />
          <TreeRow name="Japanese" kind="folder" depth={2} open color="teal" selected />
          <TreeRow name="1980s" kind="folder" depth={3} open color="teal" />
          <TreeRow name="Kankyō ongaku" kind="list" depth={4} count={14} color="teal" />
          <TreeRow name="Tape loops" kind="list" depth={3} count={9} color="teal" />
          <TreeRow name="Trip-hop" kind="list" depth={1} count={22} color="blue" />
        </div>
        {/* What the folder Japanese holds, as cards with the covers inside them (TON-174). */}
        <div className="hidden w-[45%] shrink-0 grid-cols-2 content-start gap-3 pt-1 pr-1 sm:grid">
          <ContainerCard
            name="1980s"
            kind="folder"
            color="teal"
            covers={["tide", "machines", "field"]}
            contents="1 list"
          />
          <ContainerCard
            name="Tape loops"
            kind="list"
            color="teal"
            covers={["bloom", "uv", "garden"]}
            contents="9 albums"
          />
        </div>
      </div>
      <div className="flex-1" />
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-subtle px-1 pt-2.5">
        <Art album="bloom" size={22} className="rounded-xs" />
        <span>Static Bloom is in</span>
        {(
          [
            { name: "Late night", color: "violet" },
            { name: "Shoegaze", color: "orange" },
            { name: "Desert island", color: "pink" },
          ] as const
        ).map(({ name, color }) => (
          <span key={name} className={cn(listChip, tintedChip(color))}>
            {name}
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
        <span className="min-w-0 flex-1 truncate rounded-md border border-subtle bg-field px-2 py-1 font-mono text-micro text-fg-tertiary">
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
      className="mt-auto overflow-hidden bg-frosted"
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
          <Art album="bus" size={24} className="rounded-xs" />
          <span className="min-w-0 flex-1 truncate text-fg-primary">
            {bus.title} <span className="text-fg-tertiary">{bus.artist}</span>
          </span>
          <span className="text-small text-fg-tertiary">Album</span>
        </div>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span className="flex size-6 items-center justify-center text-fg-secondary">
            <ContainerGlyph kind="list" color="violet" />
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
              <Art album={album.id} size={44} className="rounded-sm" />
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
