// What Tonaris is, beside the sign-in card (TON-116, DS-90): a headline, one sentence, the features that set it apart,
// and that it's invitation-only for now. Plain text and Lucide icons: nothing from other services, nothing tracked.

import { Bot, Download, FolderTree, Share2, type LucideIcon } from "lucide-react";

import { maxContainerDepth } from "@tonaris/domain";

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Bot,
    title: "Your AI agents, through MCP",
    text: "Claude, ChatGPT and Codex can search and organize your collection. Anything destructive waits for your approval.",
  },
  {
    icon: FolderTree,
    title: "Folders within folders, and lists",
    text: `Nest folders up to ${maxContainerDepth} levels deep. An album can be in as many lists as you like.`,
  },
  {
    icon: Share2,
    title: "Share a folder or a list",
    text: "View-only, with the people you invite or anyone with the link. Stop sharing whenever you want.",
  },
  {
    icon: Download,
    title: "Your data stays yours",
    text: "Export everything, Trash included, as JSON and Markdown, at any time.",
  },
];

export const promoTitleId = "promo-title";

export function Promo() {
  return (
    <section aria-labelledby={promoTitleId} className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 id={promoTitleId} className="text-display text-fg-primary">
          Your albums, organized your way
        </h2>
        {/* The size is spelled out: `text-input` names the `input` color token (TON-101). */}
        <p className="text-[0.875rem]/5 text-fg-secondary">
          Paste a link from Spotify, Apple Music, Qobuz or Tidal, and Tonaris fills in the album
          from MusicBrainz. Keep it in folders and lists, share it, and take it with you.
        </p>
      </div>
      <ul className="flex flex-col gap-4">
        {features.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <Icon
              aria-hidden
              strokeWidth={1.5}
              className="mt-0.5 size-5 shrink-0 text-accent-solid"
            />
            <div className="flex flex-col gap-0.5">
              <h3 className="font-medium text-fg-primary">{title}</h3>
              <p className="text-fg-secondary">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-small text-fg-tertiary">Tonaris is invitation-only for now.</p>
    </section>
  );
}
