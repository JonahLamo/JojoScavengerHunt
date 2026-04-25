// =====================================================
// MAP SETUP
// =====================================================

const map = L.map("map").setView([51.052651357328145, -114.08704071619806], 16);
L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: "&copy; OpenStreetMap contributors" }
).addTo(map);

const DEFAULT_VIEW = {
  center: [51.052651357328145, -114.08704071619806],
  zoom: 16
};

document.getElementById("resetViewBtn").addEventListener("click", () => {
  map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
});

fetch("geojsons/border.geojson")
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data).addTo(map);
  });

map.on("moveend zoomend resize", () => {
    console.log("---- MAP STATE ----");
    console.log("Size:", map.getSize());
    console.log("Center:", map.getCenter());
    console.log("Zoom:", map.getZoom());
    console.log("Bounds:", map.getBounds());
});


// =====================================================
// HINT SYSTEM
// =====================================================

const HINTS_TO_SHOW = 4;  // number of active hints visible at once

// Seeded pseudo-random number generator (mulberry32)
// Each team number produces a fully deterministic, unique shuffle
function seededRng(seed) {
  let s = seed;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle using seeded rng
function shuffleWithSeed(arr, seed) {
  const rng = seededRng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- State ----
let allHints = [];          // raw hints from JSON
let teamQueue = [];         // shuffled hint indices for current team, not yet shown
let activeHints = [];       // currently shown: [{ originalIndex, text }]
let completedHints = [];    // completed: [{ originalIndex, text }]
let completedCount = 0;

// ---- Render active hints ----
function renderActiveHints() {
  const legend = document.querySelector("#legend");
  legend.innerHTML = "";

  if (!activeHints.length) {
    const li = document.createElement("li");
    li.textContent = teamQueue.length === 0 && completedHints.length > 0
      ? "All hints completed! Great job!"
      : "Select a team above to start.";
    legend.appendChild(li);
    return;
  }

  activeHints.forEach((hint, slotIndex) => {
    const li = document.createElement("li");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.setAttribute("aria-label", "Mark hint as completed");
    cb.addEventListener("change", () => {
      if (cb.checked) completeHint(slotIndex);
    });

    const span = document.createElement("span");
    span.textContent = hint.text;

    li.appendChild(cb);
    li.appendChild(span);
    legend.appendChild(li);
  });
}

// ---- Complete a hint: move to completed table, pull next from queue ----
function completeHint(slotIndex) {
  const done = activeHints[slotIndex];
  completedCount++;

  // Add to completed list
  completedHints.push(done);
  renderCompletedTable();

  // Pull next hint from queue if available
  if (teamQueue.length > 0) {
    const nextIdx = teamQueue.shift();
    activeHints[slotIndex] = { originalIndex: nextIdx, text: allHints[nextIdx] };
  } else {
    activeHints.splice(slotIndex, 1);
  }

  renderActiveHints();
}

// ---- Render completed table ----
function renderCompletedTable() {
  const noMsg = document.getElementById("noCompleted");
  const table = document.getElementById("completedTable");
  const tbody = document.getElementById("completedBody");

  if (completedHints.length === 0) {
    noMsg.style.display = "";
    table.style.display = "none";
    return;
  }

  noMsg.style.display = "none";
  table.style.display = "";
  tbody.innerHTML = "";

  completedHints.forEach((hint, i) => {
    const tr = document.createElement("tr");
    const tdNum = document.createElement("td");
    tdNum.textContent = i + 1;
    const tdText = document.createElement("td");
    tdText.textContent = hint.text;
    tdText.style.textDecoration = "line-through";
    tdText.style.opacity = "0.7";
    tr.appendChild(tdNum);
    tr.appendChild(tdText);
    tbody.appendChild(tr);
  });
}

// ---- Initialize for a chosen team ----
function initTeam(teamNumber) {
  const shuffled = shuffleWithSeed(
    allHints.map((_, i) => i),  // shuffle indices
    teamNumber * 9973             // multiply by prime so team seeds are well-separated
  );

  completedHints = [];
  completedCount = 0;
  renderCompletedTable();

  // First HINTS_TO_SHOW go into activeHints, rest into queue
  activeHints = shuffled.slice(0, HINTS_TO_SHOW).map(idx => ({
    originalIndex: idx,
    text: allHints[idx]
  }));
  teamQueue = shuffled.slice(HINTS_TO_SHOW);

  renderActiveHints();
}

// ---- Team dropdown listener ----
document.getElementById("teamSelect").addEventListener("change", function () {
  const val = parseInt(this.value);
  if (!isNaN(val) && val >= 1) {
    initTeam(val);
  } else {
    // Reset to blank state
    activeHints = [];
    teamQueue = [];
    completedHints = [];
    completedCount = 0;
    renderActiveHints();
    renderCompletedTable();
  }
});

// ---- Load hints from JSON ----
if (document.querySelector("#ifo")) {
  fetch("mapText.json")
    .then(response => response.json())
    .then(data => {
      document.querySelector("#prjAbt").textContent = data.prjAbt;
      allHints = data.Hints;
      renderActiveHints(); // shows "select a team" message
    });
}


// =====================================================
// POPUP HELPERS
// =====================================================

const POPUP_FIELDS = {
  prjLoc: ["Name"]
};

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPopupHtml(layerName, feature) {
  const props = feature?.properties || {};
  const desired = POPUP_FIELDS[layerName] || [];

  let rows = [];

  for (const k of desired) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== "") {
      rows.push(`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(props[k])}</td></tr>`);
    }
  }

  if (rows.length === 0) {
    const keys = Object.keys(props).slice(0, 6);
    for (const k of keys) {
      rows.push(`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(props[k])}</td></tr>`);
    }
  }

  return `
    <div class="popup">
      <div class="popup-title"><b>${escapeHtml(layerName)}</b></div>
      <table class="popup-table">${rows.join("")}</table>
    </div>
  `;
}