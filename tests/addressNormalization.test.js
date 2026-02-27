import {
  buildAddressQueries,
  buildCanonicalAddressFromResult,
  buildCityTypoCandidates,
  collectPhotonSettlementCandidates,
  collectSettlementCandidates,
  getCountryCodeForCountryName,
  isSettlementSearchResult,
  normalizeAddressFormData,
  normalizeCountryName,
  pickBestSearchResult
} from "../assets/js/addressNormalization";

describe("normalizeCountryName", () => {
  test("maps D to Deutschland", () => {
    expect(normalizeCountryName("D")).toBe("Deutschland");
  });

  test("maps CH and Sch to Schweiz", () => {
    expect(normalizeCountryName("CH")).toBe("Schweiz");
    expect(normalizeCountryName("Sch")).toBe("Schweiz");
  });

  test("maps O/Ö/Au to Österreich", () => {
    expect(normalizeCountryName("O")).toBe("Österreich");
    expect(normalizeCountryName("Ö")).toBe("Österreich");
    expect(normalizeCountryName("Au")).toBe("Österreich");
  });

  test("maps English country names to canonical German names", () => {
    expect(normalizeCountryName("Germany")).toBe("Deutschland");
    expect(normalizeCountryName("Switzerland")).toBe("Schweiz");
    expect(normalizeCountryName("Austria")).toBe("Österreich");
  });
});

describe("normalizeAddressFormData", () => {
  test("uses Deutschland as default country", () => {
    expect(normalizeAddressFormData({ street: "", city: "Stuttgart", country: "" })).toEqual({
      street: "",
      city: "Stuttgart",
      country: "Deutschland"
    });
  });
});

describe("getCountryCodeForCountryName", () => {
  test("maps Deutschland/Schweiz/Österreich to de/ch/at", () => {
    expect(getCountryCodeForCountryName("Deutschland")).toBe("de");
    expect(getCountryCodeForCountryName("Schweiz")).toBe("ch");
    expect(getCountryCodeForCountryName("Österreich")).toBe("at");
  });

  test("maps aliases to country codes", () => {
    expect(getCountryCodeForCountryName("D")).toBe("de");
    expect(getCountryCodeForCountryName("CH")).toBe("ch");
    expect(getCountryCodeForCountryName("Au")).toBe("at");
  });

  test("returns empty code for unknown country", () => {
    expect(getCountryCodeForCountryName("Frankreich")).toBe("");
  });
});

describe("buildCityTypoCandidates", () => {
  test("contains Wuppertal candidate for Wupertal", () => {
    const candidates = buildCityTypoCandidates("Wupertal");
    expect(candidates).toContain("Wuppertal");
  });

  test("contains Emden candidate for Enden", () => {
    const candidates = buildCityTypoCandidates("Enden");
    expect(candidates).toContain("Emden");
  });
});

describe("buildAddressQueries", () => {
  test("generates typo-fallback queries for city names", () => {
    const queries = buildAddressQueries({
      street: "",
      city: "Wupertal",
      country: "D"
    });
    expect(queries[0]).toBe("Wupertal, Deutschland");
    expect(queries).toContain("Wuppertal, Deutschland");
  });

  test("generates substitution fallback query Enden -> Emden", () => {
    const queries = buildAddressQueries({
      street: "",
      city: "Enden",
      country: "D"
    });
    expect(queries).toContain("Emden, Deutschland");
  });

  test("keeps street in all generated queries", () => {
    const queries = buildAddressQueries({
      street: "Musterweg 1",
      city: "Wupertal",
      country: "D"
    });
    expect(queries[0]).toBe("Musterweg 1, Wupertal, Deutschland");
    expect(queries).toContain("Musterweg 1, Wuppertal, Deutschland");
  });
});

