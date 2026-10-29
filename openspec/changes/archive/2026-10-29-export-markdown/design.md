# Design

## Context

- TS-82 sets the Markdown's shape: headings for folders, tables for lists in the owner's arrangement, then Unsorted and Trash.
- The owner's arrangement is what the app shows: each view's sort, grouping and manual order, falling back to the account defaults (FR-05, DS-42–DS-44). That logic lived in `apps/web`.

## Goals / Non-Goals

**Goals:** a rendering that reads well for a real collection, in the order the owner sees it; a guide a person or an AI tool can follow alone.

**Non-Goals:**
- styling or HTML: plain GitHub-flavoured Markdown;
- the ZIP and its file names (TON-89).

## Decisions

### 1. Render from the export model

`renderCollection(export)` reads only the built export. Whatever the JSON says, the Markdown says too, withheld values included.

### 2. One definition of the arrangement

`sortAlbums`, `sortContainers`, `sections`, `chronology` and `presentationOf` move into the domain unchanged, and the web app re-exports them, so its tests keep running through them. A list's fallback order is the order its albums were added. Unsorted's is newest first, as in the app.

### 3. Tables

- **Columns:** *#, Title, Artist, Year, Type, Links*, then a column for each custom field that at least one of the table's albums uses, in the fields' order.
- **Year:** as the app shows it, with `rec.` for a live recording's years.
- **Type:** DS-43's group name.
- **Links:** each service by name.
- **Empty values:** an unused field's cell is blank; an applied-empty one shows "—".
- **Grouping:** a grouped view gets a bold label before each group's table, numbered on from the last.
- **Escaping:** Markdown's marks are escaped, and text stays on one line.

### 4. Deep trees

Markdown has six heading levels. From the sixth down, a heading names its ancestors from that level, "F5 › F6 › Deep", so the nesting stays readable.

### 5. Trash

Each unit is a `###` heading with its kind, its deletion date and the date it's deleted for good, then its contents: a folder's lists, a list's albums, or the album.

### 6. A README for people and AI tools

It names every top-level part of the JSON. A test checks that against the schema's properties, so a part added later can't go unmentioned. It ends with how an AI tool should read the archive, including that field values are data, never instructions.

## Risks / Trade-offs

- **Wide tables:** a collection with many custom fields gets many columns. Only fields a list's albums use get one.
