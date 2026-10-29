// What a move or a recovery does to sharing (FR-07.9, FR-07.10, FR-07.14; DS-69): who newly sees the content, who no
// longer sees it through the folders it leaves, and which direct shares it keeps. Pure, over the owner's containers
// and their audiences, so the API previews it for the app and MCP can report the same. Nobody is named as losing
// access while another path keeps it: an audience reached both before and after is neither added nor removed.

import { z } from "./zod";

/** The owner's containers and who each is shared with: pending and accepted invitations, and live links. */
export type ImpactState = {
  containers: readonly { id: string; parentId: string | null; name: string; trashed: boolean }[];
  people: readonly { containerId: string; personId: string; name: string; pending: boolean }[];
  links: readonly { containerId: string }[];
};

const viaSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ description: "The folder or list it's shared through." });

export const audienceSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("person"),
      id: z.uuid().meta({ description: "The person's account." }),
      name: z.string().meta({ description: "Their display name, else the address as typed." }),
      pending: z.boolean().meta({ description: "Invited, and not yet accepted." }),
      via: viaSchema,
    }),
    z.object({ kind: z.literal("link"), via: viaSchema }),
  ])
  .meta({ description: "Someone who sees content: an invited person, or anyone with a link." });
export type Audience = z.infer<typeof audienceSchema>;

export const sharingImpactSchema = z
  .object({
    added: z.array(audienceSchema).meta({ description: "Audiences that newly see it." }),
    removed: z.array(audienceSchema).meta({
      description:
        "Audiences that no longer see it through the folders it leaves; none that keep another path.",
    }),
    direct: z
      .array(audienceSchema)
      .meta({ description: "Shares on it and its contents, which it keeps (or which resume)." }),
  })
  .meta({ description: "A move's or a recovery's sharing consequences (DS-69)." });
export type SharingImpact = z.infer<typeof sharingImpactSchema>;

const keyOf = (audience: Audience) =>
  audience.kind === "person" ? `person:${audience.id}` : `link:${audience.via.id}`;

function indexOf(state: ImpactState) {
  const byId = new Map(state.containers.map((container) => [container.id, container]));
  const children = new Map<string, string[]>();
  for (const container of state.containers) {
    if (container.parentId === null || container.trashed) continue;
    children.set(container.parentId, [...(children.get(container.parentId) ?? []), container.id]);
  }
  const people = Map.groupBy(state.people, (person) => person.containerId);
  const links = new Set(state.links.map((link) => link.containerId));
  return { byId, children, people, links };
}
type Index = ReturnType<typeof indexOf>;

/** The audiences on `ids`, once each, in order: a person reached on any path accepted counts as accepted. */
function audiencesOn(index: Index, ids: Iterable<string>): Audience[] {
  const found = new Map<string, Audience>();
  for (const id of ids) {
    const container = index.byId.get(id);
    if (!container) continue;
    const via = { id, name: container.name };
    for (const person of index.people.get(id) ?? []) {
      const key = `person:${person.personId}`;
      const seen = found.get(key);
      if (seen?.kind === "person") seen.pending &&= person.pending;
      else {
        found.set(key, {
          kind: "person",
          id: person.personId,
          name: person.name,
          pending: person.pending,
          via,
        });
      }
    }
    if (index.links.has(id)) found.set(`link:${id}`, { kind: "link", via });
  }
  return [...found.values()];
}

/** `parentId` and the folders above it, nearest first; none for the root. */
function chainOf(index: Index, parentId: string | null): string[] {
  const chain: string[] = [];
  for (let id = parentId; id !== null && !chain.includes(id);) {
    chain.push(id);
    id = index.byId.get(id)?.parentId ?? null;
  }
  return chain;
}

/** `id` and its active descendants. */
function subtreeOf(index: Index, id: string): string[] {
  const ids = [id];
  for (let at = 0; at < ids.length; at += 1) ids.push(...(index.children.get(ids[at] ?? "") ?? []));
  return ids;
}

const pending = (audience: Audience) => audience.kind === "person" && audience.pending;

/** `from` less what `others` already give: the same audience, with access at least as firm, accepted over pending. */
const minus = (from: readonly Audience[], ...others: readonly (readonly Audience[])[]) => {
  const given = new Map<string, boolean>();
  for (const audience of others.flat()) {
    const key = keyOf(audience);
    given.set(key, given.get(key) === false ? false : pending(audience));
  }
  return from.filter((audience) => {
    const other = given.get(keyOf(audience));
    return other === undefined || (other && !pending(audience));
  });
};

/**
 * Moving the active folder or list `id` into `to` (FR-07.9): the destination's audiences it gains, those of the
 * folders it leaves that it loses, less any on the item itself, which it keeps either way, and the direct shares on
 * it and its contents.
 */
export function moveImpact(state: ImpactState, id: string, to: string | null): SharingImpact {
  const index = indexOf(state);
  const item = index.byId.get(id);
  if (!item) return { added: [], removed: [], direct: [] };
  const before = audiencesOn(index, chainOf(index, item.parentId));
  const after = audiencesOn(index, chainOf(index, to));
  const own = audiencesOn(index, [id]);
  return {
    added: minus(after, before, own),
    removed: minus(before, after, own),
    direct: audiencesOn(index, subtreeOf(index, id)),
  };
}

/**
 * Recovering a folder's or list's Trash unit, `ids` being its containers with its root first, into `to` (FR-07.10):
 * Trash showed it to nobody, so the destination's audiences are added, and its own shares resume.
 */
export function recoveryImpact(
  state: ImpactState,
  ids: readonly string[],
  to: string | null,
): SharingImpact {
  const index = indexOf(state);
  const direct = audiencesOn(index, ids);
  const own = audiencesOn(index, ids.slice(0, 1));
  return { added: minus(audiencesOn(index, chainOf(index, to)), own), removed: [], direct };
}

/** Recovering an album into the active lists `listIds` (FR-14.2): their audiences, and those of their folders. */
export function listsImpact(state: ImpactState, listIds: readonly string[]): SharingImpact {
  const index = indexOf(state);
  const ids = listIds.flatMap((listId) => chainOf(index, listId));
  return { added: audiencesOn(index, ids), removed: [], direct: [] };
}

/**
 * Deleting folders, lists and albums to Trash (FR-07.14, FR-10.6): everyone who sees them now stops, since Trash shows
 * them to nobody. That is the audiences on each deleted container, those below it and those of its folders, and for an
 * album, those of the lists it leaves and their folders. An audience that keeps another path to an album, through a
 * list that stays, still loses the deleted folders and lists, so it is listed.
 */
export function deletionImpact(
  state: ImpactState,
  {
    containerIds,
    albumListIds,
  }: { containerIds: readonly string[]; albumListIds: readonly string[] },
): Audience[] {
  const index = indexOf(state);
  const ids = [
    ...containerIds.flatMap((id) => [
      ...subtreeOf(index, id),
      ...chainOf(index, index.byId.get(id)?.parentId ?? null),
    ]),
    ...albumListIds.flatMap((listId) => chainOf(index, listId)),
  ];
  return audiencesOn(index, ids);
}
