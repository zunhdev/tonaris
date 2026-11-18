// The "Shared by {name}" pill of a shared folder or list (DS-70, FR-11.16; TON-296): the owner's avatar in their color
// and name, after "View only" or "Can edit". It opens a card with the avatar and name and, when the person is one of
// the owner's people, the owner's About text and a way to their page in People (DS-121). The owner's ID comes from
// the person's Shared with me; the card reads `GET /v1/people/{id}`, which answers only for one of their people.

import { api } from "@/api";
import { Avatar } from "@/features/account/avatar";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { ownerLabel } from "@tonaris/domain";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@tonaris/ui/components/popover";

import { useSharedEntries } from "./shared-entries";

type Profile = { about: string | null; known: boolean };

export function OwnerPill({
  rootId,
  prefix,
  owner,
}: {
  /** The shared folder or list at the top of the share. */
  rootId: string;
  /** "View only" or "Can edit". */
  prefix: string;
  /** The owner as the share's read names them; else as Shared with me does. */
  owner?: { displayName: string | null; avatarHue: number | null };
}) {
  const { entries } = useSharedEntries();
  const entry = entries?.find((each) => each.containerId === rootId);
  const ownerId = entry?.owner.id;
  const { displayName, avatarHue } = owner ??
    entry?.owner ?? { displayName: null, avatarHue: null };
  const name = ownerLabel(displayName, { start: true });
  const [profile, setProfile] = useState<Profile>();

  function read() {
    if (ownerId === undefined || profile !== undefined) return;
    void api.v1
      .people({ id: ownerId })
      .get()
      .then(
        ({ data }) => {
          setProfile({ about: data?.about ?? null, known: data !== null && data !== undefined });
          return undefined;
        },
        () => setProfile({ about: null, known: false }),
      );
  }

  return (
    <Popover onOpenChange={(open) => open && read()}>
      <PopoverTrigger
        render={
          <button
            type="button"
            // The same words it shows; the avatar is the letter only.
            aria-label={`${prefix} · Shared by ${ownerLabel(displayName)}`}
            className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-subtle px-2.5 text-small text-fg-secondary focus-ring outline-none hover:bg-hover"
          />
        }
      >
        {/* Spaces around the avatar, so the words read as one line. */}
        {prefix} · Shared by <Avatar name={name} hue={avatarHue} className="size-4 text-[9px]" />{" "}
        {ownerLabel(displayName)}
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={name} hue={avatarHue} className="text-lg size-10" />
          <PopoverTitle className="min-w-0 truncate text-base font-medium">{name}</PopoverTitle>
        </div>
        {profile?.about && (
          <PopoverDescription className="text-base text-fg-primary">
            {profile.about}
          </PopoverDescription>
        )}
        {profile?.known && ownerId !== undefined && (
          <Link
            to="/people/$personId"
            params={{ personId: ownerId }}
            className="text-small text-accent-solid underline-offset-4 hover:underline"
          >
            See {name} in People
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
