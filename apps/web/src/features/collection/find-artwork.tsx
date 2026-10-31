// Find artwork (TON-112, FR-03.4): a popover offering the Cover Art Archive's covers for an album's title and artist,
// from `GET /v1/artwork/covers`. Its button, "Find", is a ghost button beside the Artwork URL field (TON-124), named
// "Find artwork" for assistive technology. Each shows through the image proxy (TS-103) with its album's title, year and type,
// and choosing one hands its `front-500` address to the field it sits by. It waits while offline (DS-81), and until
// there are a title and an artist to search for.

import { apiUrl } from "@/config";
import { useConnection } from "@/features/sync/sync-provider";
import { useRef, useState } from "react";

import { artworkPath, coversSchema, problemSchema, type Cover } from "@tonaris/domain";
import { Button } from "@tonaris/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@tonaris/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tonaris/ui/components/tooltip";

import { Artwork } from "./artwork";

type Search =
  | { status: "searching" }
  | { status: "found"; covers: Cover[] }
  | { status: "failed"; reason: string };

const failedReason = "Couldn't search for artwork. Try again.";

async function findCovers(query: { title: string; artist: string }): Promise<Search> {
  try {
    const response = await fetch(
      `${apiUrl}/v1/artwork/covers?${new URLSearchParams(query).toString()}`,
      {
        credentials: "include",
      },
    );
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      return {
        status: "failed",
        reason: problemSchema.safeParse(body).data?.detail ?? failedReason,
      };
    }
    return { status: "found", covers: coversSchema.parse(body).covers };
  } catch {
    return { status: "failed", reason: failedReason };
  }
}

export function FindArtwork({
  title,
  artist,
  onChoose,
  inDialog = false,
}: {
  title: string;
  artist: string;
  /** Gets the chosen cover's `front-500` address. */
  onChoose: (artworkUrl: string) => void;
  /** In the manual entry form, which is a dialog. */
  inDialog?: boolean;
}) {
  const offline = useConnection() === "offline";
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<Search>({ status: "searching" });
  // Only the latest search's answer is shown.
  const latest = useRef(0);
  const query = { title: title.trim(), artist: artist.trim() };

  async function find() {
    latest.current += 1;
    const asked = latest.current;
    setSearch({ status: "searching" });
    const answer = await findCovers(query);
    if (asked === latest.current) setSearch(answer);
  }

  const waiting = offline
    ? "You're offline"
    : !query.title || !query.artist
      ? "Enter the title and artist first"
      : undefined;
  if (waiting) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="ghost" size="lg" aria-label="Find artwork" aria-disabled />}
        >
          Find
        </TooltipTrigger>
        <TooltipContent>{waiting}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void find();
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="lg" aria-label="Find artwork" />}>
        Find
      </PopoverTrigger>
      <PopoverContent inDialog={inDialog} className="flex w-96 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <PopoverTitle className="text-base font-medium">
            Artwork from the Cover Art Archive
          </PopoverTitle>
          <PopoverDescription className="truncate text-small">
            For “{query.title}” by {query.artist}
          </PopoverDescription>
        </div>
        {search.status === "searching" && (
          <output className="block text-small text-fg-secondary">Searching…</output>
        )}
        {search.status === "failed" && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-small text-fg-primary">{search.reason}</p>
            <Button size="sm" onClick={() => void find()}>
              Try again
            </Button>
          </div>
        )}
        {search.status === "found" && search.covers.length === 0 && (
          <output className="block text-small text-fg-secondary">No covers found.</output>
        )}
        {search.status === "found" && search.covers.length > 0 && (
          <ul aria-label="Covers" className="grid grid-cols-3 gap-2">
            {search.covers.map((cover) => (
              <li key={cover.releaseGroupId}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-1 rounded-md p-1 text-left outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-solid"
                  onClick={() => {
                    setOpen(false);
                    onChoose(cover.artworkUrl);
                  }}
                >
                  <Artwork
                    title={cover.title}
                    src={`${apiUrl}${artworkPath(cover.artworkUrl, cover.artworkSignature)}`}
                    className="w-full"
                    letterClassName="text-title"
                  />
                  <span className="truncate text-small text-fg-primary">{cover.title}</span>
                  <span className="truncate text-small text-fg-secondary">
                    {[cover.year, cover.type].filter((part) => part !== null).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
