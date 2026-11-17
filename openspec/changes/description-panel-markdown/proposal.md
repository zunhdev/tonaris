# Proposal

## Why

In the creator's manual testing, writing a folder's or list's description was awkward: a text box between the header and the covers grew a line per Shift+Enter, up to six, pushing the covers down, and a long paragraph scrolled inside a one-line box. Reading it showed four and a half lines in a scroll area with no scroll bar, with lines close to 200 characters wide. The creator also asked for simple Markdown. They picked Viewing 2, Editing 1 and Markdown M2 on the comparison page. Linear: TON-292. Rules: FR-03.5, DS-41.

## What Changes

- **Reading:** the first three lines, at most 672 px wide, fading into More, which shows the rest in place. The description sits at the top of the albums, or of the folders and lists, and scrolls away with them. Shared and guest pages show it the same way.
- **Writing:** in Editing mode, Description joins Rename in the header, and clicking the text opens it too: a panel where the album panel opens, with a text box its full height, a toolbar, and a count. The text under the header follows the typing. Closing saves.
- **Markdown:** bold, italic, bulleted and numbered lists, and http(s) links. Rows show the first line without its marks; exports keep the text, and the readable copy renders it; MCP tools say it's Markdown.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-hierarchy`: descriptions take simple Markdown, read in three lines and More, and are written in a side panel.
