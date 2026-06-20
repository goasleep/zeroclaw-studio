describe("ZeroClaw Studio Tauri smoke", () => {
  it("starts the real desktop app and leaves the loading screen", async () => {
    await browser.waitUntil(async () => (await browser.getTitle()) === "ZeroClaw Studio", {
      timeout: 20_000,
      timeoutMsg: "expected the ZeroClaw Studio window title",
    });

    await browser.waitUntil(
      async () => {
        const text = await $("body").getText();
        return text.includes("ZeroClaw Studio") && !text.includes("Loading");
      },
      {
        timeout: 30_000,
        timeoutMsg: "expected the Studio shell to become visible",
      },
    );
  });
});
