import { describe, expect, test } from "bun:test";

import { flags, softAuthenticator } from "./passkey-testing";
import { userVerifiedIn } from "./user-verification";

const registration = {
  challenge: "Y2hhbGxlbmdl",
  rp: { id: "tonaris.test" },
  user: { id: "dXNlcg" },
};
const authentication = { challenge: "Y2hhbGxlbmdl", rpId: "tonaris.test" };
const origin = "https://tonaris.test";

describe("userVerifiedIn", () => {
  test("reads the UV flag of a registration's attestation object", async () => {
    const device = await softAuthenticator({ origin });
    expect(userVerifiedIn(device.register(registration))).toBe(true);
    expect(userVerifiedIn(device.register(registration, flags.userPresent))).toBe(false);
  });

  test("reads the UV flag of an authentication's authenticator data", async () => {
    const device = await softAuthenticator({ origin });
    device.register(registration);
    expect(userVerifiedIn(await device.authenticate(authentication))).toBe(true);
    expect(userVerifiedIn(await device.authenticate(authentication, flags.userPresent))).toBe(
      false,
    );
  });

  test("is undefined for an answer it can't read", () => {
    expect(userVerifiedIn(undefined)).toBeUndefined();
    expect(userVerifiedIn({ response: { authenticatorData: "not base64url!" } })).toBeUndefined();
    expect(userVerifiedIn({ response: { clientDataJSON: "e30" } })).toBeUndefined();
    expect(userVerifiedIn({ id: "no response" })).toBeUndefined();
  });
});
