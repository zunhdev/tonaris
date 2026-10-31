// A software authenticator for tests (TON-143): it answers WebAuthn's ceremonies as a browser and a password
// manager would, so the API's passkey endpoints run end to end. It holds one P-256 key from WebCrypto, attests with
// `none`, and writes the little CBOR that needs. Import from tests only.

/** The authenticator data's flags (WebAuthn §6.1). */
export const flags = {
  userPresent: 0x01,
  userVerified: 0x04,
  backupEligible: 0x08,
  backedUp: 0x10,
  attestedCredential: 0x40,
} as const;

/** A synced passkey that checked the person: what a phone's or a password manager's passkeys answer. */
const verified = flags.userPresent | flags.userVerified | flags.backupEligible | flags.backedUp;

/** Google Password Manager's AAGUID, which the plugin knows by name. */
export const googlePasswordManager = "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4";

/** Apple's and other privacy-minded authenticators' AAGUID: no model at all. */
export const anonymousAaguid = "00000000-0000-0000-0000-000000000000";

type RegistrationOptions = { challenge: string; rp: { id?: string }; user: { id: string } };
type AuthenticationOptions = { challenge: string; rpId?: string };

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const text = (value: string) => new TextEncoder().encode(value);
const sha256 = (data: Uint8Array) =>
  new Uint8Array(new Bun.CryptoHasher("sha256").update(data).digest());
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const uint32 = (value: number) =>
  new Uint8Array([value >>> 24, value >>> 16, value >>> 8, value].map((b) => b & 0xff));

type Cbor = number | string | Uint8Array | Map<Cbor, Cbor>;

/** A CBOR item's head: its major type and argument (RFC 8949 §3). */
function head(major: number, argument: number): Uint8Array {
  const type = major << 5;
  if (argument < 24) return new Uint8Array([type | argument]);
  if (argument < 0x100) return new Uint8Array([type | 24, argument]);
  if (argument < 0x10000) return new Uint8Array([type | 25, argument >> 8, argument & 0xff]);
  return concat(new Uint8Array([type | 26]), uint32(argument));
}

/** Integers, byte and text strings, and maps: all an attestation object and a COSE key hold. */
function cbor(value: Cbor): Uint8Array {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") return concat(head(3, text(value).length), text(value));
  if (value instanceof Uint8Array) return concat(head(2, value.length), value);
  return concat(
    head(5, value.size),
    ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]),
  );
}

/** A DER INTEGER for one half of a signature: no leading zeros, and one if the high bit is set. */
function derInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  const trimmed = bytes.slice(start);
  const value = (trimmed[0] ?? 0) & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
  return concat(new Uint8Array([0x02, value.length]), value);
}

/** WebCrypto signs ECDSA as `r || s`; WebAuthn carries it as a DER SEQUENCE of two INTEGERs. */
function derSignature(raw: Uint8Array): Uint8Array {
  const body = concat(derInteger(raw.slice(0, 32)), derInteger(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

function aaguidBytes(aaguid: string): Uint8Array {
  return new Uint8Array(Buffer.from(aaguid.replaceAll("-", ""), "hex"));
}

/**
 * One authenticator holding one credential. `register` answers `navigator.credentials.create`'s options, and
 * `authenticate` answers `get`'s, both from `origin`, the page's.
 */
export async function softAuthenticator({
  origin,
  aaguid = googlePasswordManager,
}: {
  origin: string;
  aaguid?: string;
}) {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const coseKey = cbor(
    new Map<Cbor, Cbor>([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, new Uint8Array(Buffer.from(jwk.x ?? "", "base64url"))],
      [-3, new Uint8Array(Buffer.from(jwk.y ?? "", "base64url"))],
    ]),
  );
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const id = base64url(credentialId);
  let userHandle: string | undefined;

  const clientData = (type: "webauthn.create" | "webauthn.get", challenge: string) =>
    text(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const rpIdHash = (rpId: string | undefined) => sha256(text(rpId ?? new URL(origin).hostname));

  return {
    /** The credential's ID, as the API's responses and the passkey row carry it. */
    id,

    register(options: RegistrationOptions, flagBits: number = verified) {
      userHandle = options.user.id;
      const authData = concat(
        rpIdHash(options.rp.id),
        new Uint8Array([flagBits | flags.attestedCredential]),
        uint32(0),
        aaguidBytes(aaguid),
        new Uint8Array([credentialId.length >> 8, credentialId.length & 0xff]),
        credentialId,
        coseKey,
      );
      const attestationObject = cbor(
        new Map<Cbor, Cbor>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: base64url(clientData("webauthn.create", options.challenge)),
          attestationObject: base64url(attestationObject),
          transports: ["internal", "hybrid"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    async authenticate(options: AuthenticationOptions, flagBits: number = verified) {
      const data = clientData("webauthn.get", options.challenge);
      const authenticatorData = concat(
        rpIdHash(options.rpId),
        new Uint8Array([flagBits]),
        uint32(0),
      );
      const signed = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          concat(authenticatorData, sha256(data)),
        ),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: base64url(data),
          authenticatorData: base64url(authenticatorData),
          signature: base64url(derSignature(signed)),
          ...(userHandle ? { userHandle } : {}),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}

export type SoftAuthenticator = Awaited<ReturnType<typeof softAuthenticator>>;
