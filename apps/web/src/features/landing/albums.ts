// The invented albums the landing page's pictures show (TON-155, DS-120), in the order of the list "Late night". None
// is a real album: the Cover Art Archive's images are copyrighted by their owners, so the covers are drawn for these
// instead (covers.tsx), with catalogue numbers TN 001 to TN 010.

export type AlbumId =
  | "tide"
  | "bus"
  | "machines"
  | "field"
  | "bluehour"
  | "bloom"
  | "suns"
  | "garden"
  | "uv"
  | "radio";

export type LandingAlbum = {
  id: AlbumId;
  title: string;
  artist: string;
  year: string;
  /** Its release-type group in the list (DS-43). */
  group: "Album" | "EP" | "Live";
  services: string;
  number: string;
};

export const albums: readonly LandingAlbum[] = [
  {
    id: "bus",
    title: "Night Bus Hymns",
    artist: "Sodium Choir",
    year: "1996",
    group: "Album",
    services: "Spotify, Qobuz",
    number: "TN 002",
  },
  {
    id: "tide",
    title: "Low Tide Archive",
    artist: "Maren Okafor",
    year: "2019",
    group: "Album",
    services: "Apple Music",
    number: "TN 001",
  },
  {
    id: "machines",
    title: "Quiet Machines",
    artist: "Elin Varga",
    year: "2014",
    group: "Album",
    services: "Spotify, Tidal",
    number: "TN 003",
  },
  {
    id: "field",
    title: "Field Notes",
    artist: "Noor Halvorsen",
    year: "2021",
    group: "Album",
    services: "Spotify, Apple Music, Qobuz",
    number: "TN 004",
  },
  {
    id: "bluehour",
    title: "Blue Hour Sessions",
    artist: "Ayo Lindqvist Quartet",
    year: "1961",
    group: "Album",
    services: "Qobuz",
    number: "TN 005",
  },
  {
    id: "bloom",
    title: "Static Bloom",
    artist: "Glass Orchard",
    year: "1993",
    group: "Album",
    services: "Spotify",
    number: "TN 006",
  },
  {
    id: "suns",
    title: "Paper Suns",
    artist: "Wren & the Tall Grass",
    year: "1974",
    group: "Album",
    services: "YouTube Music",
    number: "TN 007",
  },
  {
    id: "garden",
    title: "Concrete Garden",
    artist: "Dela Moreau",
    year: "2011",
    group: "EP",
    services: "Spotify",
    number: "TN 008",
  },
  {
    id: "uv",
    title: "Ultraviolet Commute",
    artist: "Kai Sønder",
    year: "2023",
    group: "EP",
    services: "Tidal",
    number: "TN 009",
  },
  {
    id: "radio",
    title: "Saltwater Radio",
    artist: "Harbour Lights",
    year: "1985",
    group: "Live",
    services: "Apple Music",
    number: "TN 010",
  },
];

export function albumById(id: AlbumId): LandingAlbum {
  const found = albums.find((album) => album.id === id);
  if (!found) throw new Error(`No landing album ${id}`);
  return found;
}

/** The list's albums by release-type group, in the order the groups come (DS-43). */
export const albumGroups = (["Album", "EP", "Live"] as const).map((group) => ({
  group,
  albums: albums.filter((album) => album.group === group),
}));
