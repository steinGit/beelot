import { containDialogFocus } from "../assets/js/dialogFocus";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

describe("containDialogFocus", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="opener">Open</button>
      <div id="dialog" role="dialog">
        <button id="first">First</button>
        <div style="display: none"><button id="hidden">Hidden</button></div>
        <button id="last">Last</button>
      </div>
    `;
  });

  test("cycles Tab focus within the dialog and restores the opener", () => {
    const opener = document.getElementById("opener");
    const dialog = document.getElementById("dialog");
    const first = document.getElementById("first");
    const last = document.getElementById("last");
    opener.focus();

    const release = containDialogFocus(dialog, { initialFocus: first });
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(last);

    last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(first);

    release();
    expect(document.activeElement).toBe(opener);
  });

  test("uses Escape to request closing the dialog", () => {
    const dialog = document.getElementById("dialog");
    const onEscape = jest.fn();
    containDialogFocus(dialog, { onEscape });

    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    }));

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  test("associates every page dialog with an accessible title", () => {
    const html = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    const page = new DOMParser().parseFromString(html, "text/html");

    page.querySelectorAll('[role="dialog"]').forEach((dialog) => {
      const titleId = dialog.getAttribute("aria-labelledby");
      expect(titleId).toBeTruthy();
      expect(page.getElementById(titleId)).not.toBeNull();
      expect(dialog.hasAttribute("inert")).toBe(true);
    });
  });
});
