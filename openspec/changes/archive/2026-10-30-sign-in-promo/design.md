# Design

## Context

- **DS-90's frame** (`SignInCard`) holds the wordmark and one card. Approvals, account deletion and other pages reuse it.
- **Admission** is by the creator's invitation (FR-11.2), so the page can't offer sign-up.

## Goals / Non-Goals

**Goals:** a visitor learns what Tonaris does and why it differs, without leaving the sign-in page.

**Non-Goals:** a separate marketing site, screenshots, pricing, a waitlist, analytics.

## Decisions

### 1. The card stays the task

The card comes first in the page's order, so keyboard and screen-reader users reach sign-in at once. On the desktop, CSS order moves it to the right of the promo. On a phone it stays on top, under the wordmark.

### 2. Opt-in on the frame

`SignInCard` takes `promo`, and only the `/sign-in` layout sets it, so both steps (email and code) keep it. Pages that finish other flows stay focused.

### 3. Claims the product keeps

Each line states what Tonaris does today: the MCP clients verified in M9 and its approvals (FR-10.6), nesting up to `maxContainerDepth` (TS-18, read from the domain), lists, view-only sharing by invitation or link (FR-07), and the export with Trash (FR-08). No other service's logo or content (DS-19).

### 4. Text only

Lucide icons and type from the design system: nothing loads from elsewhere, and the page stays as fast as before.

## Risks / Trade-offs

- **The copy** is reviewed by the creator in the running product, as all copy is.
