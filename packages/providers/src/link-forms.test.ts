import { describe, expect, test } from "bun:test";

import { barcodeForms, qobuzBarcode, urlForms } from "./link-forms";

describe("urlForms (TS-41 step 2)", () => {
  test("Spotify: the album's one form", () => {
    expect(urlForms("spotify", "1KVGLuPtrMrLlyy4Je6df7")).toEqual([
      "https://open.spotify.com/album/1KVGLuPtrMrLlyy4Je6df7",
    ]);
  });

  test("Apple Music: the link's storefront first, then the common ones, each once", () => {
    const forms = urlForms("apple-music", "268443092", { storefront: "fi" });
    expect(forms[0]).toBe("https://music.apple.com/fi/album/268443092");
    expect(forms).toContain("https://music.apple.com/us/album/268443092");
    expect(new Set(forms).size).toBe(forms.length);
    expect(forms).toHaveLength(12);
  });

  test("Qobuz: open. and play. forms, and store forms once the slug is known", () => {
    expect(urlForms("qobuz", "mco0vy9isdq4a")).toEqual([
      "https://open.qobuz.com/album/mco0vy9isdq4a",
      "https://play.qobuz.com/album/mco0vy9isdq4a",
    ]);
    const forms = urlForms("qobuz", "mco0vy9isdq4a", {
      locale: "us-en",
      slug: "weezer-teal-album-weezer",
    });
    expect(forms.slice(0, 3)).toEqual([
      "https://open.qobuz.com/album/mco0vy9isdq4a",
      "https://www.qobuz.com/album/weezer-teal-album-weezer/mco0vy9isdq4a",
      "https://www.qobuz.com/us-en/album/weezer-teal-album-weezer/mco0vy9isdq4a",
    ]);
    expect(forms).toContain(
      "https://www.qobuz.com/fr-fr/album/weezer-teal-album-weezer/mco0vy9isdq4a",
    );
    expect(forms.at(-1)).toBe("https://play.qobuz.com/album/mco0vy9isdq4a");
  });

  test("Tidal: the canonical form first, then the older ones", () => {
    expect(urlForms("tidal", "348182611")).toEqual([
      "https://tidal.com/album/348182611",
      "https://tidal.com/browse/album/348182611",
      "http://www.tidal.com/album/348182611",
      "https://listen.tidal.com/album/348182611",
    ]);
  });
});

describe("barcodeForms (TS-41 step 3)", () => {
  test("12, 13 and 14 digits, whichever fit", () => {
    expect(barcodeForms("886443927087")).toEqual([
      "886443927087",
      "0886443927087",
      "00886443927087",
    ]);
    expect(barcodeForms("00886443927087")).toEqual([
      "886443927087",
      "0886443927087",
      "00886443927087",
    ]);
    expect(barcodeForms("5099749522428")).toEqual(["5099749522428", "05099749522428"]);
  });

  test("anything that isn't a barcode has none", () => {
    expect(barcodeForms("mco0vy9isdq4a")).toEqual([]);
    expect(barcodeForms("123")).toEqual([]);
    expect(barcodeForms("123456789012345")).toEqual([]);
  });

  test("a 13-digit Qobuz id is its EAN", () => {
    expect(qobuzBarcode("0884977423006")).toBe("0884977423006");
    expect(qobuzBarcode("tietg8e0jjdh8")).toBeUndefined();
  });
});
