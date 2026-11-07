# Design

## Context

- A container record is `{ id, kind, parentId, name, description }`; `container.describe` added the description as a field of the record with its own mutation (TON-54), so it travels in the bootstrap, the stream and shared snapshots, and the client's container collection turns a changed field into its mutation (`containerUpdates`).
- `container.create`'s request is `containerFieldsSchema`, apart from the record's schema.
- The tree, folder rows and cards, and shared and guest pages each draw `ContainerIcon`.

## Decisions

### 1. A field of the record, set by its own mutation

`color` joins the record, as `description` did, so no new entity or stream change is needed. `container.setColor` follows `container.describe`: compare-and-set on the prior color (TS-21), refused in Trash. It is appended to the mutations' union, which oasdiff reads as additive; `container.create` is untouched.

### 2. Inheritance in the clients

`effectiveColor` walks up the parents to the first color. Storing only each container's own color keeps a move or a parent's change from rewriting its descendants; every client has the tree. In a share, the root's parent is withheld, so inheritance stops there.

### 3. Classes written out

A color's icon, swatch and chip classes are maps of literal class names (`container-palette.tsx`), so Tailwind finds each. A chip's tint mixes `--chip` (set per color) into its ground and edge. The icon is filled with its color at 25% (`fill-current/25`).

### 4. Two ways to set it, one write

The ⋯ menu's Color submenu (Base UI radio items) and ⌘K's Color… dialog both call `useSetColor`, which enters Editing mode and updates the container in the client's collection. Color… joins the commands without a key; the palette doesn't announce a shortcut for it.

## Risks / Trade-offs

- [Colors compete with covers (DS-04)] → icons only, and chips at 16%; the creator chose inheritance knowingly.
- [A command without keys in the shortcut reference] → the reference lists Color… without keys, as the palette shows it.
