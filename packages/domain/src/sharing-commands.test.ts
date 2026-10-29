// Sharing's commands against an in-memory store (FR-07.1, FR-07.4, FR-07.5, FR-07.16, FR-11.3; TS-32, TS-34): invitations
// for members only, never duplicated or self-made; links on, kept and off for good; the display name needed to share
// and kept while sharing; and all of it app-only.

import { describe, expect, test } from "bun:test";

import { runCommand, type CommandResult } from "./commands";
import type { StoredContainer } from "./containers";
import { uuidv7 } from "./ids";
import type { Principal } from "./principals";
import { mutationSchema, type Mutation } from "./sync";
import { memoryStore } from "./testing";

const owner = uuidv7();
const annaId = uuidv7();
const me: Principal = { kind: "user", userId: owner, role: "user", client: "web" };
const agent: Principal = { kind: "mcp", userId: owner, grantId: uuidv7(), mode: "manage" };

const doom: StoredContainer = {
  id: uuidv7(),
  kind: "list",
  parentId: null,
  name: "Doom",
  description: null,
  ownerId: owner,
  trashed: false,
};

function setup(displayName: string | null = "Denis") {
  const memory = memoryStore({
    containers: [doom],
    accounts: [
      { id: owner, email: "denis@example.com", displayName },
      { id: annaId, email: "anna@example.com" },
    ],
  });
  const run = (mutation: Mutation, principal = me, hash?: Uint8Array): Promise<CommandResult> =>
    runCommand(mutationSchema.parse(mutation), {
      principal,
      store: memory.store,
      ...(hash ? { shareLink: { hash } } : {}),
    });
  return { ...memory, run };
}

const invite = (email: string, grantId = uuidv7()): Mutation => ({
  mutationId: uuidv7(),
  name: "share.invite",
  args: { grantId, containerId: doom.id, email },
});
const setLink = (enabled: boolean, linkId = uuidv7()): Mutation => ({
  mutationId: uuidv7(),
  name: "share.setLink",
  args: { containerId: doom.id, linkId, enabled },
});
const rename = (displayName: string | null): Mutation => ({
  mutationId: uuidv7(),
  name: "account.setDisplayName",
  args: { displayName },
});
const hash = new Uint8Array(32).fill(7);

const codeOf = (result: CommandResult) =>
  result.status === "failed" ? result.code : result.status;

describe("share.invite (FR-07.4, FR-07.5)", () => {
  test("a member is invited, pending, under the address as typed; again, the same invitation", async () => {
    const { run, grants } = setup();
    const grantId = uuidv7();
    const first = await run(invite("  Anna@Example.com ", grantId));
    expect(first).toEqual({
      status: "applied",
      changes: [],
      result: { grantId, status: "pending", emailing: true },
    });
    expect([...grants.values()]).toEqual([
      {
        id: grantId,
        containerId: doom.id,
        granteeId: annaId,
        invitedEmail: "Anna@Example.com",
        status: "pending",
        emailStatus: "sending",
      },
    ]);
    // Inviting again names the same invitation, and sends nothing (FR-07.5).
    const again = await run(invite("anna@example.com"));
    expect(again).toMatchObject({ result: { grantId, status: "pending", emailing: false } });
    expect(grants.size).toBe(1);
  });

  test("nobody without an account, not yourself, not without a display name, not through MCP", async () => {
    const { run, grants } = setup();
    expect(await run(invite("nobody@example.com"))).toMatchObject({
      status: "failed",
      code: "recipient_not_found",
      problem: {
        detail:
          "No Tonaris account uses this email. Invitations only work for existing members — you can share a link instead.",
      },
    });
    expect(codeOf(await run(invite("denis@example.com")))).toBe("validation_failed");
    expect(codeOf(await run(invite("anna@example.com"), agent))).toBe("app_only");
    expect(codeOf(await setup(null).run(invite("anna@example.com")))).toBe("display_name_required");
    expect(codeOf(await setup("   ").run(invite("anna@example.com")))).toBe(
      "display_name_required",
    );
    expect(grants.size).toBe(0);
  });
});

describe("share.setLink (FR-07.1, FR-07.16)", () => {
  test("on makes a link with the prepared hash, on again keeps it, off revokes it, on again is new", async () => {
    const { run, shareLinks } = setup();
    const first = uuidv7();
    expect(await run(setLink(true, first), me, hash)).toMatchObject({ result: { linkId: first } });
    expect(await run(setLink(true), me, hash)).toMatchObject({ result: { linkId: first } });
    expect(shareLinks.get(first)?.tokenHash).toEqual(hash);
    expect(await run(setLink(false))).toMatchObject({ result: { linkId: null } });
    expect(shareLinks.get(first)?.revokedAt).not.toBeNull();
    const second = uuidv7();
    expect(await run(setLink(true, second), me, hash)).toMatchObject({
      result: { linkId: second },
    });
    expect(shareLinks.size).toBe(2);
  });

  test("on needs a display name and the app; off needs neither name nor an active folder", async () => {
    expect(codeOf(await setup(null).run(setLink(true), me, hash))).toBe("display_name_required");
    expect(codeOf(await setup().run(setLink(true), agent, hash))).toBe("app_only");
    const { run, containers } = setup(null);
    expect(codeOf(await run(setLink(false)))).toBe("applied");
    containers.set(doom.id, { ...doom, trashed: true });
    expect(codeOf(await run(setLink(false)))).toBe("applied");
  });
});

