// Help's search, measured (FR-16.4, TON-314): searches people really type, in their own words, with typos and whole
// questions, each with the page it must find. Most must find it first; the rest among the first three. A change to
// the pages, their keywords, the synonyms or the ranking that makes one of these worse fails here.

import { describe, expect, test } from "bun:test";

import docs from "@/help/search.gen.json";

import { createHelpSearch } from "./engine";

const search = createHelpSearch(docs);

/** [what's typed, the page it must find, how high: 1 = first, 3 = among the first three]. */
const searches: [string, string, 1 | 3][] = [
  // Starting out
  ["what is tonaris", "start-here/what-tonaris-is", 1],
  ["getting started", "start-here/your-first-ten-minutes", 1],
  ["password", "start-here/joining-and-signing-in", 3],
  ["login", "start-here/joining-and-signing-in", 1],
  ["how do I log in", "start-here/joining-and-signing-in", 1],
  ["sign out", "start-here/joining-and-signing-in", 1],
  ["install app", "start-here/install-the-app", 1],
  ["desktop app", "start-here/install-the-app", 1],
  ["add to home screen", "start-here/install-the-app", 3],
  ["uninstall", "start-here/install-the-app", 1],
  // Adding albums
  ["add an album", "add-albums/paste-links", 3],
  ["how do I add albums", "add-albums/paste-links", 3],
  ["paste spotify link", "add-albums/paste-links", 1],
  ["spotfy link", "add-albums/paste-links", 3],
  ["which album is this", "add-albums/choose-a-match", 1],
  ["album not found", "add-albums/choose-a-match", 3],
  ["enter album manually", "add-albums/add-by-hand", 1],
  ["wrong year", "add-albums/where-details-come-from", 3],
  ["release date", "add-albums/where-details-come-from", 3],
  ["musicbrainz", "add-albums/where-details-come-from", 1],
  ["change artwork", "add-albums/fix-details", 1],
  ["missing cover", "help/questions", 1],
  ["change the cover", "add-albums/fix-details", 1],
  ["fix album title", "add-albums/fix-details", 3],
  // Organizing
  ["playlist", "organize/folders-and-lists", 3],
  ["make a playlist", "organize/folders-and-lists", 3],
  ["new folder", "organize/folders-and-lists", 1],
  ["what is unsorted", "organize/one-album-many-lists", 3],
  ["add album to a list", "organize/lists-in-and-out", 1],
  ["remove album from list", "organize/lists-in-and-out", 3],
  ["select several albums", "organize/lists-in-and-out", 3],
  ["manual order", "organize/move-and-rearrange", 1],
  ["reorder albums", "organize/move-and-rearrange", 1],
  ["move a folder", "organize/move-and-rearrange", 1],
  ["folder color", "organize/colors-icons-descriptions", 1],
  ["icon", "organize/colors-icons-descriptions", 1],
  ["edit mode", "organize/viewing-and-editing", 1],
  ["why can't I edit", "organize/viewing-and-editing", 3],
  // Fields
  ["rating", "fields/custom-fields", 1],
  ["tags", "fields/custom-fields", 3],
  ["custom field", "fields/custom-fields", 1],
  ["delete a field", "fields/change-or-remove", 1],
  ["change field type", "fields/change-or-remove", 1],
  // Browsing
  ["sort by year", "browse/covers-or-rows", 1],
  ["grid view", "browse/covers-or-rows", 3],
  ["group by release type", "browse/covers-or-rows", 1],
  ["album panel", "browse/album-panel", 1],
  ["search", "browse/search-and-commands", 3],
  ["command palette", "browse/search-and-commands", 1],
  ["open in spotify", "browse/listen", 3],
  ["open in app instead of browser", "browse/listen", 3],
  ["navigate without a mouse", "browse/keyboard", 3],
  // Keys
  ["keyboard shortcuts", "reference/keyboard-shortcuts", 1],
  ["hotkeys", "reference/keyboard-shortcuts", 3],
  ["cheatsheet", "reference/keyboard-shortcuts", 1],
  // Sharing
  ["share a list with a friend", "share/share-a-folder-or-list", 3],
  ["ways to share", "share/ways-to-share", 1],
  ["stop sharing", "share/change-or-stop", 1],
  ["collaborate on a playlist", "share/editing-a-share", 3],
  ["someone shared a list with me", "share/shared-with-you", 3],
  ["accept invitation", "share/shared-with-you", 3],
  ["people", "share/people", 3],
  ["move shared folder", "share/move-or-delete-shared", 3],
  // Trash
  ["delete album", "trash/remove-delete-undo", 3],
  ["undo", "trash/remove-delete-undo", 3],
  ["recycle bin", "trash/get-it-back", 1],
  ["restore deleted list", "trash/get-it-back", 1],
  ["how do I get back a deleted folder", "trash/get-it-back", 1],
  // Saving
  ["offline", "saving/how-saving-works", 1],
  ["changes not saved", "saving/when-an-edit-doesnt-save", 3],
  ["conflict", "saving/when-an-edit-doesnt-save", 1],
  // Account
  ["passkey", "account/email-and-passkeys", 1],
  ["change email", "account/email-and-passkeys", 1],
  ["delete my account", "account/delete-account", 1],
  ["how do I delete my account", "account/delete-account", 1],
  ["backup", "account/export", 1],
  ["download my data", "account/export", 1],
  ["profile picture", "account/profile", 3],
  ["favorite albums", "account/profile", 3],
  // AI agents
  ["chatgpt", "agents/connect", 3],
  ["connect claude", "agents/connect", 1],
  ["what can ai do", "agents/what-agents-do", 3],
  ["approve request", "agents/approvals", 1],
  ["revoke connection", "agents/approvals", 3],
  // Phone, reference, help
  ["iphone", "phone/on-your-phone", 3],
  ["how many albums can I have", "reference/limits", 3],
  ["limits", "reference/limits", 1],
  ["youtube music link", "reference/services-and-links", 3],
  ["glossary", "reference/words", 1],
  ["dark mode", "help/questions", 3],
  ["import my library", "help/questions", 3],
  ["feedback", "help/get-in-touch", 1],
  ["contact support", "help/get-in-touch", 3],
  // Words in the app's own form: keys, contractions, what a dialog says
  ["ctrl k", "browse/search-and-commands", 3],
  ["esc", "browse/keyboard", 3],
  ["can't sign in", "start-here/joining-and-signing-in", 1],
  ["magic link", "start-here/joining-and-signing-in", 1],
  ["what's unsorted", "organize/one-album-many-lists", 3],
  ["sort alphabetically", "browse/covers-or-rows", 1],
  ["add songs", "help/questions", 1],
];

