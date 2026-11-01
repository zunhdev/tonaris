import { describe, expect, test } from "bun:test";

import { serviceNames } from "@tonaris/domain";

import { providerNames, ProviderUnavailableError, unavailableFailure } from "./errors";

describe("an unavailable provider (TS-27)", () => {
  test("the streaming services go by the names people read everywhere else", () => {
    expect(providerNames.itunes).toBe(serviceNames["apple-music"]);
    expect(providerNames.spotify).toBe(serviceNames.spotify);
    expect(providerNames.qobuz).toBe(serviceNames.qobuz);
    expect(providerNames.tidal).toBe(serviceNames.tidal);
  });

  test("is provider_unavailable, naming the provider and what the person can do", () => {
    const error = new ProviderUnavailableError("coverartarchive", "The archive answered 503");
    expect(unavailableFailure(error)).toMatchObject({
      code: "provider_unavailable",
      problem: {
        status: 503,
        detail: "Couldn't reach the Cover Art Archive. Try again, or enter the details manually.",
      },
    });
    expect(unavailableFailure({ provider: "itunes" }).problem.detail).toBe(
      "Couldn't reach Apple Music. Try again, or enter the details manually.",
    );
  });
});
