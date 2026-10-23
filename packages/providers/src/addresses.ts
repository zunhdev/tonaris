// Which addresses outbound requests may reach (TS-103, Q-05): public unicast only. Private, loopback, link-local
// (cloud metadata at 169.254.169.254 among them), CGNAT, multicast, documentation and other special-purpose ranges
// are refused, so a link or artwork URL can't make the server reach its own network.

import { isIPv4, isIPv6 } from "node:net";

type Range = readonly [network: number, prefix: number];

/** IPv4 ranges that aren't the public internet (IANA's special-purpose registry). */
const blockedV4: readonly Range[] = [
  [v4("0.0.0.0"), 8], // "this network"
  [v4("10.0.0.0"), 8], // private
  [v4("100.64.0.0"), 10], // CGNAT, and Alibaba's metadata at 100.100.100.200
  [v4("127.0.0.0"), 8], // loopback
  [v4("169.254.0.0"), 16], // link-local: AWS, GCP and Azure metadata
  [v4("172.16.0.0"), 12], // private
  [v4("192.0.0.0"), 24], // IETF protocol assignments
  [v4("192.0.2.0"), 24], // documentation
  [v4("192.88.99.0"), 24], // 6to4 relays
  [v4("192.168.0.0"), 16], // private
  [v4("198.18.0.0"), 15], // benchmarking
  [v4("198.51.100.0"), 24], // documentation
  [v4("203.0.113.0"), 24], // documentation
  [v4("224.0.0.0"), 4], // multicast
  [v4("240.0.0.0"), 4], // reserved, and the broadcast address
];

function v4(address: string): number {
  // Callers pass dotted quads that `isIPv4` accepted, so every part is a number from 0 to 255.
  return address.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function inV4Range(address: number, [network, prefix]: Range): boolean {
  const size = 2 ** (32 - prefix);
  return Math.floor(address / size) === Math.floor(network / size);
}

function publicV4(address: number): boolean {
  return !blockedV4.some((range) => inV4Range(address, range));
}

/** The groups of an IPv6 address's part on one side of `::`. */
const hexGroups = (part: string) =>
  part === "" ? [] : part.split(":").map((group) => Number.parseInt(group, 16));

/** The eight 16-bit groups of an IPv6 address that `isIPv6` accepted, without a zone. */
function v6Groups(address: string): number[] {
  let text = address;
  // An embedded dotted quad, as in ::ffff:127.0.0.1, is the last two groups.
  const quad = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (quad) {
    const value = v4(quad);
    text = `${text.slice(0, -quad.length)}${Math.floor(value / 65_536).toString(16)}:${(value % 65_536).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const start = hexGroups(head);
  if (tail === undefined) return start;
  const end = hexGroups(tail);
  return [...start, ...Array<number>(8 - start.length - end.length).fill(0), ...end];
}

function publicV6(groups: number[]): boolean {
  const [a = 0, b = 0] = groups;
  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry an IPv4 address, judged as one.
  const prefix = groups.slice(0, 6).join(":");
  if (prefix === "0:0:0:0:0:65535" || prefix === "100:65435:0:0:0:0") {
    return publicV4((groups[6] ?? 0) * 65_536 + (groups[7] ?? 0));
  }
  // Global unicast is 2000::/3; loopback, link-local, unique-local, multicast and the rest lie outside it.
  if (a < 0x2000 || a > 0x3fff) return false;
  if (a === 0x2001 && b < 0x0200) return false; // IETF protocol assignments, Teredo among them
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x2002) return false; // 6to4
  if (a === 0x3fff && b < 0x1000) return false; // documentation (RFC 9637)
  return true;
}

/** Whether an outbound request may go to `address`, an IP address as DNS answers it. */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return publicV4(v4(address));
  // A zone (fe80::1%en0) only qualifies link-local addresses.
  if (address.includes("%") || !isIPv6(address)) return false;
  return publicV6(v6Groups(address.toLowerCase()));
}
