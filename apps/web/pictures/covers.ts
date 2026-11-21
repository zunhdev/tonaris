// The demo collection's covers (TON-308): the landing page's ten (features/landing/covers.tsx), read from the page
// where they're drawn, and seventeen more here in the same house style, set 1, "Label series" (DS-120): a flat
// ground, one geometric motif, the artist and title at the top left, and a catalogue number. Invented, like their
// albums (tooling/src/demo/collection.ts), so no real artwork appears in the Help pages.

type Design = {
  title: string;
  artist: string;
  number: string;
  ground: string;
  ink: string;
  motif: string;
  /** The catalogue number at the top right, where the motif fills the bottom. */
  numberTop?: boolean;
};

/** The landing page's covers, by the title each is drawn with. */
export const landingCovers: Record<string, string> = {
  "Night Bus Hymns": "bus",
  "Low Tide Archive": "tide",
  "Quiet Machines": "machines",
  "Field Notes": "field",
  "Blue Hour Sessions": "bluehour",
  "Static Bloom": "bloom",
  "Paper Suns": "suns",
  "Concrete Garden": "garden",
  "Ultraviolet Commute": "uv",
  "Saltwater Radio": "radio",
};

const lines = (y: number, count: number, gap: number, stroke: string, width = 1.2) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<line x1="14" x2="186" y1="${y + i * gap}" y2="${y + i * gap}" stroke="${stroke}" stroke-width="${width}" opacity="${(1 - i / count).toFixed(2)}"/>`,
  ).join("");

const rings = (cx: number, cy: number, radii: readonly number[], stroke: string) =>
  radii
    .map(
      (r) =>
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="1"/>`,
    )
    .join("");

const bars = (heights: readonly number[], fill: string) =>
  heights
    .map(
      (h, i) => `<rect x="${22 + i * 16}" y="${186 - h}" width="10" height="${h}" fill="${fill}"/>`,
    )
    .join("");

const wave = (y: number, amplitude: number, stroke: string, width = 1.4) => {
  let d = `M14 ${y}`;
  for (let x = 14; x < 186; x += 24) {
    d += ` q6 ${-amplitude} 12 0 t12 0`;
  }
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
};

