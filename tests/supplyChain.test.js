import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());

describe("external dependency pinning", () => {
  test("pins browser CDN assets and requires integrity metadata", () => {
    const html = fs.readFileSync(path.join(repositoryRoot, "index.html"), "utf8");
    const document = new DOMParser().parseFromString(html, "text/html");
    const externalElements = [
      ...document.querySelectorAll("link[href^='https://'], script[src^='https://']")
    ];

    expect(externalElements).toHaveLength(3);
    externalElements.forEach((element) => {
      const url = element.getAttribute("href") || element.getAttribute("src");
      expect(url).toMatch(/@(1\.9\.4|4\.5\.1)\//);
      expect(element.getAttribute("integrity")).toMatch(/^sha384-[A-Za-z0-9+/]+={0,2}$/);
      expect(element.getAttribute("crossorigin")).toBe("anonymous");
    });
  });

  test("pins the release action to a full commit SHA", () => {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, ".github/workflows/release.yml"),
      "utf8"
    );

    expect(workflow).toMatch(
      /uses: softprops\/action-gh-release@[0-9a-f]{40}(?:\s+#\s+v2)?/
    );
    expect(workflow).not.toContain("softprops/action-gh-release@v2");
  });
});