describe("Help's search finds the page people mean", () => {
  for (const [query, slug, within] of searches) {
    test(`"${query}" finds ${slug}${within === 1 ? " first" : ""}`, () => {
      const found = search.search(query).results.map((result) => result.slug);
      expect(found.slice(0, within)).toContain(slug);
    });
  }
});

describe("Help's search", () => {
  test("marks the words it matched in a snippet", () => {
    const [first] = search.search("restore deleted list").results;
    expect(first?.hits[0]?.snippet.some((part) => part.hit)).toBe(true);
  });

  test("reads a word a letter off one Help uses as that word, and says so", () => {
    const answer = search.search("spotfy link");
    expect(answer.showingFor).toBe("spotify link");
    expect(answer.results.length).toBeGreaterThan(0);
  });

  test("offers a word two letters off, rather than reading it as that word", () => {
    const answer = search.search("vynil");
    expect(answer.results).toEqual([]);
    expect(answer.didYouMean).toBe("vinyl");
    // The other words may find something meanwhile.
    expect(search.search("vynil records").didYouMean).toBe("vinyl records");
  });

  test("names the words of Tonaris's it looked for too", () => {
    expect(search.search("playlist").alsoLookedFor).toEqual(["list"]);
    expect(search.search("list").alsoLookedFor).toEqual([]);
  });

  test("finds nothing for nonsense, and offers nothing", () => {
    expect(search.search("qwzxv")).toEqual({
      results: [],
      showingFor: undefined,
      alsoLookedFor: [],
      didYouMean: undefined,
    });
  });

  test("a whole question is its few words that matter", () => {
    expect(search.search("how do I").results).toEqual([]);
  });

  test("takes a word Help uses as it is", () => {
    expect(search.search("cover").showingFor).toBeUndefined();
  });
});
