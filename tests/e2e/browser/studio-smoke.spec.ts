import { expect, test } from "@playwright/test";

test("loads the Studio shell with a real zeroclaw gateway behind browser mocks", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("ZeroClaw Studio").first()).toBeVisible();
  await expect(page.getByText("ZeroClaw Studio Test Gateway").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
});
