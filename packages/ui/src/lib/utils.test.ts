// Class merging with the theme's text sizes (DS-13): a size and a color are different things; two sizes, the later wins.

import { describe, expect, test } from "bun:test";

import { buttonVariants } from "../components/button";
import { cn } from "./utils";

describe("cn", () => {
  test("a theme text size keeps the text color, and the later of two sizes replaces the other", () => {
    expect(cn("text-small", "text-status-danger")).toBe("text-small text-status-danger");
    expect(cn("text-small", "text-title")).toBe("text-title");
    expect(cn("text-[0.875rem]/5 text-fg-primary", "text-small")).toBe(
      "text-fg-primary text-small",
    );
  });

  test("a small danger button keeps its red", () => {
    const classes = cn(buttonVariants({ variant: "danger", size: "sm" })).split(" ");
    expect(classes).toContain("text-status-danger");
    expect(classes).toContain("text-small");
    expect(classes).not.toContain("text-base");
  });
});
