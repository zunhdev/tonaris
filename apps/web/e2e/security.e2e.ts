// The web app's security headers in the browser (TS-101): the CSP with its per-request nonce, enforced, and the
// other headers on every page.

import { expect, type Page, test } from "@playwright/test";

import { apiUrl, nobody } from "./support/accounts";

const signedOut = { cookies: [], origins: [] };

/** Records CSP violations from the moment the page starts, as "directive blocked source:line:column". */
async function watchViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { cspViolations: seen });
    document.addEventListener("securitypolicyviolation", (event) => {
      seen.push(
        `${event.effectiveDirective} ${event.blockedURI || "inline"} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
      );
    });
  });
  return () =>
    page.evaluate(() => {
      const seen: unknown = Reflect.get(window, "cspViolations");
      return Array.isArray(seen) ? seen.map(String) : [];
    });
}

test.describe("security headers", () => {
  test.use({ storageState: signedOut });

  test("every page sends them, with a fresh nonce that the page's scripts carry", async ({
    request,
  }) => {
    const pages = await Promise.all(["/sign-in", "/c"].map((path) => request.get(path)));
    const nonces = await Promise.all(
      pages.map(async (response) => {
        const headers = response.headers();
        const csp = headers["content-security-policy"] ?? "";
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain(`connect-src 'self' ${apiUrl}`);
        expect(csp).toContain(`img-src 'self' data: ${apiUrl}`);
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("base-uri 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
        expect(headers["x-content-type-options"]).toBe("nosniff");
        expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

        const nonce = /script-src 'self' 'nonce-([^']+)'/.exec(csp)?.[1];
        expect(nonce).toBeTruthy();
        expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
        // Every script in the document carries this response's nonce.
        const html = await response.text();
        const scripts = html.match(/<script\b[^>]*>/g) ?? [];
        expect(scripts.length).toBeGreaterThan(0);
        for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);
        return nonce;
      }),
    );
    expect(new Set(nonces).size).toBe(nonces.length);
  });

  test("guest share and invitation pages send no referrer", async ({ request }) => {
    for (const path of ["/s/some-share-token", "/join/some-invitation-token"]) {
      // oxlint-disable-next-line no-await-in-loop
      const response = await request.get(path);
      expect({ path, policy: response.headers()["referrer-policy"] }).toEqual({
        path,
        policy: "no-referrer",
      });
    }
  });
});

test.describe("the CSP in the browser", () => {
  test.describe("signed out", () => {
    test.use({ storageState: signedOut });

    for (const path of ["/sign-in", `/sign-in/verify?email=${encodeURIComponent(nobody)}`]) {
      test(`${path.split("?")[0]} runs without violations`, async ({ page }) => {
        const violations = await watchViolations(page);
        await page.goto(path);
        await page.getByRole("main").waitFor();
        await expect(page.getByRole("button").first()).toBeEnabled();
        expect(await violations()).toEqual([]);
      });
    }

    test("an inline script without the nonce doesn't run", async ({ page }) => {
      const violations = await watchViolations(page);
      await page.goto("/sign-in");
      const ran = await page.evaluate(() => {
        const script = document.createElement("script");
        script.textContent = "window.injected = true";
        document.body.append(script);
        return "injected" in window;
      });
      expect(ran).toBe(false);
      await expect
        .poll(async () =>
          (await violations()).map((violation) => violation.split(" ", 2).join(" ")),
        )
        .toEqual(["script-src-elem inline"]);
    });
  });

  test("the workspace and its menus run without violations", async ({ page }) => {
    const violations = await watchViolations(page);
    await page.goto("/c");
    await expect(page.getByRole("main", { name: "Collection" })).toBeVisible();
    await page.getByRole("button", { name: /^Account: / }).click();
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await violations()).toEqual([]);
  });
});
