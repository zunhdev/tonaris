// Help's sections (FR-16.1, DS-122): named for what people want to do, not for how the app is built, in the order
// the sidebar and the home show them. A page's section is the folder it sits in, under content/. Plain data, so
// the page list's generator (scripts/help-pages.ts) reads it too.

export const helpSections = [
  { id: "start-here", title: "Start here", color: "accent", icon: "book" },
  { id: "add-albums", title: "Add albums", color: "green", icon: "add" },
  { id: "organize", title: "Organize", color: "amber", icon: "folder" },
  { id: "browse", title: "Browse and find", color: "teal", icon: "grid" },
  { id: "fields", title: "Your own fields", color: "orange", icon: "tag" },
  { id: "share", title: "Share", color: "blue", icon: "users" },
  { id: "trash", title: "Trash and undo", color: "red", icon: "trash" },
  { id: "agents", title: "AI agents", color: "violet", icon: "sparkles" },
  { id: "phone", title: "Your phone", color: "pink", icon: "phone" },
  { id: "account", title: "Your account and data", color: "accent", icon: "user" },
  { id: "saving", title: "Saving and syncing", color: "teal", icon: "sync" },
  { id: "reference", title: "Reference", color: "neutral", icon: "keyboard" },
  { id: "help", title: "Help", color: "neutral", icon: "buoy" },
] as const;

export type HelpSection = (typeof helpSections)[number];
export type HelpSectionId = HelpSection["id"];
export type HelpColor = HelpSection["color"];
export type HelpIcon = HelpSection["icon"];

/** Where a page works: anywhere, or on a computer only, which its tag says (FR-16.2). */
export const helpDevices = ["any", "computer"] as const;
export type HelpDevice = (typeof helpDevices)[number];

export type HelpHeading = { id: string; text: string; depth: 2 | 3 };

/** What the page list knows of a page without loading it: enough for the sidebar, the home and On this page. */
export type HelpPageMeta = {
  slug: string;
  section: HelpSectionId;
  title: string;
  summary: string;
  order: number;
  device: HelpDevice;
  /** Words people may search with that the page doesn't use itself (TON-314). */
  keywords: readonly string[];
  related: readonly string[];
  headings: readonly HelpHeading[];
};