describe("account.setDisplayName (FR-11.3, TS-34)", () => {
  test("set and cleared while not sharing; kept while an invitation or a link is open", async () => {
    const { run, accounts } = setup(null);
    expect(await run(rename("  Denis  "))).toMatchObject({ result: { displayName: "Denis" } });
    expect(accounts.get(owner)?.displayName).toBe("Denis");
    expect(codeOf(await run(rename(" ")))).toBe("applied");
    expect(accounts.get(owner)?.displayName).toBeNull();

    await run(rename("Denis"));
    await run(setLink(true), me, hash);
    expect(await run(rename(""))).toMatchObject({
      status: "failed",
      code: "display_name_required",
      problem: { detail: "People you share with see your display name. Stop sharing to clear it." },
    });
    await run(setLink(false));
    await run(invite("anna@example.com"));
    expect(codeOf(await run(rename(null)))).toBe("display_name_required");
    expect(accounts.get(owner)?.displayName).toBe("Denis");
    expect(codeOf(await run(rename("D."), agent))).toBe("app_only");
  });
});

const answer = (
  name: "share.accept" | "share.decline" | "share.resendInvitation",
  grantId: string,
): Mutation => ({
  mutationId: uuidv7(),
  name,
  args: { grantId },
});
const anna: Principal = { kind: "user", userId: annaId, role: "user", client: "web" };

describe("answering invitations (FR-07.5, FR-07.6)", () => {
  test("the recipient accepts: access, a reference, and accepting again changes nothing", async () => {
    const { run, grants, references } = setup();
    const grantId = uuidv7();
    await run(invite("anna@example.com", grantId));
    // The owner can't answer for Anna, nor can her MCP connection.
    expect(codeOf(await run(answer("share.accept", grantId)))).toBe("not_found");
    const agentOfAnna: Principal = {
      kind: "mcp",
      userId: annaId,
      grantId: uuidv7(),
      mode: "manage",
    };
    expect(codeOf(await run(answer("share.accept", grantId), agentOfAnna))).toBe("app_only");
    expect(codeOf(await run(answer("share.accept", grantId), anna))).toBe("applied");
    expect(grants.get(grantId)?.status).toBe("accepted");
    expect([...references.values()]).toEqual([
      { viewerId: annaId, containerId: doom.id, linkId: null },
    ]);
    expect(codeOf(await run(answer("share.accept", grantId), anna))).toBe("applied");
    expect(references.size).toBe(1);
    // An accepted invitation can't be declined, nor resent.
    expect(codeOf(await run(answer("share.decline", grantId), anna))).toBe("not_found");
    expect(codeOf(await run(answer("share.resendInvitation", grantId)))).toBe("not_found");
  });

  test("declining grants nothing; a declined or trashed invitation is no longer available", async () => {
    const { run, grants, references, containers } = setup();
    const declined = uuidv7();
    await run(invite("anna@example.com", declined));
    expect(codeOf(await run(answer("share.decline", declined), anna))).toBe("applied");
    expect(grants.get(declined)?.status).toBe("declined");
    expect(references.size).toBe(0);
    expect(await run(answer("share.accept", declined), anna)).toMatchObject({
      status: "failed",
      code: "not_found",
      problem: { detail: "This invitation is no longer available." },
    });
    const pending = uuidv7();
    await run(invite("anna@example.com", pending));
    containers.set(doom.id, { ...doom, trashed: true });
    expect(codeOf(await run(answer("share.accept", pending), anna))).toBe("not_found");
    expect(grants.get(pending)?.status).toBe("pending");
  });

  test("the owner resends a pending invitation's email", async () => {
    const { run, grants } = setup();
    const grantId = uuidv7();
    await run(invite("anna@example.com", grantId));
    const grant = grants.get(grantId);
    if (grant) grant.emailStatus = "failed";
    expect(await run(answer("share.resendInvitation", grantId))).toMatchObject({
      status: "applied",
      result: { grantId, emailing: true },
    });
    expect(grants.get(grantId)?.emailStatus).toBe("sending");
    expect(codeOf(await run(answer("share.resendInvitation", grantId), anna))).toBe(
      "permission_denied",
    );
  });
});
