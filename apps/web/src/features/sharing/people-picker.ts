// What the invite field offers (DS-65, FR-07.23; TON-294): the owner's people, without those already invited to this
// folder or list. Before anything is typed, the 8 most recently shared with; typed words must each match a person's
// name or the address the owner typed for them, as search matches (FR-12.5, TON-201), names matching the whole text
// first. Pure, so the rules are tested without a DOM.

import {
  matchLimit,
  suggestedCount,
  termsOf,
  type Matches,
} from "@/features/collection/list-picker";

import { ownerLabel, searchText, searchTier, type Person, type SearchText } from "@tonaris/domain";

/** One of the owner's people, ready to match. */
export type PersonChoice = {
  person: Person;
  /** Their display name, else the address typed for them; never empty, as nobody without either is listed. */
  name: string;
  nameText: SearchText;
  emailText: SearchText | undefined;
};

/** The people the field can offer: all but `invited`, the people with an open invitation here, latest first. */
export function personChoices(
  people: readonly Person[],
  invited: Iterable<string>,
): PersonChoice[] {
  const skip = new Set(invited);
  return people
    .filter((person) => !skip.has(person.id))
    .map((person) => {
      const name = person.displayName ?? person.email ?? ownerLabel(null, { start: true });
      return {
        person,
        name,
        nameText: searchText(person.displayName ?? ""),
        emailText: person.email === null ? undefined : searchText(person.email),
      };
    });
}

/** What shows before anything is typed: the latest `suggestedCount`, and how many more there are to find. */
export function suggestedPeople(choices: readonly PersonChoice[]): {
  shown: PersonChoice[];
  hidden: number;
} {
  return {
    shown: choices.slice(0, suggestedCount),
    hidden: Math.max(0, choices.length - suggestedCount),
  };
}

/** The people `query` finds, best first, at most `matchLimit`; `choices` must be latest first. */
export function findPeople(choices: readonly PersonChoice[], query: string): Matches<PersonChoice> {
  const terms = termsOf(query);
  if (terms.length === 0) return { shown: [], total: 0 };
  const whole = terms.join(" ");
  const matched: { choice: PersonChoice; tier: number }[] = [];
  for (const choice of choices) {
    const matches = (term: string) =>
      searchTier(term, choice.nameText) !== undefined ||
      (choice.emailText !== undefined && searchTier(term, choice.emailText) !== undefined);
    if (!terms.every(matches)) continue;
    matched.push({ choice, tier: searchTier(whole, choice.nameText) ?? 3 });
  }
  // A stable sort keeps the latest first within a tier.
  const shown = matched
    .toSorted((a, b) => a.tier - b.tier)
    .slice(0, matchLimit)
    .map(({ choice }) => choice);
  return { shown, total: matched.length };
}

/** The names shown more than once among `shown`, by people without an address to tell them apart. */
export function clashingNames(shown: readonly PersonChoice[]): Set<string> {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const { name, person } of shown) {
    if (person.email !== null) continue;
    if (seen.has(name)) twice.add(name);
    seen.add(name);
  }
  return twice;
}
