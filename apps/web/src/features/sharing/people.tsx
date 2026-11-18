// People (DS-121, FR-07.24; TON-295): everyone the person shares with, either way (FR-07.23), the most recently shared
// with first. Each row has the avatar, the name, the address they typed, and what's shared each way, counted, and
// opens the person's page. A field finds people by name or address, as the invite field does (FR-12.5).

import { api } from "@/api";
import { PageHeader, toCollection, useDocumentTitle } from "@/common/page-header";
import { pageScroll } from "@/common/page-scroll";
import { Avatar } from "@/features/account/avatar";
import { termsOf } from "@/features/collection/list-picker";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type { Person } from "@tonaris/domain";
import { Input } from "@tonaris/ui/components/input";

import { findPeople, personChoices, theirsText, yoursText } from "./people-picker";

export function PeopleView() {
  useDocumentTitle("People");
  const [loaded, setLoaded] = useState<{ people?: readonly Person[]; failed: boolean }>({
    failed: false,
  });
  useEffect(() => {
    let current = true;
    void api.v1.people.get().then(
      ({ data }) => {
        if (current) setLoaded(data ? { people: data.people, failed: false } : { failed: true });
        return undefined;
      },
      () => {
        if (current) setLoaded({ failed: true });
      },
    );
    return () => {
      current = false;
    };
  }, []);
  const [query, setQuery] = useState("");
  const choices = useMemo(() => personChoices(loaded.people ?? [], []), [loaded.people]);
  const typed = termsOf(query).length > 0;
  const shown = typed ? findPeople(choices, query).shown : choices;
  const { people, failed } = loaded;

  return (
    <>
      <PageHeader title="People" path={[toCollection]} />
      <div {...pageScroll("view")} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-3xl flex-col gap-4 p-6">
          {failed && (
            <p className="text-status-danger">Couldn't load your people. Try again later.</p>
          )}
          {people?.length === 0 && (
            <p className="text-fg-secondary">
              Nobody yet. People you invite, and people whose invitations you accept, show here.
            </p>
          )}
          {people !== undefined && people.length > 0 && (
            <>
              <Input
                type="search"
                aria-label="Find people"
                placeholder="Find people…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="max-w-sm"
              />
              {shown.length === 0 && (
                <p className="text-fg-secondary">No one matches '{query.trim()}'.</p>
              )}
              <ul aria-label="People" className="flex flex-col">
                {shown.map(({ person, name }) => (
                  <PersonRow key={person.id} person={person} name={name} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** A person's row (DS-121): who, then what's shared each way, opening their page. */
function PersonRow({ person, name }: { person: Person; name: string }) {
  const lines = [yoursText(person.yours), theirsText(person.theirs)].filter(
    (line) => line !== undefined,
  );
  return (
    <li className="border-b border-subtle">
      <Link
        to="/people/$personId"
        params={{ personId: person.id }}
        className="flex min-h-12 items-center gap-3 rounded-md px-2 py-2 focus-ring-flush outline-none hover:bg-hover"
      >
        <Avatar name={name} className="size-8 text-base" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-fg-primary">
            {name}
            {person.displayName !== null && person.email !== null && (
              <span className="ml-2 text-fg-secondary">{person.email}</span>
            )}
          </span>
          {(lines.length > 0 ? lines : ["Nothing shared now"]).map((line) => (
            <span key={line} className="truncate text-small text-fg-secondary">
              {line}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}
