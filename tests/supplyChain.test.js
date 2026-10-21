import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(process.cwd());

describe("external dependency pinning", () => {
  test("loads YAML coverage configuration with the overridden parser", () => {
    const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "beelot-nyc-"));
    try {
      fs.writeFileSync(path.join(configDirectory, ".nycrc.yaml"),
        "all: true\ncheck-coverage: true\ninclude:\n  - assets/js/**/*.js\n", "utf8");
      const output = execFileSync(process.execPath, ["--input-type=commonjs", "--eval", `
        const { loadNycConfig } = require('@istanbuljs/load-nyc-config');
        loadNycConfig({ cwd: process.argv[1], nycrcPath: '.nycrc.yaml' })
          .then(config => console.log(JSON.stringify(config)))
          .catch(error => { console.error(error); process.exitCode = 1; });
      `, configDirectory], { cwd: repositoryRoot, encoding: "utf8" });
      expect(JSON.parse(output)).toEqual(expect.objectContaining({
        all: true,
        checkCoverage: true,
        include: ["assets/js/**/*.js"]
      }));
    } finally {
      fs.rmSync(configDirectory, { recursive: true, force: true });
    }
  });

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
