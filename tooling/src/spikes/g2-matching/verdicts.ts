// The TON-18 corpus's hand-made parts: artists added for their hard cases, and the verdicts a person gave the
// same-title pairs build.ts listed in review.md. A verdict overrides the heuristic in corpus.ts.

import { pairKey } from "./corpus";

/** Artists known for albums that share a title, or for one album MusicBrainz keeps under two release groups. */
export const curatedArtists: readonly { id: string; name: string; why: string }[] = [
  {
    id: "6fe07aa5-fec0-4eca-a456-f29bff451b04",
    name: "Weezer",
    why: "six different albums called Weezer",
  },
  {
    id: "8e66ea2b-b57b-47d9-8df0-df4630aeb8e5",
    name: "Peter Gabriel",
    why: "four different albums called Peter Gabriel",
  },
  {
    id: "20244d07-534f-4eff-b4d4-930878889970",
    name: "Taylor Swift",
    why: "re-recorded albums: Fearless and Fearless (Taylor's Version)",
  },
  {
    id: "5700dcd4-c139-4f31-aa3e-6382b9af9032",
    name: "Kraftwerk",
    why: "German and English titles of one album",
  },
  {
    id: "a466c2a2-6517-42fb-a160-1087c3bafd9f",
    name: "Slipknot",
    why: "two release groups called Iowa (TON-16)",
  },
  {
    id: "33d281da-d36f-4d22-9c4f-fa39f9718302",
    name: "Trust",
    why: "Idéal and Trust IV (TON-16); Le Best-Of and Le Best of (TON-15)",
  },
  {
    id: "5b11f4ce-a62d-471e-81fc-a69a8278c7da",
    name: "Nirvana",
    why: "Nevermind and its 30th-anniversary super deluxe edition",
  },
];

/**
 * Reviewed pairs, by pairKey: whether the two release groups are one album, and why. Reviewed on 19 October 2026
 * against their releases' track lists in MusicBrainz.
 */
export const verdicts: Readonly<Record<string, { same: boolean; note: string }>> = {
  [pairKey("1b022e01-4da6-387b-8658-8678046e4cef", "90ec25eb-ba01-42b4-ba12-0b450cd92cc3")]: {
    same: true,
    note: "a super deluxe edition holding the whole album, typed as a compilation",
  },
  [pairKey("09e08722-be36-4143-898d-93e90389c499", "a848f837-06ab-418e-ae4b-6d32f46db297")]: {
    same: true,
    note: "one compilation entered twice: 16 of 17 tracks",
  },
  [pairKey("2fc2fe97-597c-45f4-99c6-87261b00d4ee", "6f1c8b03-1576-4f27-bd9d-cb209328895d")]: {
    same: true,
    note: "one EP entered twice, once with two bonus remixes",
  },
  [pairKey("066e3c89-5f92-399e-b575-46128e178a18", "ac1a5ea2-751e-4bca-853f-62464c88915f")]: {
    same: true,
    note: "a 2005 reissue holding the whole album, plus three tracks",
  },
  [pairKey("1865453d-3e87-4265-afe1-7111b9054066", "b1f5d62c-705b-4357-abfb-2a169a50d0aa")]: {
    same: true,
    note: "one concert: 12 of the 13 tracks, issued again in 2018",
  },
  [pairKey("b3381ecf-a620-4598-9b47-2e987416497f", "e5d84d8d-4b50-4467-8b2c-95143dfa793c")]: {
    same: true,
    note: "the live album expanded in 1992: 10 of its 11 tracks plus eight",
  },
  [pairKey("40fa1a54-e679-31f1-a9fc-00ee649a9b74", "c309605a-89a2-3291-81b6-2fbad8ad7d99")]: {
    same: true,
    note: "the 12-inch edition of the 10-inch album, with four more songs",
  },
  [pairKey("3111a250-c233-47cb-acdc-5bb36f52f676", "c1da9586-f716-4f20-89ac-a65a23a29a63")]: {
    same: false,
    note: "a 10-CD box set and a 20-track sampler from it",
  },
  [pairKey("302415fb-9625-42ba-824d-63deab444bea", "ae115542-45c1-4deb-95af-ddeb957d2873")]: {
    same: true,
    note: "the US and European editions of one compilation, three tracks swapped",
  },
  [pairKey("017f2a37-a78f-3578-9611-fa40408e5d90", "f62869e0-7058-49f8-ac05-733c1a326fb1")]: {
    same: false,
    note: "a four-track Record Store Day EP of the album's songs",
  },
  [pairKey("3131932b-bc2f-3c6a-a08c-23a5ae95ec27", "6704f186-f0de-4f7a-8294-ea0469cd9667")]: {
    same: false,
    note: "the UK and US debut albums: 7 of 12 tracks shared",
  },
  [pairKey("87b57140-93c1-47df-bb9a-4d2c3f1014c9", "8a98a17e-0687-3b3a-89d7-3d2de2dab3d0")]: {
    same: false,
    note: "two EPs with no track in common",
  },
  [pairKey("db4f3d8a-c98d-4579-8212-109888ef39b6", "ffce86dd-49b1-4315-be4a-827da360ce46")]: {
    same: false,
    note: "two compilations, 5 tracks shared",
  },
  [pairKey("699a2639-e1b6-45af-91b1-dbe55e0fc41d", "977eed35-9b01-3217-b10e-79979051eb72")]: {
    same: false,
    note: "the UK and US albums: 2 tracks shared",
  },
  [pairKey("15c2abf9-7122-4968-92dc-eb88b71566cd", "3cb39fef-4123-47ff-a882-1656286b6258")]: {
    same: false,
    note: "the film soundtrack and the off-Broadway cast recording",
  },
  [pairKey("1a5ae023-9cd4-431d-8176-d93515e63549", "c27987a9-d3bb-4929-8526-d3507e92a041")]: {
    same: false,
    note: "the Black Album and the Teal Album",
  },
  [pairKey("d4666896-ec04-458c-990a-c1aa52365313", "dcbb0d02-9d95-3234-8389-44e15e8e955e")]: {
    same: false,
    note: "a compilation of the first two albums, and the fourth album",
  },
  [pairKey("4e6f2a81-ec6d-378c-a824-0cd0538bbb21", "d4666896-ec04-458c-990a-c1aa52365313")]: {
    same: false,
    note: "a two-album set holding this album and the next",
  },
  [pairKey("7683e0d7-3b1b-3300-8ee4-ee0ad1d6a308", "d4666896-ec04-458c-990a-c1aa52365313")]: {
    same: false,
    note: "a two-album set holding this album and the previous one",
  },
  [pairKey("0441b1b2-de57-4a9a-b007-1f6e159921d5", "ba1259eb-d41e-41c5-a70c-0e6fa73e6708")]: {
    same: false,
    note: "a re-recording (Taylor's Version)",
  },
  [pairKey("1c4770b3-b7a3-4d44-a7a9-8e2dbb74b85a", "4d9ec1c2-58ec-48a4-aa0a-916718adead0")]: {
    same: false,
    note: "a re-recording (Taylor's Version)",
  },
  [pairKey("63eba062-847c-3b73-8b0f-6baf27bba6fa", "d2e4838d-90e1-471c-bda0-fd816dabb2d4")]: {
    same: false,
    note: "a re-recording (Taylor's Version)",
  },
  [pairKey("67727253-f1c0-4243-9270-f9f1401c3b8c", "a73cecde-0923-40ad-aad1-e8c24ba6c3d2")]: {
    same: false,
    note: "a re-recording (Taylor's Version)",
  },
};
