// Folder and list icons (DS-27, TON-306): what each of the domain's `containerIcons` draws, and its name. Lucide has no
// saxophone or violin, so those two are drawn here on its 24 grid, with its round caps and joins, and take the same
// stroke, size and fill as the rest.

import {
  AudioWaveform,
  BoomBox,
  Clapperboard,
  createLucideIcon,
  Disc3,
  Drama,
  Drum,
  FlameKindling,
  Gamepad2,
  GuitarElectric,
  HandMetal,
  Headphones,
  Heart,
  Martini,
  MicVocal,
  Moon,
  Piano,
  Skull,
  Sparkles,
  Star,
  TreePine,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import type { ContainerIconName } from "@tonaris/domain";

const Saxophone = createLucideIcon("saxophone", [
  ["path", { d: "M12 5H9v10a5 5 0 0 0 10 0v-4l2-4h-6.5l1.5 4v4a2 2 0 0 1-4 0z", key: "body" }],
  ["path", { d: "M10.5 5c0-1.5-1-2.5-2.5-2.5H5", key: "neck" }],
]);

const Violin = createLucideIcon("violin", [
  [
    "path",
    {
      d: "M9.6 9.5C7.2 9.5 6.6 11 6.6 12.5S8.4 14.5 8.4 15.5 6 17 6 19s2.4 3 6 3 6-1 6-3-2.4-2.5-2.4-3.5 1.8-1 1.8-3S16.8 9.5 14.4 9.5z",
      key: "body",
    },
  ],
  ["path", { d: "M12 4v14", key: "strings" }],
  ["path", { d: "M10.2 18h3.6", key: "bridge" }],
  ["circle", { cx: "12", cy: "3", r: "1", key: "scroll" }],
]);

/** What each icon draws. */
export const iconGlyphs: Record<ContainerIconName, LucideIcon> = {
  horns: HandMetal,
  skull: Skull,
  guitar: GuitarElectric,
  drum: Drum,
  microphone: MicVocal,
  boombox: BoomBox,
  waveform: AudioWaveform,
  saxophone: Saxophone,
  cocktail: Martini,
  piano: Piano,
  violin: Violin,
  masks: Drama,
  campfire: FlameKindling,
  pine: TreePine,
  wheat: Wheat,
  moon: Moon,
  sparkles: Sparkles,
  star: Star,
  heart: Heart,
  clapperboard: Clapperboard,
  gamepad: Gamepad2,
  record: Disc3,
  headphones: Headphones,
};

/** Each icon's name, as the picker and the activity log say it. */
export const iconNames: Record<ContainerIconName, string> = {
  horns: "Horns",
  skull: "Skull",
  guitar: "Guitar",
  drum: "Drum",
  microphone: "Microphone",
  boombox: "Boombox",
  waveform: "Waveform",
  saxophone: "Saxophone",
  cocktail: "Cocktail",
  piano: "Piano",
  violin: "Violin",
  masks: "Masks",
  campfire: "Campfire",
  pine: "Pine",
  wheat: "Wheat",
  moon: "Moon",
  sparkles: "Sparkles",
  star: "Star",
  heart: "Heart",
  clapperboard: "Clapperboard",
  gamepad: "Gamepad",
  record: "Record",
  headphones: "Headphones",
};
