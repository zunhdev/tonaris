// Viewing and Editing modes in a real browser (FR-04.1, FR-04.2, FR-03.1; DS-45): Viewing by default and Editing kept
// on the device, the header's toggle and tint, E, edit intent switching to Editing, leaving Editing without losing an
// edit, inline album cells, and drag handles shown in Editing only. Each test signs in with its own account.

import { expect, test, type Page } from "@playwright/test";

import { bootstrapSchema } from "@tonaris/domain";

import { accounts, apiUrl } from "./support/accounts";
import { signIn } from "./support/sign-in";
import { added, album, announcements, created, live, saved, violations } from "./support/workspace";

test.use({ storageState: { cookies: [], origins: [] } });

const mode = (page: Page, name: "View" | "Edit") =>
  page.getByRole("radiogroup", { name: "Mode" }).getByRole("radio", { name });
const grid = (page: Page, name: string) => page.getByRole("grid", { name });
const rowOf = (page: Page, gridName: string, text: string) =>
  grid(page, gridName).getByRole("row").filter({ hasText: text });

async function chooseManual(page: Page): Promise<void> {
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page
    .getByRole("dialog", { name: "View options" })
    .getByRole("radiogroup", { name: "Sort" })
    .getByRole("radio", { name: "Manual" })
    .click();
  await page.keyboard.press("Escape");
}

test("Viewing by default; E switches, tints the header, is kept, and sends nothing", async ({
  page,
}) => {
  await signIn(page, accounts.modeSwitch);
  await live(page);
  const doom = await created(page, "Doom");
  await added(page, [album("Nightfall"), album("Ancient Dreams")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);
  await chooseManual(page);
  await saved(page);

  // Viewing: no drag handles, and ⌥↑ still rearranges.
  await expect(mode(page, "View")).toBeChecked();
  await expect(grid(page, "Doom").locator('[data-slot="drag-handle"]')).toHaveCount(0);
  await rowOf(page, "Doom", "Ancient Dreams").getByRole("gridcell").first().click();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(grid(page, "Doom").getByRole("row").nth(1)).toContainText("Ancient Dreams");
  await saved(page);

  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().startsWith(apiUrl)) writes.push(request.url());
  });
  await page.keyboard.press("e");
  await expect(mode(page, "Edit")).toBeChecked();
  await expect(page.locator("main header")).toHaveClass(/border-accent-solid/);
  await expect(announcements(page).first()).toHaveText("Editing mode on");
  await expect(grid(page, "Doom").locator('[data-slot="drag-handle"]')).toHaveCount(2);
  await page.keyboard.press("e");
  await expect(mode(page, "View")).toBeChecked();
  await page.keyboard.press("e");
  expect(writes).toEqual([]);

  await page.reload();
  await live(page);
  await expect(mode(page, "Edit")).toBeChecked();
});

test("starting an edit in Viewing switches to Editing first", async ({ page }) => {
  await signIn(page, accounts.modeIntent);
  await live(page);
  await page.goto("/c");
  await live(page);
  await expect(mode(page, "View")).toBeChecked();
  await page.keyboard.press("n");
  await expect(mode(page, "Edit")).toBeChecked();
  await expect(announcements(page).first()).toHaveText("Editing mode on");
  await expect(page.getByRole("textbox", { name: "Name of the new list" })).toBeFocused();
});

test("leaving Editing saves a valid edit, and an invalid one keeps the mode and its error", async ({
  page,
}) => {
  await signIn(page, accounts.modeLeave);
  await live(page);
  const doom = await created(page, "Doom");
  await added(page, [album("Nightfall")], doom.id);
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // A rename open in the tree is saved when leaving.
  await page.getByRole("tree").getByRole("treeitem", { name: /^Doom/ }).focus();
  await page.keyboard.press("F2");
  await expect(mode(page, "Edit")).toBeChecked();
  await page.getByRole("textbox", { name: "New name for 'Doom'" }).fill("Doom Metal");
  await mode(page, "View").click();
  await expect(mode(page, "View")).toBeChecked();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Doom Metal");

  // A cleared title can't leave.
  await mode(page, "Edit").click();
  await rowOf(page, "Doom Metal", "Nightfall").getByRole("gridcell").first().focus();
  await page.keyboard.press("Enter");
  const title = page.getByRole("textbox", { name: "Title of 'Nightfall'" });
  await title.fill("");
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().startsWith(apiUrl)) writes.push(request.url());
  });
  await mode(page, "View").click();
  await expect(mode(page, "Edit")).toBeChecked();
  await expect(title).toBeFocused();
  await expect(rowOf(page, "Doom Metal", "Give the album a title.")).toBeVisible();
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");
  await mode(page, "View").click();
  await expect(mode(page, "View")).toBeChecked();
  await expect(rowOf(page, "Doom Metal", "Nightfall")).toBeVisible();
});

test("albums are edited inline in their rows", async ({ page }) => {
  await signIn(page, accounts.modeCells);
  await live(page);
  const doom = await created(page, "Doom");
  await added(
    page,
    [
      album("Nightfall", { originalYear: 1987 }),
      album("Live at the Rainbow", { isLive: true, originalYear: 1984, recordingYearStart: 1978 }),
    ],
    doom.id,
  );
  await page.goto(`/l/${doom.id}`);
  await live(page);

  // F2 in Viewing switches to Editing and opens the title.
  const nightfall = rowOf(page, "Doom", "Nightfall");
  await nightfall.getByRole("gridcell").first().focus();
  await page.keyboard.press("F2");
  await expect(mode(page, "Edit")).toBeChecked();
  const title = page.getByRole("textbox", { name: "Title of 'Nightfall'" });
  await expect(title).toBeFocused();
  await title.fill("Nightfall (Remastered)");
  await page.keyboard.press("Enter");
  await expect(rowOf(page, "Doom", "Nightfall (Remastered)")).toBeVisible();
  await expect(
    rowOf(page, "Doom", "Nightfall (Remastered)").getByRole("gridcell").first(),
  ).toBeFocused();

  // A live album's recording range, with Enter on the year.
  const rainbow = rowOf(page, "Doom", "Live at the Rainbow");
  await rainbow.getByRole("gridcell").nth(2).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Year of 'Live at the Rainbow'" }).fill("1978–1982");
  await page.keyboard.press("Enter");
  await expect(rainbow.getByRole("gridcell").nth(2)).toHaveText("rec. 1978–1982");

  // A year the format refuses keeps its editor and sends nothing; a double-click opens one too.
  await saved(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().startsWith(apiUrl)) writes.push(request.url());
  });
  const remastered = rowOf(page, "Doom", "Nightfall (Remastered)");
  await remastered.getByRole("gridcell").nth(2).dblclick();
  const year = page.getByRole("textbox", { name: "Year of 'Nightfall (Remastered)'" });
  await year.fill("nineteen");
  await page.keyboard.press("Enter");
  await expect(remastered).toContainText("Enter the year as four digits, such as 1986.");
  await expect(year).toHaveAttribute("aria-invalid", "true");
  expect(await violations(page, '[role="grid"]')).toEqual([]);
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");

  await saved(page);
  const response = await page.request.get(`${apiUrl}/v1/sync/bootstrap`);
  const albums = bootstrapSchema.parse(await response.json()).albums;
  expect(albums.map((each) => each.title).toSorted()).toEqual([
    "Live at the Rainbow",
    "Nightfall (Remastered)",
  ]);
  expect(albums.find((each) => each.isLive)).toMatchObject({
    recordingYearStart: 1978,
    recordingYearEnd: 1982,
    artworkUrl: null,
  });
});