describe("buildCanonicalAddressFromResult", () => {
  test("persists corrected city spelling from geocoding result", () => {
    const fallback = { street: "", city: "Stutgart", country: "D" };
    const result = {
      address: {
        city: "Stuttgart",
        country: "Deutschland"
      }
    };

    expect(buildCanonicalAddressFromResult(result, fallback)).toEqual({
      street: "",
      city: "Stuttgart",
      country: "Deutschland"
    });
  });

  test("uses display_name to correct city when address city is missing", () => {
    const fallback = { street: "", city: "Belin", country: "D" };
    const result = {
      display_name: "Berlin, Deutschland",
      address: {
        country: "Deutschland"
      }
    };

    expect(buildCanonicalAddressFromResult(result, fallback)).toEqual({
      street: "",
      city: "Berlin",
      country: "Deutschland"
    });
  });

  test("extracts city from second display_name segment when first is street", () => {
    const fallback = { street: "Hauptstrasse 1", city: "Belin", country: "D" };
    const result = {
      display_name: "Hauptstrasse 1, Berlin, Deutschland",
      address: {
        country: "Deutschland"
      }
    };

    expect(buildCanonicalAddressFromResult(result, fallback)).toEqual({
      street: "Hauptstrasse 1",
      city: "Berlin",
      country: "Deutschland"
    });
  });

  test("prefers display_name city over typo in name", () => {
    const fallback = { street: "", city: "Belin", country: "D" };
    const result = {
      name: "Belin",
      display_name: "Berlin, Deutschland",
      address: {
        country: "Deutschland"
      }
    };

    expect(buildCanonicalAddressFromResult(result, fallback)).toEqual({
      street: "",
      city: "Berlin",
      country: "Deutschland"
    });
  });

  test("prefers municipality over village for canonical city", () => {
    const fallback = { street: "Helene-Lange-Str. 52", city: "Ostfildern", country: "Germany" };
    const result = {
      display_name: "52, Helene-Lange-Straße, Scharnhauser Park, Ostfildern, Landkreis Esslingen, Baden-Württemberg, 73760, Deutschland",
      address: {
        village: "Scharnhauser Park",
        municipality: "Ostfildern",
        country: "Deutschland"
      }
    };

    expect(buildCanonicalAddressFromResult(result, fallback)).toEqual({
      street: "Helene-Lange-Str. 52",
      city: "Ostfildern",
      country: "Deutschland"
    });
  });
});

describe("search result category selection", () => {
  test("recognizes settlement entries", () => {
    expect(isSettlementSearchResult({
      addresstype: "town",
      type: "administrative",
      category: "boundary"
    })).toBe(true);
    expect(isSettlementSearchResult({
      addresstype: "locality",
      type: "locality",
      category: "place"
    })).toBe(false);
  });

  test("prefers settlement entries when required", () => {
    const first = {
      name: "Kurze Enden",
      addresstype: "locality",
      type: "locality",
      category: "place"
    };
    const second = {
      name: "Emden",
      addresstype: "town",
      type: "administrative",
      category: "boundary"
    };
    expect(pickBestSearchResult([first, second], true)).toEqual(second);
    expect(pickBestSearchResult([first], true)).toBeNull();
  });

  test("collects only settlement candidates with unique labels", () => {
    const results = [
      {
        name: "Neustadt an der Weinstraße",
        display_name: "Neustadt an der Weinstraße, Rheinland-Pfalz, Deutschland",
        addresstype: "town",
        type: "administrative",
        category: "boundary",
        lat: "49.3539802",
        lon: "8.1350021",
        address: { town: "Neustadt an der Weinstraße", country: "Deutschland" }
      },
      {
        name: "Kurze Enden",
        display_name: "Kurze Enden, Fahrland, Potsdam, Brandenburg, Deutschland",
        addresstype: "locality",
        type: "locality",
        category: "place",
        lat: "52.4300000",
        lon: "13.0100000",
        address: { locality: "Kurze Enden", country: "Deutschland" }
      }
    ];

    const candidates = collectSettlementCandidates(results, {
      street: "",
      city: "Neustadt",
      country: "Deutschland"
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].normalized.city).toBe("Neustadt an der Weinstraße");
    expect(candidates[0].label).toContain("Neustadt an der Weinstraße");
  });
});

describe("collectPhotonSettlementCandidates", () => {
  test("keeps settlement entries and builds descriptive labels", () => {
    const features = [
      {
        geometry: { coordinates: [9.2832, 48.6796] },
        properties: {
          type: "city",
          name: "Neuhausen auf den Fildern",
          county: "Landkreis Esslingen",
          state: "Baden-Württemberg",
          country: "Deutschland",
          countrycode: "de"
        }
      },
      {
        geometry: { coordinates: [9.2000, 48.7000] },
        properties: {
          type: "house",
          name: "Irgendein Haus",
          country: "Deutschland",
          countrycode: "de"
        }
      }
    ];

    const candidates = collectPhotonSettlementCandidates(features, {
      street: "",
      city: "Neuhausen",
      country: "Deutschland"
    }, "de");

    expect(candidates).toHaveLength(1);
    expect(candidates[0].normalized.city).toBe("Neuhausen auf den Fildern");
    expect(candidates[0].label).toContain("Neuhausen auf den Fildern");
    expect(candidates[0].label).toContain("Landkreis Esslingen");
  });

  test("filters out candidates from another country code", () => {
    const features = [
      {
        geometry: { coordinates: [8.0, 47.0] },
        properties: {
          type: "city",
          name: "Neuhausen",
          country: "Schweiz",
          countrycode: "ch"
        }
      }
    ];

    const candidates = collectPhotonSettlementCandidates(features, {
      street: "",
      city: "Neuhausen",
      country: "Deutschland"
    }, "de");

    expect(candidates).toHaveLength(0);
  });
});
