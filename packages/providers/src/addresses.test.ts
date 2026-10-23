import { describe, expect, test } from "bun:test";

import { isPublicAddress } from "./addresses";

describe("isPublicAddress (TS-103)", () => {
  test("public IPv4 and IPv6 addresses, as the services answered on 24 October 2026", () => {
    for (const address of [
      "13.33.235.121", // tidal.com
      "44.252.253.233", // spotify.link
      "2.22.145.99", // www.qobuz.com
      "2a01:4f8:c011:f68::1", // musicbrainz.org
      "2a02:26f0:e2:581::2a1", // itunes.apple.com
      "8.8.8.8",
      "1.1.1.1",
      "100.63.255.255", // just below CGNAT
      "100.128.0.0", // just above it
      "172.15.255.255",
      "172.32.0.0",
      "::ffff:8.8.8.8",
      "64:ff9b::808:808", // NAT64 of 8.8.8.8
      "2001:4860:4860::8888",
      "2606:4700:4700::1111",
    ]) {
      expect([address, isPublicAddress(address)]).toEqual([address, true]);
    }
  });

  test("private, loopback, link-local, metadata, CGNAT and special-purpose addresses", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "100.100.100.200", // Alibaba Cloud metadata
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254", // AWS, GCP and Azure metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.170",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.7",
      "203.0.113.9",
      "224.0.0.251",
      "239.255.255.250",
      "255.255.255.255",
      "::",
      "::1",
      "::127.0.0.1", // IPv4-compatible
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
      "64:ff9b::7f00:1", // NAT64 of 127.0.0.1
      "64:ff9b::a9fe:a9fe",
      "64:ff9b:1::1", // local-use NAT64
      "100::1", // discard
      "fc00::1",
      "fd00:ec2::254", // AWS metadata over IPv6
      "fe80::1",
      "fe80::1%en0",
      "fec0::1",
      "ff02::1",
      "2001::1", // Teredo
      "2001:db8::1",
      "2002:7f00:1::1", // 6to4 of 127.0.0.1
      "3fff::1",
      "FE80::ABCD",
    ]) {
      expect([address, isPublicAddress(address)]).toEqual([address, false]);
    }
  });

  test("anything that isn't an IP address", () => {
    for (const address of [
      "",
      "localhost",
      "example.com",
      "127.1",
      "2130706433",
      "0x7f.1",
      "1.2.3.256",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });
});
