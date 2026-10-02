import { loadPageFooter, loadPageHeader } from "../assets/js/pageFragments";

describe("page fragment loading", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="header-placeholder"></div>
      <div id="footer-placeholder"></div>
    `;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("checks the response and sets the header version after loading", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<span id="version-placeholder"></span>'
    });

    await expect(loadPageHeader("0.3.1")).resolves.toBe(true);

    expect(document.getElementById("version-placeholder").textContent)
      .toBe("Version 0.3.1");
  });

  test("shows a visible fallback when a fragment returns an HTTP error", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable"
    });

    await expect(loadPageFooter()).resolves.toBe(false);

    expect(document.getElementById("footer-placeholder").textContent)
      .toBe("Der Fußbereich konnte nicht geladen werden.");
    expect(console.error).toHaveBeenCalled();
  });

  test("handles a rejected fragment request", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("Network unavailable"));

    await expect(loadPageHeader()).resolves.toBe(false);

    expect(document.getElementById("header-placeholder").textContent)
      .toBe("Der Kopfbereich konnte nicht geladen werden.");
  });

  test("preserves an existing header fallback when loading fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    document.getElementById("header-placeholder").innerHTML = "<header>BeeLot</header>";
    global.fetch = jest.fn().mockRejectedValue(new Error("Network unavailable"));

    await expect(loadPageHeader()).resolves.toBe(false);

    expect(document.querySelector("#header-placeholder header").textContent)
      .toBe("BeeLot");
  });
});
