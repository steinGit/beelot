import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const PAGE_PATHS = [
  "index.html",
  "components/einstellungen.html",
  "components/faq.html",
  "components/impressum.html"
];

function parseHtml(relativePath) {
  const html = readFileSync(path.join(process.cwd(), relativePath), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("deployment compatibility", () => {
  test.each(PAGE_PATHS)("%s contains the header before JavaScript runs", (pagePath) => {
    const page = parseHtml(pagePath);
    const header = page.querySelector("#header-placeholder > header");

    expect(header).not.toBeNull();
    expect(header.querySelector(".logo-text h1").textContent).toBe("BeeLot");
    expect(header.querySelector('nav a[href="index.html"]')).not.toBeNull();
  });

  test("hidden dialogs remain compatible with the previous release controller", () => {
    const page = parseHtml("index.html");

    ["map-popup", "address-popup", "confirm-modal"].forEach((dialogId) => {
      const dialog = page.getElementById(dialogId);
      expect(dialog.getAttribute("aria-hidden")).toBe("true");
      expect(dialog.hasAttribute("inert")).toBe(false);
    });
  });
});