const designs: Record<string, Design> = {
  saudade: {
    title: "Saudade Avenue",
    artist: "Lúcia Brandão",
    number: "TN 011",
    ground: "#e9d8c4",
    ink: "#3b2a20",
    motif:
      rings(150, 150, [14, 26, 38, 50, 62], "#2f5d8a") +
      `<circle cx="150" cy="150" r="6" fill="#2f5d8a"/>`,
  },
  koen: {
    title: "Kōen no Asa",
    artist: "Hiro Tanabe Trio",
    number: "TN 012",
    ground: "#f2efe8",
    ink: "#1f1f1f",
    motif: `<circle cx="100" cy="112" r="28" fill="#c8342b"/><line x1="14" x2="186" y1="160" y2="160" stroke="#1f1f1f" stroke-width="0.8"/>`,
  },
  copper: {
    title: "Copper & Salt",
    artist: "Amara Nwosu",
    number: "TN 013",
    ground: "#2a2523",
    ink: "#f1e4d8",
    motif:
      `<path d="M30 186A70 70 0 0 1 170 186Z" fill="#c46b3c"/>` +
      [40, 62, 84, 106, 128, 150]
        .map((x, i) => `<circle cx="${x}" cy="${76 + (i % 2) * 14}" r="2.4" fill="#f1e4d8"/>`)
        .join(""),
    numberTop: true,
  },
  ferry: {
    title: "Midnight Ferry",
    artist: "Coastline Orchestra",
    number: "TN 014",
    ground: "#142235",
    ink: "#e8e2d6",
    motif:
      `<rect x="70" y="112" width="60" height="12" rx="2" fill="#e8a33d"/><rect x="84" y="102" width="24" height="10" rx="2" fill="#e8a33d" opacity="0.7"/>` +
      wave(136, 4, "#6fa3c7") +
      wave(152, 4, "#6fa3c7", 1) +
      wave(168, 4, "#6fa3c7", 0.7),
  },
  telegraph: {
    title: "Desert Telegraph",
    artist: "Sahel Wires",
    number: "TN 015",
    ground: "#d9a35b",
    ink: "#2b1d12",
    motif:
      [40, 100, 160]
        .map(
          (x) =>
            `<line x1="${x}" x2="${x}" y1="70" y2="176" stroke="#2b1d12" stroke-width="2"/><line x1="${x - 10}" x2="${x + 10}" y1="78" y2="78" stroke="#2b1d12" stroke-width="2"/>`,
        )
        .join("") +
      `<path d="M40 80Q70 98 100 80T160 80" fill="none" stroke="#2b1d12" stroke-width="0.8"/><line x1="14" x2="186" y1="176" y2="176" stroke="#2b1d12" stroke-width="1.2"/>`,
  },
  velvet: {
    title: "Velvet Static",
    artist: "Juno Park",
    number: "TN 016",
    ground: "#3a1734",
    ink: "#f3dce9",
    motif: rings(100, 118, [8, 18, 28, 38, 48, 58], "#d65da8"),
  },
  brass: {
    title: "Low Brass Weather",
    artist: "Okonkwo-Reyes Sextet",
    number: "TN 017",
    ground: "#b8862f",
    ink: "#1d160b",
    motif: bars([40, 72, 56, 104, 88, 64, 120, 48, 30, 18], "#1d160b"),
    numberTop: true,
  },
  spiral: {
    title: "Spiral Hymn",
    artist: "Alice Moreno Ensemble",
    number: "TN 018",
    ground: "#0f1f1a",
    ink: "#e5efe7",
    motif: `<path d="M100 120m0 0a6 6 0 0 1 6 6a12 12 0 0 1-12 12a18 18 0 0 1-18-18a24 24 0 0 1 24-24a30 30 0 0 1 30 30a36 36 0 0 1-36 36a42 42 0 0 1-42-42a48 48 0 0 1 48-48" fill="none" stroke="#9fd3b4" stroke-width="1.4"/>`,
  },
  firstlight: {
    title: "First Light Tapes",
    artist: "Dawn Wire",
    number: "TN 019",
    ground: "#f4d7c3",
    ink: "#3a2418",
    motif: `<path d="M50 160A50 50 0 0 1 150 160Z" fill="#e0784a"/>` + lines(164, 4, 6, "#e0784a"),
  },
  harbour: {
    title: "Harbour Songs",
    artist: "Iona MacLeod",
    number: "TN 020",
    ground: "#c9d6d9",
    ink: "#1c2b33",
    motif:
      `<path d="M14 150L62 96L96 136L128 104L186 150Z" fill="#5d7a86"/><rect x="14" y="150" width="172" height="36" fill="#3f5866"/>` +
      `<path d="M92 160h24l-4 6h-16Z" fill="#f4efe6"/><line x1="104" x2="104" y1="146" y2="160" stroke="#f4efe6"/>`,
  },
  roundhouse: {
    title: "Live at the Roundhouse",
    artist: "Stillwater",
    number: "TN 021",
    ground: "#191919",
    ink: "#f0ece4",
    motif:
      `<path d="M100 40L60 170H140Z" fill="#f2c14e" opacity="0.18"/>` +
      rings(100, 170, [30, 44], "#f0ece4") +
      `<circle cx="100" cy="40" r="5" fill="#f2c14e"/>`,
  },
  ojos: {
    title: "Ojos de Agua",
    artist: "Valeria Ruiz",
    number: "TN 022",
    ground: "#0e5c5a",
    ink: "#eef6f2",
    motif: `<circle cx="72" cy="120" r="24" fill="#9fe0d3"/><circle cx="128" cy="120" r="24" fill="#9fe0d3"/><circle cx="76" cy="124" r="8" fill="#0e5c5a"/><circle cx="132" cy="124" r="8" fill="#0e5c5a"/>`,
  },
  orbit: {
    title: "Slow Orbit",
    artist: "Tessellate",
    number: "TN 023",
    ground: "#20233a",
    ink: "#e8e8f4",
    motif: `<ellipse cx="100" cy="120" rx="70" ry="24" fill="none" stroke="#e8e8f4" stroke-width="0.8"/><circle cx="100" cy="120" r="16" fill="#b8a6ff"/><circle cx="166" cy="128" r="5" fill="#e8e8f4"/>`,
  },
  lantern: {
    title: "Lantern Room",
    artist: "Okari Mwangi Quintet",
    number: "TN 024",
    ground: "#7a1f1b",
    ink: "#f6e7cf",
    motif: `<circle cx="100" cy="122" r="44" fill="#f2b84b" opacity="0.2"/><rect x="84" y="96" width="32" height="52" rx="4" fill="#f2b84b"/><line x1="100" x2="100" y1="72" y2="96" stroke="#f6e7cf"/>`,
  },
  sunbleached: {
    title: "Sunbleached",
    artist: "Coral Static",
    number: "TN 025",
    ground: "#f6c9b8",
    ink: "#4a2320",
    motif: `<circle cx="132" cy="96" r="30" fill="#fff3e6"/>` + lines(140, 5, 9, "#d9604c", 2),
  },
  postcards: {
    title: "Tidal Postcards",
    artist: "Lena Ivers",
    number: "TN 026",
    ground: "#e7edf0",
    ink: "#253139",
    motif:
      `<rect x="58" y="78" width="84" height="64" fill="#3f7cac" transform="rotate(-6 100 110)"/>` +
      wave(160, 5, "#3f7cac", 1.6),
  },
  heatwave: {
    title: "Heatwave Radio",
    artist: "Palmyra",
    number: "TN 027",
    ground: "#e1572f",
    ink: "#fff1e0",
    motif: wave(96, 6, "#ffd166", 2) + wave(120, 6, "#ffd166", 2) + wave(144, 6, "#ffd166", 2),
    numberTop: true,
  },
};

