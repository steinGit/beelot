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

    expect(externalElements).toHaveLength(4);
    externalElements.forEach((element) => {
      const url = element.getAttribute("href") || element.getAttribute("src");
      if (url.includes("cdn.sheetjs.com")) {
        expect(url).toMatch(/xlsx-0\.20\.3\//);
      } else {
        expect(url).toMatch(/@(1\.9\.4|4\.5\.1)\//);
      }
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
    const actionReferences = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)];
    expect(actionReferences.length).toBeGreaterThanOrEqual(3);
    actionReferences.forEach(([, reference]) => {
      expect(reference).toMatch(/^[0-9a-f]{40}$/);
    });
  });

  test("requires the quality gate before publishing a release", () => {
    const workflow = fs.readFileSync(
      path.join(repositoryRoot, ".github/workflows/release.yml"),
      "utf8"
    );

    expect(workflow).toMatch(/quality:\n[\s\S]*npm run test:coverage/);
    expect(workflow).toMatch(/TZ:\s+America\/Los_Angeles/);
    expect(workflow).toMatch(/npm run lint/);
    expect(workflow).toMatch(/npm audit --audit-level=low/);
    expect(workflow).toMatch(/release:\n\s+needs:\s+quality/);
  });
});
