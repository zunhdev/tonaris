// The export validator (AC-41, TS-121): checks a Tonaris export archive the way a program receiving it would.
// - The archive holds exactly the four files.
// - `tonaris-export.json` passes the archive's own JSON Schema (2020-12), which allows no key it doesn't name, and
//   that schema is the format's current one.
// - Each album appears once, and every reference resolves: list entries, parents, fields and options, views and
//   their order, Trash units and their former memberships.
// - Trash is marked: an item is `trashed` exactly when it belongs to a unit, and each unit lists what it holds.
// - Nothing excluded appears: no key for credentials, sharing or the account's profile (FR-08.4).

import addFormats from "ajv-formats";
import { Ajv2020 } from "ajv/dist/2020.js";
import { strFromU8, unzipSync } from "fflate";

import {
  exportFileNames,
  exportFormatVersion,
  exportJsonSchema,
  exportSchema,
  type TonarisExport,
} from "@tonaris/domain";

/** Keys no export may hold (FR-08.4), whatever the schema allows. */
const excludedKeys =
  /^(e-?mail|.*Email|displayName|password|token.*|.*Token|session.*|cookie|grant.*|invit.*|share.*|recipient.*|connection.*)$/i;

/** The problems with an archive; none means it's valid. */
export function validateArchive(zip: Uint8Array): string[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch (error) {
    return [`The archive isn't a readable ZIP: ${String(error)}`];
  }
  const names = Object.keys(files);
  const problems: string[] = [];
  for (const name of exportFileNames)
    if (!(name in files)) problems.push(`The archive has no ${name}.`);
  for (const name of names)
    if (!(exportFileNames as readonly string[]).includes(name))
      problems.push(`The archive has an unexpected file, ${name}.`);
  if (problems.length > 0) return problems;

  const text = (name: (typeof exportFileNames)[number]) =>
    strFromU8(files[name] ?? new Uint8Array());
  let data: unknown;
  let schema: unknown;
  try {
    data = JSON.parse(text("tonaris-export.json"));
    schema = JSON.parse(text("tonaris-export.schema.json"));
  } catch (error) {
    return [`A JSON file doesn't parse: ${String(error)}`];
  }
  problems.push(...againstSchema(data, schema));
  if (problems.length > 0) return problems;

  const exported = exportSchema.parse(data);
  if (
    exported.formatVersion === exportFormatVersion &&
    JSON.stringify(schema) !== JSON.stringify(exportJsonSchema())
  )
    problems.push(`tonaris-export.schema.json isn't format ${exportFormatVersion}'s schema.`);
  problems.push(...invariants(exported), ...excludedIn(data));
  if (text("collection.md").trim() === "") problems.push("collection.md is empty.");
  if (!text("README.md").includes(`(${exported.formatVersion})`))
    problems.push("README.md doesn't name the format's version.");
  return problems;
}

/** The data's failures against the archive's JSON Schema, at most ten. */
function againstSchema(data: unknown, schema: unknown): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats.default(ajv);
  if (typeof schema !== "object" || schema === null) return ["The JSON Schema isn't an object."];
  let check;
  try {
    check = ajv.compile(schema);
  } catch (error) {
    return [`The JSON Schema doesn't compile: ${String(error)}`];
  }
  if (check(data)) return [];
  return (check.errors ?? [])
    .slice(0, 10)
    .map((error) => `Schema: ${error.instancePath || "/"} ${error.message ?? ""}`.trim());
}

