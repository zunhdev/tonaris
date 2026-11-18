// Settings → Profile (DS-93, FR-11.3, FR-11.16): the display name, which people the person shares with see instead of
// their email. It is saved when the field loses focus, or on Enter. Clearing it removes it while they share nothing;
// while they share, the server refuses (AC-38), and the field goes back to the saved name with the reason. Then the
// avatar's color, Automatic or one of 12 hues, saved on choice, and the About text their people see, saved as the
// name is (TON-296); then up to four favorite albums (TON-297).

import { Avatar } from "@/features/account/avatar";
import { forgetAccount } from "@/features/account/session";
import { FavoriteAlbums } from "@/features/settings/favorite-albums";
import { useSend } from "@/features/sharing/send";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";

import {
  avatarHues,
  clipLength,
  maxAboutLength,
  maxNameLength,
  textLength,
  type AvatarHue,
} from "@tonaris/domain";
import { Input } from "@tonaris/ui/components/input";
import { Label } from "@tonaris/ui/components/label";

export const Route = createFileRoute("/_workspace/_settings/settings/profile")({
  staticData: { title: "Profile" },
  head: () => ({ meta: [{ title: "Profile · Tonaris" }] }),
  component: Profile,
});

function Profile() {
  const { account } = Route.useRouteContext();
  const router = useRouter();
  const id = useId();
  const savedName = account.displayName ?? "";
  const [name, setName] = useState(savedName);
  const { run, busy, error, setError } = useSend();
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy || name.trim() === savedName) return;
    setSaved(false);
    if (await run({ name: "account.setDisplayName", args: { displayName: name } })) {
      setName(savedName);
      return;
    }
    setSaved(true);
    // The account menu shows the new name at once.
    forgetAccount();
    await router.invalidate();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-6">
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>Display name</Label>
        <Input
          id={`${id}-name`}
          value={name}
          autoComplete="nickname"
          className="max-w-sm"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
          onChange={(event) => {
            setName(clipLength(event.target.value, maxNameLength));
            setError(undefined);
            setSaved(false);
          }}
          onBlur={() => void save()}
        />
        <p id={`${id}-hint`} className="text-small text-fg-secondary">
          People you share with see this name instead of your email. It's optional until you share.
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
            {error}
          </p>
        )}
        <output className="text-small text-fg-secondary empty:hidden">
          {saved ? "Saved." : ""}
        </output>
      </form>
      <AvatarColor name={account.displayName ?? account.email} saved={account.avatarHue} />
      <About saved={account.about ?? ""} />
      <FavoriteAlbums />
    </div>
  );
}

/** The hues' names, in order (DS-93). */
const hueNames: Record<AvatarHue, string> = {
  0: "Rose",
  30: "Red",
  60: "Orange",
  90: "Ochre",
  120: "Olive",
  150: "Green",
  180: "Teal",
  210: "Cyan",
  240: "Sky",
  270: "Blue",
  300: "Violet",
  330: "Magenta",
};

/** The avatar's color (FR-11.16): Automatic, from the name, or one of 12 hues, each a round swatch with the letter. */
function AvatarColor({ name, saved }: { name: string; saved: number | null }) {
  const router = useRouter();
  const id = useId();
  const [chosen, setChosen] = useState(saved);
  const { run, error } = useSend();
  async function choose(avatarHue: number | null) {
    setChosen(avatarHue);
    if (await run({ name: "account.setAvatarColor", args: { avatarHue } })) {
      setChosen(saved);
      return;
    }
    // The account menu shows the new color at once.
    forgetAccount();
    await router.invalidate();
  }
  const options: { hue: number | null; label: string }[] = [
    { hue: null, label: "Automatic" },
    ...avatarHues.map((hue) => ({ hue, label: hueNames[hue] })),
  ];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-hint`}>
      <legend className="mb-1.5 text-base font-medium text-fg-primary">Avatar color</legend>
      <div className="flex max-w-sm flex-wrap gap-2">
        {options.map(({ hue, label }) => (
          <label
            key={label}
            title={label}
            className="relative flex size-11 cursor-pointer items-center justify-center rounded-full has-checked:ring-2 has-checked:ring-accent-solid has-focus-visible:outline-2 has-focus-visible:outline-accent-solid"
          >
            <input
              type="radio"
              name={`${id}-hue`}
              aria-label={label}
              checked={chosen === hue}
              onChange={() => void choose(hue)}
              className="sr-only"
            />
            {/* Clicks reach the label, which picks the radio. */}
            <Avatar name={name} hue={hue} className="pointer-events-none size-9 text-base" />
          </label>
        ))}
      </div>
      <p id={`${id}-hint`} className="text-small text-fg-secondary">
        Automatic picks a color from your name. Every color keeps the letter easy to read.
      </p>
      {error && (
        <p role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** The About text (FR-11.16): plain, at most 160 characters, saved when left or on Enter; blank clears it. */
function About({ saved }: { saved: string }) {
  const router = useRouter();
  const id = useId();
  const [about, setAbout] = useState(saved);
  const [done, setDone] = useState(false);
  const { run, busy, error, setError } = useSend();
  async function save() {
    if (busy || about.trim() === saved) return;
    setDone(false);
    if (await run({ name: "account.setAbout", args: { about } })) return;
    setDone(true);
    forgetAccount();
    await router.invalidate();
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-1.5"
    >
      <Label htmlFor={`${id}-about`}>About</Label>
      <Input
        id={`${id}-about`}
        value={about}
        className="max-w-xl"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
        onChange={(event) => {
          setAbout(clipLength(event.target.value, maxAboutLength));
          setError(undefined);
          setDone(false);
        }}
        onBlur={() => void save()}
      />
      <p id={`${id}-hint`} className="text-small text-fg-secondary">
        A line about you and your music, up to {maxAboutLength} characters ({textLength(about)}{" "}
        now). People you invite, and people whose invitations you accept, see it.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-small text-status-danger">
          {error}
        </p>
      )}
      <output className="text-small text-fg-secondary empty:hidden">{done ? "Saved." : ""}</output>
    </form>
  );
}
