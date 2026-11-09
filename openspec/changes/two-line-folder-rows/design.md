# Design

## Context

- `ContainerRows` is a virtualized ARIA grid. On a phone (`useNarrowScreen`, below 768 px) it had two columns: a name cell holding a link, and a contents cell holding the count. The count's column was `auto`, as wide as its text.
- Only the link opened the folder or list; a tap on the count did nothing.
- Phone album rows already put the artist under the title in one cell, 56 px tall.

## Decisions

### 1. The count under the name, as album rows do

The creator proposed this. It matches the phone's album rows and the phone's own file lists, where a folder's item count sits under its name. A shorter count on the same line, such as "22" alone, would still take room from the name and would no longer say what's being counted.

### 2. One cell, and the link fills it

The two lines are one cell, so `aria-colcount` is 1 on a phone. The link fills the row, which makes the whole 56 px row the touch target, not only the name.

### 3. The second line describes the link

The link is labelled by its name line (`aria-labelledby`), which holds the name and the save state's words, and described by the second line (`aria-describedby`). A screen reader says "Metal, link, 22 folders and lists", and the link's name stays the folder's name.

### 4. The description moves to the second line

On a phone, a description after the name cut the name further. On the second line it follows the count after " · " and is cut first.

## Risks / Trade-offs

- [Fewer rows fit on a screen: 56 px rather than 48 px] → album rows are already 56 px. Names that were cut now show, which matters more.