/** The cover's SVG, on the landing covers' 200-unit square, with their classes and fine grain. */
function svg(key: string, design: Design, size: number): string {
  const grain = `${key}-grain`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" class="shrink-0 font-sans" data-cover="${key}">`,
    `<defs><filter id="${grain}" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>`,
    `<rect width="200" height="200" fill="${design.ground}"/>`,
    design.motif,
    `<text x="14" y="24" font-size="8.5" font-weight="600" fill="${design.ink}">${design.artist}</text>`,
    `<text x="14" y="35" font-size="8.5" fill="${design.ink}">${design.title.replace("&", "&amp;")}</text>`,
    `<text x="186" y="${design.numberTop ? 24 : 190}" text-anchor="end" font-size="6" fill="${design.ink}" opacity="0.65" class="font-mono">${design.number}</text>`,
    `<rect width="200" height="200" filter="url(#${grain})" opacity="0.2" class="mix-blend-overlay"/>`,
    `</svg>`,
  ].join("");
}

/** The seventeen covers drawn here, by key, as SVG at `size` pixels. */
export function demoCovers(size: number): Record<string, string> {
  return Object.fromEntries(
    Object.entries(designs).map(([key, design]) => [key, svg(key, design, size)]),
  );
}

/** Every demo album's title, by its cover's key, to check the covers match the albums. */
export const coverTitles: Record<string, string> = {
  ...Object.fromEntries(Object.entries(landingCovers).map(([title, key]) => [key, title])),
  ...Object.fromEntries(Object.entries(designs).map(([key, design]) => [key, design.title])),
};
