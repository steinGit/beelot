import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function readProjectFile(relativePath) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("responsive page styles", () => {
  test("keeps index-specific layout rules out of the shared stylesheet", () => {
    const sharedCss = readProjectFile("assets/css/style.css");

    expect(sharedCss).not.toMatch(/\.location-panel/);
    expect(sharedCss).not.toMatch(/\.plot-container/);
    expect(sharedCss).not.toMatch(/\.plot-wrapper/);
    expect(sharedCss).toMatch(/@media \(max-width: 480px\)[\s\S]*\.logo\s*\{[^}]*height:\s*70px;/);
  });

  test("places responsive index overrides after their base rules without clipping plots", () => {
    const indexCss = readProjectFile("assets/css/index.css");
    const basePanel = indexCss.indexOf(".location-panel {");
    const mobileRules = indexCss.lastIndexOf("@media (max-width: 480px)");

    expect(mobileRules).toBeGreaterThan(basePanel);
    expect(indexCss).toMatch(/\.plot-container\s*\{[^}]*overflow:\s*visible;/s);
    expect(indexCss).toMatch(/@media \(max-width: 600px\)[\s\S]*\.plot-wrapper,[\s\S]*#temp-plot\s*\{[^}]*height:\s*320px;/);
  });

  test("provides a mobile viewport on the settings page", () => {
    const settingsHtml = readProjectFile("components/einstellungen.html");

    expect(settingsHtml).toContain('name="viewport"');
    expect(settingsHtml).toContain('content="width=device-width, initial-scale=1.0"');
  });
});
