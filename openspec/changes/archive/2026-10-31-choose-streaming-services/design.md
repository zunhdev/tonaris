# Design

## Context

TON-104 put a link setting on the account defaults: a column of `account_settings`, carried by the bootstrap's and the stream's `defaults`, and set by its own mutation so `defaults.set`'s request stays byte-identical (oasdiff reads any change to an existing mutation's request as a removal). The panel's Links section (`album-links.tsx`) and New album (`new-album.tsx`) listed every service.

## Decisions

### 1. Store what's off

`account_settings.hidden_services` is a `text[]` of the services turned off, default empty, with a check that each is a known service. Keeping what's off means a service added later, such as YouTube Music (TON-131), starts on for everyone. The list is kept in the services' order, so equal lists compare as equal.

### 2. A mutation of its own

`defaults.setHiddenServices` takes the new list and the prior one as its base (TS-21). A stale base is a conflict on `hiddenServices`, whatever its order, and the same list changes nothing. The request side of the OpenAPI document only adds this variant; the response's defaults gain the field.

### 3. What it hides

Only empty fields. The panel's Editing rows are the services that are on plus any the album links; Viewing shows only links, as before. New album shows the services that are on plus any field already filled in, such as a link kept from capture. Capture accepts any service's link, since the choice is about what to show, not what's allowed.

### 4. Settings

A section after Links, with a switch per service and its name as the label, and a note on what it does. Each switch saves at once, through the defaults' row like the other choices.
