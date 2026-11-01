// Text encodings of bytes, the same in Bun and browsers: share-link tokens (TS-32) and image-proxy paths (TS-103).

/** Base64url without padding (RFC 4648 §5). */
export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
