# Design

## Context

- **DS-19** planned a text wordmark and a "T" mark on the accent for the favicon and app icon; neither existed. The design decisions log (section 17, item 8) kept the wordmark text-only.
- The creator will design a permanent logo, so the temporary one must be quick to replace.

## Goals / Non-Goals

**Goals:** a recognizable mark in tabs, on home screens and beside the name; the name a little more prominent; one place to change it later.

**Non-Goals:** a final logo, brand guidelines, or a light-theme variant.

## Decisions

### 1. A record leaving its sleeve

Tonaris is about albums, so the mark is a sleeve with a record half out of it: two flat shapes, in one color, readable at 16 px. Like Linear's, it is geometric and monochrome, but its shapes are its own. The record is a plain path rather than a masked circle, so the inline component needs no generated ids.

### 2. One color in the app, the accent behind it as an icon

In the app, the mark takes the text's color beside the name. As a favicon and app icon, it is light on a rounded accent square, so it stands out on light and dark tabs alike. iOS gets a square icon, as it rounds corners itself, and Android a maskable one with the mark inside the safe zone.

### 3. PNGs rendered from the SVGs

The PNGs are rendered by Playwright's Chromium, which the browser tests already install, from the two SVGs. The script runs by hand and its output is committed, so builds need nothing extra.

### 4. A brand type size

The sidebar's name moves from `text.title` (15 px) to a new `text.brand` (17 px semibold, −0.01em), only for the wordmark. The sign-in page uses `text.page` (20 px), where there's room.

## Risks / Trade-offs

- **The icons are PNGs in the repo,** about 25 kB in all. They change only with the logo.
