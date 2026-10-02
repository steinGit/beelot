describe("settings accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    document.body.innerHTML = `
      <button class="settings-heading" data-target="tracht-content"
        aria-expanded="false" aria-controls="tracht-content">
        <span>Tracht</span><span class="arrow" aria-hidden="true">▶</span>
      </button>
      <div id="tracht-content" hidden></div>
      <table id="tracht-table"><tbody></tbody></table>
      <button id="clear-cache-button"></button>
      <button id="clear-local-storage-button"></button>
      <button id="add-tracht-row-button"></button>
      <button id="reset-tracht-data-button"></button>
    `;
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("expands a section with a native button and updates its state", async () => {
    await import("../assets/js/settings");
    const heading = document.querySelector(".settings-heading");
    const content = document.getElementById("tracht-content");

    heading.click();

    expect(heading.tagName).toBe("BUTTON");
    expect(heading.getAttribute("aria-expanded")).toBe("true");
    expect(content.hidden).toBe(false);
  });

  test("labels every editable row control and uses a delete button", async () => {
    const { populateTrachtTable } = await import("../assets/js/settings");
    populateTrachtTable([{
      active: true,
      TS_start: 100,
      TS_end: 200,
      plant: "Testpflanze",
      url: "https://example.invalid"
    }]);

    const controls = Array.from(document.querySelectorAll("#tracht-table input"));
    expect(controls).toHaveLength(5);
    controls.forEach((control) => {
      expect(control.getAttribute("aria-label")).toBeTruthy();
    });
    const deleteButton = document.querySelector(".delete-row-button");
    expect(deleteButton.tagName).toBe("BUTTON");
    expect(deleteButton.getAttribute("aria-label")).toBe("Testpflanze löschen, Zeile 1");
  });

  test("binds settings actions without window globals", async () => {
    await import("../assets/js/settings");
    document.getElementById("add-tracht-row-button").click();

    expect(JSON.parse(localStorage.getItem("trachtData"))).toHaveLength(1);
    expect(window.addTrachtRow).toBeUndefined();
    expect(window.resetTrachtData).toBeUndefined();

    localStorage.setItem("unrelated", "value");
    document.getElementById("clear-local-storage-button").click();
    expect(localStorage.length).toBe(0);
  });
});
