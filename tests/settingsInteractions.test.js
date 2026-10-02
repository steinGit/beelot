describe("settings plant interactions", () => {
  const initialRow = {
    active: true,
    TS_start: 100,
    TS_end: 200,
    plant: "Hasel",
    url: "https://example.com/hasel"
  };

  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    document.body.innerHTML = `
      <table id="tracht-table"><tbody></tbody></table>
      <button id="add-tracht-row-button" type="button"></button>
      <button id="reset-tracht-data-button" type="button"></button>
    `;
    localStorage.setItem("trachtData", JSON.stringify([initialRow]));
  });

  test("edits, bounds, toggles, and deletes a stored plant row", async () => {
    const { populateTrachtTable } = await import("../assets/js/settings");
    populateTrachtTable([initialRow]);

    document.querySelector('input[type="checkbox"]').click();
    expect(JSON.parse(localStorage.getItem("trachtData"))[0].active).toBe(false);

    const startInput = document.querySelector('input[aria-label^="Temperatursumme Start"]');
    startInput.value = "250";
    startInput.dispatchEvent(new Event("change"));
    expect(JSON.parse(localStorage.getItem("trachtData"))[0]).toMatchObject({
      TS_start: 250,
      TS_end: 250
    });

    const endInput = document.querySelector('input[aria-label^="Temperatursumme Ende"]');
    endInput.value = "10";
    endInput.dispatchEvent(new Event("change"));
    expect(JSON.parse(localStorage.getItem("trachtData"))[0].TS_end).toBe(250);

    const plantInput = document.querySelector('input[aria-label^="Pflanze"]');
    plantInput.value = "Winterhasel";
    plantInput.dispatchEvent(new Event("change"));
    const urlInput = document.querySelector('input[aria-label^="URL"]');
    urlInput.value = "https://example.com/winterhasel";
    urlInput.dispatchEvent(new Event("change"));
    expect(JSON.parse(localStorage.getItem("trachtData"))[0]).toMatchObject({
      plant: "Winterhasel",
      url: "https://example.com/winterhasel"
    });

    document.querySelector(".delete-row-button").click();
    expect(JSON.parse(localStorage.getItem("trachtData"))).toEqual([]);
    expect(document.querySelectorAll("#tracht-table tbody tr")).toHaveLength(0);
  });

  test("adds a complete valid row through the page control", async () => {
    await import("../assets/js/settings");
    document.getElementById("add-tracht-row-button").click();

    expect(JSON.parse(localStorage.getItem("trachtData"))).toEqual([
      initialRow,
      {
        active: true,
        TS_start: 9000,
        TS_end: 9000,
        plant: "Neue Pflanze",
        url: ""
      }
    ]);
    expect(document.querySelectorAll("#tracht-table tbody tr")).toHaveLength(2);
  });
});