/** The references and Trash marks that don't hold (AC-41). */
export function invariants(data: TonarisExport): string[] {
  const problems: string[] = [];
  const albums = new Map<string, TonarisExport["albums"][number]>();
  for (const album of data.albums) {
    if (albums.has(album.id)) problems.push(`Album ${album.id} appears more than once.`);
    albums.set(album.id, album);
  }
  const containers = new Map(data.tree.containers.map((container) => [container.id, container]));
  const fields = new Map(data.fields.map((field) => [field.id, field]));
  const units = new Map(data.trash.units.map((unit) => [unit.id, unit]));

  for (const container of data.tree.containers) {
    const parent = container.parentId === null ? undefined : containers.get(container.parentId);
    if (container.parentId !== null && parent?.kind !== "folder")
      problems.push(
        `${container.kind} ${container.id}'s parent ${container.parentId} isn't a folder in the export.`,
      );
    if (container.kind === "folder" && container.albumIds.length > 0)
      problems.push(`Folder ${container.id} lists albums.`);
    for (const albumId of container.albumIds)
      if (!albums.has(albumId))
        problems.push(`List ${container.id} names a missing album, ${albumId}.`);
  }

  for (const album of data.albums)
    for (const [fieldId, applied] of Object.entries(album.fields)) {
      const field = fields.get(fieldId);
      if (!field) {
        problems.push(`Album ${album.id} uses a missing field, ${fieldId}.`);
        continue;
      }
      if (applied.type !== field.type || applied.name !== field.name)
        problems.push(`Album ${album.id}'s ${field.name} doesn't match its field's name or type.`);
      const value = applied.value;
      const choices =
        value === null || typeof value !== "object" ? [] : Array.isArray(value) ? value : [value];
      for (const choice of choices)
        if (field.options.find((option) => option.id === choice.optionId)?.label !== choice.label)
          problems.push(
            `Album ${album.id}'s ${field.name} names an option its field doesn't have.`,
          );
    }

  for (const [viewKey, view] of Object.entries(data.personal.views)) {
    if (viewKey !== "root" && viewKey !== "unsorted" && !containers.has(viewKey))
      problems.push(`The view ${viewKey} isn't a folder or list in the export.`);
    for (const itemId of view.order)
      if (!albums.has(itemId) && !containers.has(itemId))
        problems.push(`The view ${viewKey}'s order names a missing item, ${itemId}.`);
  }

  // Trash is marked: `trashed` exactly when in a unit, and each unit lists what it holds.
  const items = [
    ...data.albums.map((album) => ({ ...album, what: "Album" })),
    ...data.tree.containers.map((container) => ({
      ...container,
      what: container.kind === "folder" ? "Folder" : "List",
    })),
  ];
  for (const item of items) {
    const unit = item.trashUnitId === null ? undefined : units.get(item.trashUnitId);
    if (item.status === "trashed" && !unit)
      problems.push(`${item.what} ${item.id} is trashed but in no unit.`);
    if (item.status === "active" && item.trashUnitId !== null)
      problems.push(`${item.what} ${item.id} is active but names a Trash unit.`);
    if (unit && ![...unit.containerIds, ...unit.albumIds].includes(item.id))
      problems.push(`${item.what} ${item.id}'s unit ${unit.id} doesn't list it.`);
  }
  for (const unit of data.trash.units) {
    for (const id of [...unit.containerIds, ...unit.albumIds]) {
      const item = containers.get(id) ?? albums.get(id);
      if (item?.trashUnitId !== unit.id)
        problems.push(`Unit ${unit.id} lists ${id}, which isn't in it.`);
    }
    if (![...unit.containerIds, ...unit.albumIds].includes(unit.rootId))
      problems.push(`Unit ${unit.id}'s root ${unit.rootId} isn't among its contents.`);
    for (const entry of unit.formerMemberships)
      if (containers.get(entry.listId)?.kind !== "list" || !albums.has(entry.albumId))
        problems.push(
          `Unit ${unit.id} keeps an entry that doesn't resolve: ${entry.listId} → ${entry.albumId}.`,
        );
    if (unit.expiresAt <= unit.deletedAt)
      problems.push(`Unit ${unit.id} expires before it was deleted.`);
  }
  return problems;
}

/** Keys anywhere in `value` that name excluded data (FR-08.4). */
function excludedIn(value: unknown, path = ""): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, index) => excludedIn(item, `${path}/${index}`));
  if (typeof value !== "object" || value === null) return [];
  const problems: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (excludedKeys.test(key)) problems.push(`Excluded data: ${path}/${key}.`);
    problems.push(...excludedIn(child, `${path}/${key}`));
  }
  return problems;
}
