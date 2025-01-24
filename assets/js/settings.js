/**
 * @module settings
 * Funktionen für Settings
 */
// Funktion zum Ein-/Ausklappen der Abschnitte
document.querySelectorAll('.settings-heading').forEach((heading) => {
  heading.addEventListener('click', () => {
    const targetId = heading.dataset.target;
    const content = document.getElementById(targetId);
    const arrow = heading.querySelector('.arrow');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▼';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▶';
    }
  });
});

/* Default data for Tracht */
const defaultTrachtData = [
    { active: true, TS_start: 35, TS_end: 70, plant: "Blüte: Schneeglöckchen, Winterlinge" },
    { active: true, TS_start: 65, TS_end: 120, plant: "Blüte: Krokos, Hasel, Winterjasmin" },
    { active: true, TS_start: 175, TS_end: 230, plant: "Blüte: Osterglocken klein, Forsythien" },
    { active: true, TS_start: 175, TS_end: 260, plant: "Blüte: Weidenkätzchen, frühblühende Kirschen" },
    { active: true, TS_start: 275, TS_end: 300, plant: "Blüte: Osterglocken, Austrieb: Holunder" },
    { active: true, TS_start: 335, TS_end: 380, plant: "Vorblüte: Birke" },
    { active: true, TS_start: 365, TS_end: 460, plant: "Vorblüte: Kirsche" },
    { active: true, TS_start: 400, TS_end: 400, plant: "Empfehlung: Honigräume aufsetzen" },
    { active: true, TS_start: 440, TS_end: 440, plant: "Vollblüte: frühblühende Magnolien" },
    { active: true, TS_start: 530, TS_end: 530, plant: "Vollblüte: Kirsche, Birke" },
    { active: true, TS_start: 530, TS_end: 530, plant: "Vorblüte: Apfel" },
    { active: true, TS_start: 540, TS_end: 540, plant: "Blattaustrieb: Birke, Walnuss und Pappel" },
    { active: true, TS_start: 550, TS_end: 550, plant: "Blattaustrieb Apfel" },
    { active: true, TS_start: 550, TS_end: 550, plant: "Vollblüte: Raps" },
    { active: true, TS_start: 580, TS_end: 580, plant: "Vorblüte: Flieder" },
    { active: true, TS_start: 700, TS_end: 700, plant: "Vollblüte: Apfel, Löwenzahn" },
    { active: true, TS_start: 750, TS_end: 750, plant: "Blüte: Rosskastanie (Aesculus hippocastanum)" },
    { active: true, TS_start: 820, TS_end: 820, plant: "Blüte: Holunder" },
    { active: true, TS_start: 850, TS_end: 850, plant: "Blüte: Robinie" },
    { active: false, TS_start: 900, TS_end: 900, plant: "Blüte: Faulbaum" },
    { active: true, TS_start: 1000, TS_end: 1200, plant: "Vollblüte: Edelkastanie (Castanea sativa)" },
    { active: true, TS_start: 1100, TS_end: 1100, plant: "Blüte: Wilde Brombeere" },
    { active: true, TS_start: 1200, TS_end: 1200, plant: "Blüte: Sommerlinde" },
    { active: true, TS_start: 1400, TS_end: 1400, plant: "Blüte: Winterlinde" },
];

// Pollenlieferanten (mit wenig oder keinem Nektar):
// Hasel (Blüte: Hasel)
//
// Pollen: Sehr reichhaltig, erste wichtige Pollenquelle im Jahr.
// Nektar: Keiner vorhanden.
// Birke (Vorblüte: Birke, Vollblüte: Birke)
//
// Pollen: Große Mengen, windbestäubt.
// Nektar: Keiner vorhanden.
// Weidenkätzchen (Blüte: Weidenkätzchen)
//
// Pollen: Sehr ergiebig, eine der ersten Pollenquellen im Frühjahr.
// Nektar: Nur geringfügig.
// Robinie (Blüte: Robinie)
//
// Pollen: Sehr wenig im Vergleich zum Nektar.
// Nektar: Hauptquelle, daher eher ein Nektarlieferant.
// Gräser (z. B. Faulbaum in der Liste)
//
// Pollen: Faulbaum liefert geringe Mengen an Pollen, ist jedoch nicht besonders attraktiv für Bienen.
// Nektar: Keiner vorhanden.
// Hauptnektarlieferanten in der Liste:
// Frühblühende Pflanzen wie Schneeglöckchen, Winterlinge und Krokusse liefern sowohl Nektar als auch Pollen.
// Robinie und Raps sind ausgezeichnete Nektarspender.
// Fazit:
// Die Haupt-Pollenlieferanten aus der Liste sind:
//
// Hasel
// Birke
// Weidenkätzchen
// Diese Pflanzen sind für Bienen besonders wichtig, da sie früh im Jahr große Mengen an Pollen liefern, wenn andere Nahrungsquellen noch knapp sind.

