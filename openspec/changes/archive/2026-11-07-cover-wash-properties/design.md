# Design

## Context

- The inspector's details are `AlbumDetails`: the cover, title and artist, then sections (`Section`, a labelled region). Viewing mode showed Chronology as label and value pairs; Info held "Added {date}".
- Covers show through the API's image proxy (TS-103). The API's CORS answers the web app's origin with `Access-Control-Allow-Origin` and `Vary: Origin` on every route, `/img` included.
- TON-159 shows a cover the browser already has at once, from the image cache of the shown `<img>`.

## Decisions

### 1. Read the color apart from the shown image

`coverColor(src)` fetches the image in CORS mode without credentials, decodes it with `createImageBitmap` downscaled to 24 × 24, draws it on a canvas and reads its pixels. Putting `crossOrigin` on the shown `<img>` instead would split its cache from the cards' and rows' copies, and lose TON-159's instant cover. The separate fetch costs one request per cover per page life (kept in a map); with `Vary: Origin`, the browser doesn't reuse the image tag's copy for it.

### 2. The main color

512 buckets (3 bits a channel), each pixel weighing 1 + 3 × saturation in mid-tones (0.12–0.9 lightness), 1 + 0.6 × saturation outside, nearly transparent pixels skipped. The heaviest bucket's mean, in OKLCH, gives the hue and chroma. A plain ground loses to the cover's color, and a black-and-white cover gets no chroma, so its wash is a neutral lift.

### 3. A wash that can't break contrast

The wash's top color is `oklch(0.21 min(c, 0.08) h)`: the hue varies, the lightness doesn't. The token test checks `fg.primary`, `fg.secondary` and `fg.tertiary`, plain and on a field's veil, on it for 72 hues; 0.21 is the lightest that passes for a field's placeholder (0.22 fails at teal). The gradient runs to `transparent` over 28rem, behind the content (`-z-10` in an isolated panel), with no pointer events.

### 4. Properties

One `dl` in a two-column grid: in Viewing mode the chronology (the Chronology section shows only in Editing mode, with its fields), then Added, In lists and Links. The sort hint follows the chronology in either place.

## Risks / Trade-offs

- [Covers that fail CORS, such as an API answering without the header] → no wash; the panel stays plain.
- [A second request per new cover] → only when an album opens, once per page life; the proxy's answers are cached for a week.
