// The invented albums' covers (TON-155, DS-120): set 1, "Label series", the creator's choice. One house style, like a
// label's catalogue: a flat ground, one geometric motif, the artist and title at the top left and a catalogue number.
// Inline SVG on a 200-unit square, so the covers take the page's fonts and stay crisp at any size. Their colors are
// the artwork's own (DS-04), not tokens. A fine grain is drawn from 64 px, where it shows.

import { useId, type ReactNode } from "react";

import { cn } from "@tonaris/ui/lib/utils";

import { albumById, type AlbumId } from "./albums";

type Design = {
  ground: string;
  ink: string;
  motif: ReactNode;
  /** The catalogue number's corner and color, when not the bottom right in the ink. */
  number?: { top?: boolean; ink?: string };
  grain: number;
};

const dots = [46, 64, 82, 100, 118, 136, 154].flatMap((x) =>
  [64, 82, 100, 118, 136, 154].map((y) => ({ x, y })),
);
/** A night bus's seven windows, some lit dimmer; the last is a little wider. */
const busWindows = [1, 0.3, 1, 1, 0.3, 0.6, 1].map((opacity, index) => ({
  x: 14 + index * 25,
  opacity,
}));
const violets = [
  "#4b2f8f",
  "#5a3aa3",
  "#6a46b8",
  "#7b55cc",
  "#8d66dd",
  "#a07aea",
  "#b490f4",
  "#c9a8ff",
];

const designs: Record<AlbumId, Design> = {
  tide: {
    ground: "#cfdfdb",
    ink: "#1f3a3d",
    grain: 0.18,
    motif: (
      <>
        <circle cx="140" cy="84" r="18" fill="#f4efe6" />
        {[1, 0.85, 0.7, 0.55, 0.4, 0.25].map((opacity, index) => (
          <line
            key={opacity}
            x1="14"
            x2="186"
            y1={122 + index * 10}
            y2={122 + index * 10}
            stroke="#2f5d62"
            strokeWidth="1.2"
            opacity={opacity}
          />
        ))}
      </>
    ),
  },
  bus: {
    ground: "#1c1e2a",
    ink: "#ece6da",
    grain: 0.22,
    motif: (
      <>
        {busWindows.map(({ x, opacity }) => (
          <rect
            key={x}
            x={x}
            y="116"
            width={x === 164 ? 22 : 19}
            height="13"
            rx="2"
            fill="#e8a33d"
            opacity={opacity}
          />
        ))}
        <line x1="14" x2="186" y1="140" y2="140" stroke="#e8a33d" opacity="0.5" />
      </>
    ),
  },
  machines: {
    ground: "#e5e2da",
    ink: "#1b1b1b",
    grain: 0.18,
    motif: (
      <>
        {dots.map(({ x, y }) =>
          x === 118 && y === 136 ? null : (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#1b1b1b" />
          ),
        )}
        <circle cx="118" cy="136" r="4.5" fill="#d6452f" />
      </>
    ),
  },
  field: {
    ground: "#efe9df",
    ink: "#2b2a28",
    grain: 0.18,
    motif: (
      <>
        <circle cx="100" cy="126" r="52" fill="none" stroke="#2b2a28" strokeWidth="0.8" />
        <line x1="14" x2="186" y1="126" y2="126" stroke="#2b2a28" strokeWidth="0.8" />
        <circle cx="100" cy="74" r="4" fill="#c4553b" />
      </>
    ),
  },
  bluehour: {
    ground: "#23407a",
    ink: "#f4f1ea",
    grain: 0.2,
    number: { top: true },
    motif: (
      <>
        <path d="M40 186A60 60 0 0 1 160 186Z" fill="#f2c14e" />
        <rect x="30" y="150" width="140" height="3" fill="#23407a" />
        <rect x="30" y="161" width="140" height="4" fill="#23407a" />
        <rect x="30" y="173" width="140" height="5" fill="#23407a" />
        <line x1="14" x2="186" y1="186" y2="186" stroke="#f2c14e" />
      </>
    ),
  },
  bloom: {
    ground: "#ecc3cf",
    ink: "#3a1c2a",
    grain: 0.2,
    motif: (
      <>
        <circle
          cx="82"
          cy="116"
          r="38"
          fill="#d0507f"
          opacity="0.85"
          className="mix-blend-multiply"
        />
        <circle
          cx="118"
          cy="116"
          r="38"
          fill="#7a5cc4"
          opacity="0.85"
          className="mix-blend-multiply"
        />
        <circle
          cx="100"
          cy="146"
          r="38"
          fill="#f08a5d"
          opacity="0.85"
          className="mix-blend-multiply"
        />
      </>
    ),
  },
  suns: {
    ground: "#e9c46a",
    ink: "#2d2414",
    grain: 0.2,
    number: { ink: "#efe2c4" },
    motif: (
      <>
        <circle cx="100" cy="112" r="30" fill="#cf5b35" />
        <path d="M0 200L0 160Q60 128 120 156T200 148L200 200Z" fill="#5b6b3a" />
      </>
    ),
  },
  garden: {
    ground: "#a2a19b",
    ink: "#121212",
    grain: 0.3,
    motif: (
      <>
        <rect x="64" y="70" width="72" height="72" fill="#3f7d4e" />
        <rect x="100" y="132" width="72" height="14" fill="#121212" />
      </>
    ),
  },
  uv: {
    ground: "#261642",
    ink: "#efe8ff",
    grain: 0.22,
    number: { top: true },
    motif: (
      <>
        {violets.map((fill, index) => (
          <rect
            key={fill}
            x={30 + index * 18}
            y={70 + index * 12}
            width="8"
            height={116 - index * 12}
            fill={fill}
          />
        ))}
      </>
    ),
  },
  radio: {
    ground: "#f2efe8",
    ink: "#1a1a1a",
    grain: 0.18,
    motif: (
      <g fill="none" strokeWidth="6">
        {[40, 60, 80, 100, 120].map((radius, index) => (
          <path
            key={radius}
            d={`M0 ${200 - radius}A${radius} ${radius} 0 0 1 ${radius} 200`}
            stroke={index % 2 === 0 ? "#e04f3c" : "#1f4e79"}
          />
        ))}
      </g>
    ),
  },
};

/** An invented album's cover, `size` px square. Decorative: the album's name is always beside it or in a label. */
export function Cover({
  album,
  size,
  className,
}: {
  album: AlbumId;
  size: number;
  className?: string;
}) {
  const grainId = `${useId().replace(/[^\w-]/g, "")}-grain`;
  const { ground, ink, motif, number, grain } = designs[album];
  const { artist, title, number: catalogue } = albumById(album);
  const grained = size >= 64;
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn("shrink-0 font-sans", className)}
    >
      {grained && (
        <defs>
          <filter id={grainId} filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves={3}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      )}
      <rect width="200" height="200" fill={ground} />
      {motif}
      <text x="14" y="24" fontSize="8.5" fontWeight="600" fill={ink}>
        {artist}
      </text>
      <text x="14" y="35" fontSize="8.5" fill={ink}>
        {title}
      </text>
      <text
        x="186"
        y={number?.top ? 24 : 190}
        textAnchor="end"
        fontSize="6"
        fill={number?.ink ?? ink}
        opacity="0.65"
        className="font-mono"
      >
        {catalogue}
      </text>
      {grained && (
        <rect
          width="200"
          height="200"
          filter={`url(#${grainId})`}
          opacity={grain}
          className="mix-blend-overlay"
        />
      )}
    </svg>
  );
}
