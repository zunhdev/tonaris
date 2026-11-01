// How the collections make their writes (TS-20, TS-21): each one a mutation envelope with an ID of its own, made once
// per intent so a resend is the same write (TS-22), and an edit's `args` and `base` the fields it changed, with their
// values before it.

import { uuidv7, type Mutation, type MutationName } from "@tonaris/domain";

/** The envelope of mutation `Name`. */
type Envelope<Name extends MutationName> = Extract<Mutation, { name: Name }>;

/** Mutation `Name`'s `base`, as the one argument after its `args`, when it takes one (TS-21). */
type BaseOf<Name extends MutationName> =
  Envelope<Name> extends { base: infer Base } ? [base: Base] : [];

/** A new write of mutation `name` with a fresh ID, and its `base` when the mutation takes one. */
export function envelope<Name extends MutationName>(
  name: Name,
  args: Envelope<Name>["args"],
  ...base: BaseOf<Name>
): Envelope<Name> {
  const write = { mutationId: uuidv7(), name, args, ...(base.length > 0 ? { base: base[0] } : {}) };
  // `Envelope` and `BaseOf` type each part as mutation `name` has it, which TypeScript can't join for a generic name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return write as unknown as Envelope<Name>;
}

/**
 * The `fields` that `next` changes from `before`, as a write's `args` and `base` (TS-21); undefined when it changes
 * none. A field left out of `next`, or set to the value it has, isn't changed.
 */
export function diffFields<Row extends object, Field extends keyof Row & string>(
  fields: readonly Field[],
  before: Row,
  next: Partial<Pick<Row, Field>>,
): { args: Partial<Pick<Row, Field>>; base: Partial<Pick<Row, Field>> } | undefined {
  const args: Partial<Pick<Row, Field>> = {};
  const base: Partial<Pick<Row, Field>> = {};
  for (const field of fields) {
    const value = next[field];
    if (value === undefined || value === before[field]) continue;
    args[field] = value;
    base[field] = before[field];
  }
  return Object.keys(args).length > 0 ? { args, base } : undefined;
}

/** `row`'s `fields` only, whatever else it carries: what a write sends of a draft. */
export function pick<Row extends object, Field extends keyof Row>(
  row: Row,
  fields: readonly Field[],
): Pick<Row, Field> {
  const picked: Partial<Pick<Row, Field>> = {};
  for (const field of fields) picked[field] = row[field];
  // Every field in `fields` is set.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return picked as Pick<Row, Field>;
}