const TRACT_DATA_KEY = 'trachtData';

document.addEventListener("DOMContentLoaded", () => {
  loadTrachtData();
});

function loadTrachtData() {
  const stored = localStorage.getItem(TRACT_DATA_KEY);
  const data = stored ? JSON.parse(stored) : defaultTrachtData;
  populateTrachtTable(data);
  saveTrachtData(data);
}

function populateTrachtTable(data) {
    const tbody = document.querySelector("#tracht-table tbody");
    tbody.innerHTML = "";

    data.forEach((row, idx) => {
        const tr = document.createElement("tr");
        tr.className = row.active ? "row-active" : "row-inactive";

        const tdCheck = document.createElement("td");
        tdCheck.className = "checkbox-cell";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = row.active;
        checkbox.onclick = () => toggleActive(idx);
        tdCheck.appendChild(checkbox);
        tr.appendChild(tdCheck);

        const tdStart = document.createElement("td");
        tdStart.className = "numeric-cell";
        const startInput = document.createElement("input");
        startInput.type = "text";
        startInput.value = row.TS_start;
        startInput.maxLength = 4;
        startInput.style.textAlign = "right";
        startInput.style.border = "none";
        startInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
        startInput.onchange = () => updateStart(idx, startInput.value);
        tdStart.appendChild(startInput);
        tr.appendChild(tdStart);

        const tdEnd = document.createElement("td");
        tdEnd.className = "numeric-cell";
        const endInput = document.createElement("input");
        endInput.type = "text";
        endInput.value = row.TS_end;
        endInput.maxLength = 4;
        endInput.style.textAlign = "right";
        endInput.style.border = "none";
        endInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
        endInput.onchange = () => updateEnd(idx, endInput.value);
        tdEnd.appendChild(endInput);
        tr.appendChild(tdEnd);

        const tdPlant = document.createElement("td");
        tdPlant.className = "plant-cell";
        const plantInput = document.createElement("input");
        plantInput.type = "text";
        plantInput.value = row.plant;
        plantInput.style.width = "100%";
        plantInput.style.border = "none";
        plantInput.style.backgroundColor = "transparent";
        plantInput.onchange = () => updatePlant(idx, plantInput.value);
        tdPlant.appendChild(plantInput);
        tr.appendChild(tdPlant);

        const tdTrash = document.createElement("td");
        tdTrash.className = "trash-cell";
        const trashIcon = document.createElement("span");
        trashIcon.innerHTML = "🗑️";
        trashIcon.style.cursor = "pointer";
        trashIcon.onclick = () => deleteRow(idx);
        tdTrash.appendChild(trashIcon);
        tr.appendChild(tdTrash);

        tbody.appendChild(tr);
    });
}

function updatePlant(idx, value) {
   const data = getTrachtData();
   data[idx].plant = value;
   saveTrachtData(data);
}

function deleteRow(idx) {
  const data = getTrachtData();
  data.splice(idx, 1);
  saveTrachtData(data);
  populateTrachtTable(data);
}

function getTrachtData() {
  return JSON.parse(localStorage.getItem(TRACT_DATA_KEY));
}

function saveTrachtData(data) {
  localStorage.setItem(TRACT_DATA_KEY, JSON.stringify(data));
}

function toggleActive(idx) {
  const data = getTrachtData();
  data[idx].active = !data[idx].active;
  saveTrachtData(data);
  populateTrachtTable(data);
}

function updateStart(idx, value) {
  const data = getTrachtData();
  const newValue = Math.max(1, parseInt(value, 10) || 1);
  data[idx].TS_start = newValue;
  if (data[idx].TS_end < newValue) {
    data[idx].TS_end = newValue;
  }
  saveTrachtData(data);
  populateTrachtTable(data);
}

function updateEnd(idx, value) {
  const data = getTrachtData();
  const newValue = Math.max(1, parseInt(value, 10) || 1);
  data[idx].TS_end = Math.max(newValue, data[idx].TS_start);
  saveTrachtData(data);
  populateTrachtTable(data);
}

function addTrachtRow() {
  const data = getTrachtData();
  data.push({
    active: true,
    TS_start: 9000,
    TS_end: 9000,
    plant: "Neue Pflanze"
  });
  saveTrachtData(data);
  populateTrachtTable(data);
}

function resetTrachtData() {
  if (!confirm("Willst du wirklich alles zurücksetzen?")) return;
  saveTrachtData(defaultTrachtData);
  populateTrachtTable(defaultTrachtData);
}
