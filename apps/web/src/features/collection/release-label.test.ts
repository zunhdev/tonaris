import { describe, expect, test } from "bun:test";

import { releaseLabel } from "./release-label";

describe("releaseLabel (DS-22)", () => {
  test("a studio album, or one of unknown type, has none", () => {
    expect(releaseLabel({ releaseType: "album", isLive: false })).toBeUndefined();
    expect(releaseLabel({ releaseType: "album", isLive: null })).toBeUndefined();
    expect(releaseLabel({ releaseType: null, isLive: false })).toBeUndefined();
    expect(releaseLabel({ releaseType: null, isLive: null })).toBeUndefined();
  });

  test("an EP, a single and a compilation are named", () => {
    expect(releaseLabel({ releaseType: "ep", isLive: false })).toBe("EP");
    expect(releaseLabel({ releaseType: "single", isLive: null })).toBe("Single");
    expect(releaseLabel({ releaseType: "compilation", isLive: false })).toBe("Compilation");
  });

  test("a live album says Live, after its type when it has one", () => {
    expect(releaseLabel({ releaseType: "album", isLive: true })).toBe("Live");
    expect(releaseLabel({ releaseType: null, isLive: true })).toBe("Live");
    expect(releaseLabel({ releaseType: "compilation", isLive: true })).toBe("Compilation · Live");
    expect(releaseLabel({ releaseType: "ep", isLive: true })).toBe("EP · Live");
    expect(releaseLabel({ releaseType: "single", isLive: true })).toBe("Single · Live");
  });
});
