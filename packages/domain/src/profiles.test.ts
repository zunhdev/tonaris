// A person's profile (FR-11.16, TON-296, TON-297): the avatar's hue, one of 12 or Automatic, the About text, plain and
// at most 160 code points, and up to four favorite albums of their own, all app-only.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import { uuidv7 } from "./ids";
import { maxAboutLength } from "./limits";
import type { Principal } from "./principals";
import { aboutOf } from "./profiles";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const denis = uuidv7();
const me: Principal = { kind: "user", userId: denis, role: "user", client: "web" };
const agent: Principal = { kind: "mcp", userId: denis, grantId: uuidv7(), mode: "manage" };

const albumOf = (ownerId: string, title: string, trashed = false) => ({
  id: uuidv7(),
  ownerId,
  trashed,
  title,
  artistCredit: "Someone",
  releaseType: "album" as const,
  isLive: false,
  originalYear: 1990,
  recordingYearStart: null,
  recordingYearEnd: null,
});
const anna = uuidv7();
const nightfall = albumOf(denis, "Nightfall");
const binned = albumOf(denis, "Binned", true);
const annas = albumOf(anna, "Jazz");

function setup() {
  const memory = memoryStore({
    accounts: [{ id: denis, email: "denis@example.com" }],
    albums: [nightfall, binned, annas],
  });
  const run = (mutation: Mutation, principal: Principal = me): Promise<CommandResult> =>
    runCommand(mutation, { principal, store: memory.store });
  return { ...memory, run };
}

const parse = (name: string, args: object) =>
  mutationSchema.safeParse({ mutationId: uuidv7(), name, args });

describe("the avatar's color (FR-11.16)", () => {
  test("one of 12 hues, or null for Automatic; nothing in between", () => {
    expect(parse("account.setAvatarColor", { avatarHue: 240 }).success).toBe(true);
    expect(parse("account.setAvatarColor", { avatarHue: null }).success).toBe(true);
    expect(parse("account.setAvatarColor", { avatarHue: 45 }).success).toBe(false);
    expect(parse("account.setAvatarColor", { avatarHue: 360 }).success).toBe(false);
  });

  test("saved for the person, in the app only", async () => {
    const { run, accounts } = setup();
    const blue = mutationSchema.parse({
      mutationId: uuidv7(),
      name: "account.setAvatarColor",
      args: { avatarHue: 270 },
    });
    expect(await run(blue, agent)).toMatchObject({ status: "failed", code: "app_only" });
    expect(await run(blue)).toMatchObject({ status: "applied", result: { avatarHue: 270 } });
    expect(accounts.get(denis)?.avatarHue).toBe(270);
  });
});

/** `account.setAbout`, as the app sends it. */
const about = (text: string | null) =>
  mutationSchema.parse({
    mutationId: uuidv7(),
    name: "account.setAbout",
    args: { about: text },
  });

describe("the About text (FR-11.16)", () => {
  test("plain: trimmed, its breaks and runs of spaces as one space, blank as none", () => {
    expect(aboutOf("  Doom and\n\n sludge  ")).toBe("Doom and sludge");
    expect(aboutOf("   ")).toBeNull();
    expect(aboutOf(null)).toBeNull();
  });

  test("at most 160 code points, an emoji one each", () => {
    expect(parse("account.setAbout", { about: "🎸".repeat(maxAboutLength) }).success).toBe(true);
    expect(parse("account.setAbout", { about: "a".repeat(maxAboutLength + 1) }).success).toBe(
      false,
    );
  });

  test("saved for the person, in the app only, and cleared when blank", async () => {
    const { run, accounts } = setup();
    expect(await run(about("Vinyl, mostly."), agent)).toMatchObject({ code: "app_only" });
    expect(await run(about(" Vinyl,   mostly. "))).toMatchObject({
      result: { about: "Vinyl, mostly." },
    });
    expect(accounts.get(denis)?.about).toBe("Vinyl, mostly.");
    await run(about(" "));
    expect(accounts.get(denis)?.about).toBeNull();
  });
});

const favorites = (albumIds: string[]): Mutation =>
  mutationSchema.parse({ mutationId: uuidv7(), name: "account.setFavorites", args: { albumIds } });

describe("favorite albums (FR-11.16, TON-297)", () => {
  test("at most four, each once", () => {
    expect(parse("account.setFavorites", { albumIds: [uuidv7(), uuidv7()] }).success).toBe(true);
    const five = Array.from({ length: 5 }, () => uuidv7());
    expect(parse("account.setFavorites", { albumIds: five }).success).toBe(false);
    const id = uuidv7();
    expect(parse("account.setFavorites", { albumIds: [id, id] }).success).toBe(false);
  });

  test("the person's own albums, one in Trash too, in order; not someone else's, nor through MCP", async () => {
    const { run, favorites: kept } = setup();
    expect(await run(favorites([nightfall.id]), agent)).toMatchObject({ code: "app_only" });
    expect(await run(favorites([nightfall.id, annas.id]))).toMatchObject({
      status: "failed",
      code: "not_found",
    });
    expect(await run(favorites([nightfall.id, uuidv7()]))).toMatchObject({ code: "not_found" });
    expect(kept.get(denis)).toBeUndefined();
    expect(await run(favorites([binned.id, nightfall.id]))).toMatchObject({ status: "applied" });
    expect(kept.get(denis)).toEqual([binned.id, nightfall.id]);
    await run(favorites([]));
    expect(kept.get(denis)).toEqual([]);
  });
});
