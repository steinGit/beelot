import { blocksGlobalShortcut } from "../assets/js/keyboardShortcuts";

describe("blocksGlobalShortcut", () => {
  test.each([
    ["text input", '<input type="text">'],
    ["date input", '<input type="date">'],
    ["radio button", '<input type="radio">'],
    ["select", "<select><option>One</option></select>"],
    ["textarea", "<textarea></textarea>"],
    ["editable content", '<div contenteditable="true"></div>']
  ])("blocks global shortcuts for %s", (description, markup) => {
    document.body.innerHTML = markup;

    expect(blocksGlobalShortcut(document.body.firstElementChild)).toBe(true);
  });

  test.each([
    ["button", "<button>Action</button>"],
    ["ordinary content", "<div>Content</div>"]
  ])("allows global shortcuts for %s", (description, markup) => {
    document.body.innerHTML = markup;

    expect(blocksGlobalShortcut(document.body.firstElementChild)).toBe(false);
  });
});
