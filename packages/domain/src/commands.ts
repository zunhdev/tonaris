// The commands a mutation runs (TS-20 step 4): authorization, invariants and field-level compare-and-set
// (TS-21), against a store the database layer implements inside the owner's write transaction (TS-02).
// A command decides; it never commits. Rejections change nothing (X-05). Each aggregate's commands live in its own
// module; `runCommand` sends every mutation to its command.

import { createAlbum, setArtwork, updateAlbum, type Album } from "./albums";
import { captureAlbum, type CaptureSource } from "./capture";
import type { CollectionStore } from "./collection-store";
import {
  createContainer,
  describeContainer,
  moveContainer,
  renameContainer,
  type Container,
} from "./containers";
import { deleteField } from "./field-deletion";
import {
  addFieldOption,
  changeFieldType,
  removeFieldOption,
  renameFieldOption,
} from "./field-options";
import { applyField, removeField, setFieldValue, type FieldValue } from "./field-values";
import { createField, renameField, type CustomField } from "./fields";
import { addMembership, removeMembership, type Membership } from "./memberships";
import type { Outcome } from "./outcomes";
import { setOrder, type Position } from "./positions";
import type { Principal } from "./principals";
import { removeLink, setLink, type PreparedLink, type ServiceLink } from "./service-links";
import {
  acceptInvitation,
  declineInvitation,
  inviteToShare,
  leaveShare,
  removeReference,
  resendInvitation,
  revokeGrant,
  saveLink,
  setDisplayName,
  setShareLink,
  type Reference,
} from "./sharing";
import type { ChangeOp, Mutation, MutationName } from "./sync";
import { deleteAlbum, deleteContainer, purgeUnits, recoverUnit, type TrashUnit } from "./trash";
import {
  setDefaults,
  setHiddenServices,
  setLinkTarget,
  setView,
  type AccountDefaults,
  type ViewPrefs,
} from "./views";

/** A change for the account's log; the database layer gives it its `seq`. */
export type ChangeInput =
  | { entity: "album"; id: string; op: ChangeOp; data: Album | null }
  | { entity: "container"; id: string; op: ChangeOp; data: Container | null }
  | { entity: "membership"; id: string; op: ChangeOp; data: Membership | null }
  | { entity: "link"; id: string; op: ChangeOp; data: ServiceLink | null }
  | { entity: "field"; id: string; op: ChangeOp; data: CustomField | null }
  | { entity: "fieldValue"; id: string; op: ChangeOp; data: FieldValue | null }
  | { entity: "view"; id: string; op: ChangeOp; data: ViewPrefs | null }
  | { entity: "defaults"; id: string; op: ChangeOp; data: AccountDefaults }
  | { entity: "position"; id: string; op: ChangeOp; data: Position | null }
  | { entity: "trashUnit"; id: string; op: ChangeOp; data: TrashUnit | null }
  | { entity: "reference"; id: string; op: ChangeOp; data: Reference | null };

/** `result` is what the mutation reports in its `confirmed` outcome, if anything, such as `MembershipAddResult`. */
export type CommandResult =
  | { status: "applied"; changes: ChangeInput[]; result?: unknown }
  | Extract<Outcome, { status: "failed" | "conflict" | "needs_input" }>;

/**
 * `now` is the time a command records, such as when an album joined a list; the current time if absent. `capture`
 * is what the API found for an `album.capture` before the lock, and `link` how it read a `link.set`'s URL.
 */
export type CommandContext = {
  principal: Principal;
  store: CollectionStore;
  now?: Date;
  capture?: CaptureSource;
  link?: PreparedLink;
  /** For `share.setLink` turning a link on: its token's hash, prepared with the server's secret (TS-32). */
  shareLink?: { hash: Uint8Array };
};

/** Each mutation, by its name. */
type MutationOf = { [M in Mutation as M["name"]]: M };

/** A command for each mutation, which it receives whole. */
type Handlers = {
  [N in MutationName]: (mutation: MutationOf[N], context: CommandContext) => Promise<CommandResult>;
};

/** The command each mutation runs, in the order of `mutationSchema`. A mutation without one doesn't compile. */
const handlers = {
  "album.create": ({ args }, context) => createAlbum(args, context),
  "album.update": ({ args, base }, context) => updateAlbum(args, base, context),
  "album.setArtwork": ({ args, base }, context) => setArtwork(args, base, context),
  "album.capture": ({ args }, context) => captureAlbum(args, context.capture, context),
  "field.create": ({ args }, context) => createField(args, context),
  "field.rename": ({ args, base }, context) => renameField(args, base, context),
  "fieldValue.apply": ({ args }, context) => applyField(args, context),
  "fieldValue.set": ({ args, base }, context) => setFieldValue(args, base, context),
  "fieldValue.remove": ({ args }, context) => removeField(args, context),
  "field.changeType": ({ args, base }, context) => changeFieldType(args, base, context),
  "field.addOption": ({ args }, context) => addFieldOption(args, context),
  "field.renameOption": ({ args, base }, context) => renameFieldOption(args, base, context),
  "field.removeOption": ({ args }, context) => removeFieldOption(args, context),
  "field.delete": ({ args }, context) => deleteField(args, context),
  "container.create": ({ args }, context) => createContainer(args, context),
  "container.rename": ({ args, base }, context) => renameContainer(args, base, context),
  "container.move": ({ args, base }, context) => moveContainer(args, base, context),
  "container.describe": ({ args, base }, context) => describeContainer(args, base, context),
  "container.delete": ({ args }, context) => deleteContainer(args, context),
  "trash.recover": ({ args }, context) => recoverUnit(args, context),
  "album.delete": ({ args }, context) => deleteAlbum(args, context),
  "trash.purge": ({ args }, context) => purgeUnits(args, context),
  "membership.add": ({ args }, context) => addMembership(args, context),
  "membership.remove": ({ args }, context) => removeMembership(args, context),
  "link.set": ({ args, base }, context) => setLink(args, base, context),
  "link.remove": ({ args, base }, context) => removeLink(args, base, context),
  "view.set": ({ args, base }, context) => setView(args, base, context),
  "defaults.set": ({ args, base }, context) => setDefaults(args, base, context),
  "order.set": ({ args, base }, context) => setOrder(args, base, context),
  "share.invite": ({ args }, context) => inviteToShare(args, context),
  "share.setLink": ({ args }, context) => setShareLink(args, context),
  "account.setDisplayName": ({ args }, context) => setDisplayName(args, context),
  "share.resendInvitation": ({ args }, context) => resendInvitation(args, context),
  "share.accept": ({ args }, context) => acceptInvitation(args, context),
  "share.decline": ({ args }, context) => declineInvitation(args, context),
  "share.leave": ({ args }, context) => leaveShare(args, context),
  "share.revoke": ({ args }, context) => revokeGrant(args, context),
  "share.saveLink": ({ args }, context) => saveLink(args, context),
  "share.removeReference": ({ args }, context) => removeReference(args, context),
  "defaults.setLinkTarget": ({ args, base }, context) => setLinkTarget(args, base, context),
  "defaults.setHiddenServices": ({ args, base }, context) => setHiddenServices(args, base, context),
} satisfies Handlers;

/** Runs `mutation`'s command; the name ties the mutation to its own handler. */
function run<N extends MutationName>(
  name: N,
  mutation: MutationOf[N],
  context: CommandContext,
): Promise<CommandResult> {
  const handler: Handlers[N] = handlers[name];
  return handler(mutation, context);
}

export function runCommand(mutation: Mutation, context: CommandContext): Promise<CommandResult> {
  return run(mutation.name, mutation, context);
}
