/*
  Fantasy Roster Builder
  ----------------------
  File layout:
  1. Constants and app state
  2. DOM references
  3. Data parsing helpers
  4. Roster and filtering logic
  5. Render helpers
  6. Event handlers
  7. Initialization
*/

// =============================
// Constants and app state
// =============================
const HEADSHOT_BASE = "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/";
const HEADSHOT_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#e7edf2"/><stop offset="1" stop-color="#ccd5dc"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><circle cx="60" cy="46" r="24" fill="#aab8c3"/><path d="M24 104c8-18 25-28 36-28s28 10 36 28" fill="#aab8c3"/></svg>`
  );

const ROSTER_SLOTS = [
  { id: "LF", label: "Left Field", type: "batter", x: 22, y: 33, matchers: ["OF"] },
  { id: "CF", label: "Center Field", type: "batter", x: 50, y: 23, matchers: ["OF"] },
  { id: "RF", label: "Right Field", type: "batter", x: 78, y: 33, matchers: ["OF"] },
  { id: "3B", label: "Third Base", type: "batter", x: 30, y: 60, matchers: ["3B"] },
  { id: "SS", label: "Shortstop", type: "batter", x: 41, y: 49, matchers: ["SS"] },
  { id: "2B", label: "Second Base", type: "batter", x: 59, y: 49, matchers: ["2B"] },
  { id: "1B", label: "First Base", type: "batter", x: 70, y: 60, matchers: ["1B"] },
  { id: "C", label: "Catcher", type: "batter", x: 50, y: 70, matchers: ["C"] },
  { id: "UTIL", label: "Utility", type: "batter", x: 20, y: 89, matchers: ["C", "1B", "2B", "3B", "SS", "OF", "DH"] },
  { id: "SP1", label: "Starter 1", type: "starter", x: 30, y: 89, matchers: ["SP", "P"] },
  { id: "SP2", label: "Starter 2", type: "starter", x: 40, y: 89, matchers: ["SP", "P"] },
  { id: "SP3", label: "Starter 3", type: "starter", x: 60, y: 89, matchers: ["SP", "P"] },
  { id: "SP4", label: "Starter 4", type: "starter", x: 70, y: 89, matchers: ["SP", "P"] },
  { id: "RP", label: "Reliever", type: "starter", x: 80, y: 89, matchers: ["RP", "P"] }
];

const BUDGET_MAX = 200;
const DEFAULT_SORT = "pts_desc";

let players = [];
let activeSlot = null;

const roster = Object.fromEntries(ROSTER_SLOTS.map((slot) => [slot.id, null]));

const state = {
  search: "",
  sort: DEFAULT_SORT,
  posFilter: ""
};

// =============================
// DOM references
// =============================
const dom = {
  diamond: document.getElementById("diamond"),
  playerRows: document.getElementById("playerRows"),
  rosterList: document.getElementById("rosterList"),
  panelSubtitle: document.getElementById("panelSubtitle"),
  budgetUsed: document.getElementById("budgetUsed"),
  budgetLeft: document.getElementById("budgetLeft"),
  spotsFilled: document.getElementById("spotsFilled"),
  rosterStatus: document.getElementById("rosterStatus"),
  searchInput: document.getElementById("searchInput"),
  completionText: document.getElementById("completionText"),
  summaryByType: document.getElementById("summaryByType"),
  resetRoster: document.getElementById("resetRoster"),
  themeToggle: document.querySelector("[data-theme-toggle]"),
  sortableHeaders: document.querySelectorAll("th[data-sort]")
};

// =============================
// Data parsing helpers
// =============================
function csvToObjects(text) {
  const rows = [];
  let currentCell = [];
  let currentRow = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell.push('"');
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.join(""));
      currentCell = [];
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }

      currentRow.push(currentCell.join(""));
      currentCell = [];

      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell.push(char);
  }

  if (currentCell.length || currentRow.length) {
    currentRow.push(currentCell.join(""));
    rows.push(currentRow);
  }

  const header = rows.shift().map((value) => value.trim());

  return rows.map((row) =>
    Object.fromEntries(header.map((key, index) => [key, (row[index] ?? "").trim()]))
  );
}

function parseNum(value) {
  const parsed = parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePos(raw) {
  return String(raw || "").match(/SP|RP|P|C|1B|2B|3B|SS|OF|DH/g) || [];
}

function mapPlayer(row, index) {
  const name = row.Name || row.player || row.Player || `Player ${index + 1}`;
  const team = row.Team || row.team || "";
  const posRaw = row.POS || row.Pos || row.Position || "";
  const dollars = parseNum(row.Dollars ?? row.Auction ?? row.Value ?? row.Salary);
  const pts = parseNum(row.PTS ?? row.Points ?? row.Projection);
  const mlbam = row.MLBAMID || row.mlbamid || "";
  const playerId = row.PlayerId || row.playerid || `${name}-${index}`;

  return {
    id: playerId,
    mlbam,
    name,
    team,
    posRaw,
    positions: normalizePos(posRaw),
    dollars: dollars ?? 0,
    pts: pts ?? 0
  };
}

// =============================
// Roster and filtering logic
// =============================
function formatMoney(value) {
  return `$${(value || 0).toFixed(1)}`;
}

function totalSpent() {
  return Object.values(roster).reduce((sum, player) => sum + (player?.dollars || 0), 0);
}

function filledCount() {
  return Object.values(roster).filter(Boolean).length;
}

function playersUsedSet(excludeSlotId = null) {
  return new Set(
    Object.entries(roster)
      .filter(([slotId, player]) => player && slotId !== excludeSlotId)
      .map(([, player]) => player.id)
  );
}

function getHeadshot(player) {
  return player?.mlbam
    ? `${HEADSHOT_BASE}${player.mlbam}/headshot/67/current`
    : HEADSHOT_FALLBACK;
}

function slotCandidates(slot) {
  const usedPlayers = playersUsedSet(slot ? slot.id : null);
  const currentSpentExcludingSlot = slot
    ? totalSpent() - (roster[slot.id]?.dollars || 0)
    : 0;
  const query = state.search.trim().toLowerCase();
  const positionFilter = state.posFilter;
  const [sortKey, sortDir] = state.sort.split("_");

  let filtered = players.filter((player) => !usedPlayers.has(player.id));

  if (slot) {
    filtered = filtered.filter((player) =>
      player.positions.some((position) => slot.matchers.includes(position))
    );

    filtered = filtered.filter(
      (player) => player.dollars + currentSpentExcludingSlot <= BUDGET_MAX + 0.0001
    );
  }

  if (query) {
    filtered = filtered.filter((player) =>
      [player.name, player.team, player.posRaw].join(" ").toLowerCase().includes(query)
    );
  }

  if (positionFilter) {
    filtered = filtered.filter(
      (player) => player.positions.includes(positionFilter) || player.posRaw.includes(positionFilter)
    );
  }

  return filtered.sort((a, b) => {
    let aValue = a[sortKey];
    let bValue = b[sortKey];

    if (["name", "team", "posRaw"].includes(sortKey)) {
      aValue = String(aValue || "").toLowerCase();
      bValue = String(bValue || "").toLowerCase();
    } else {
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;
    }

    if (aValue < bValue) {
      return sortDir === "asc" ? -1 : 1;
    }

    if (aValue > bValue) {
      return sortDir === "asc" ? 1 : -1;
    }

    if (sortKey !== "name") {
      return String(a.name).localeCompare(String(b.name));
    }

    return 0;
  });
}

function setActiveSlot(slotId) {
  state.search = "";
  dom.searchInput.value = "";
  activeSlot = ROSTER_SLOTS.find((slot) => slot.id === slotId) || null;

  document.querySelectorAll(".position-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.slotId === slotId);
  });

  renderTable();
}

function assignPlayer(slotId, player) {
  roster[slotId] = player;
  renderAll();
}

function removePlayer(slotId) {
  roster[slotId] = null;
  renderAll();
  setActiveSlot(slotId);
}

function resetRoster() {
  Object.keys(roster).forEach((slotId) => {
    roster[slotId] = null;
  });

  setActiveSlot("C");
  renderAll();
}

// =============================
// Render helpers
// =============================
function createSlotButton(slot, selectedPlayer) {
  const button = document.createElement("button");
  button.className = "position-btn";
  button.dataset.slotId = slot.id;
  button.style.left = `${slot.x}%`;
  button.style.top = `${slot.y}%`;

  const imageMarkup = selectedPlayer
    ? `<img class="slot-avatar" src="${getHeadshot(selectedPlayer)}" alt="${selectedPlayer.name} headshot" onerror="this.onerror=null;this.src='${HEADSHOT_FALLBACK}'">`
    : `<img class="slot-avatar" src="${HEADSHOT_FALLBACK}" alt="Empty roster slot">`;

  button.innerHTML = `
    <div class="slot-tag">${slot.id}</div>
    <div class="slot-card">
      ${imageMarkup}
      <div class="slot-name">${selectedPlayer ? selectedPlayer.name : slot.label}</div>
      <div class="slot-meta">${selectedPlayer ? formatMoney(selectedPlayer.dollars) : "Pick player"}</div>
    </div>
  `;

  button.addEventListener("click", () => setActiveSlot(slot.id));
  return button;
}

function createPlayerRow(player) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><strong>${player.name}</strong></td>
    <td>${player.team || "—"}</td>
    <td><span class="badge pill-muted">${player.posRaw || "—"}</span></td>
    <td>${formatMoney(player.dollars)}</td>
    <td>${player.pts.toFixed(1)}</td>
  `;

  row.addEventListener("click", () => {
    if (activeSlot) {
      assignPlayer(activeSlot.id, player);
    }
  });

  return row;
}

function createRosterRow(slot, player) {
  const row = document.createElement("div");
  row.className = "roster-row";
  row.innerHTML = `
    <div><span class="badge">${slot.id}</span></div>
    <div>
      <div style="font-weight:700">${player ? player.name : slot.label}</div>
      <div class="status-line">
        ${player ? `${player.team || "—"} • ${player.posRaw || "—"} • ${formatMoney(player.dollars)} • ${player.pts.toFixed(1)} pts` : "Empty slot"}
      </div>
    </div>
    <div>${player ? '<button type="button">Remove</button>' : ""}</div>
  `;

  if (player) {
    row.querySelector("button").addEventListener("click", () => removePlayer(slot.id));
  }

  return row;
}

function renderField() {
  dom.diamond.querySelectorAll(".position-btn").forEach((node) => node.remove());

  ROSTER_SLOTS.forEach((slot) => {
    const selectedPlayer = roster[slot.id];
    dom.diamond.appendChild(createSlotButton(slot, selectedPlayer));
  });
}

function renderTable() {
  dom.playerRows.innerHTML = "";
  const candidates = slotCandidates(activeSlot);

  if (!activeSlot) {
    dom.panelSubtitle.textContent = `All players (${candidates.length} total, sorted by PTS)`;
  } else {
    dom.panelSubtitle.textContent = `${activeSlot.label}: ${candidates.length} eligible players under the remaining budget.`;
  }

  if (!candidates.length) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `
      <td colspan="5" class="empty-state">
        ${activeSlot
          ? "No eligible players fit this slot and budget. Remove another player or choose a cheaper option."
          : "No players loaded."}
      </td>
    `;
    dom.playerRows.appendChild(emptyRow);
    return;
  }

  candidates.slice(0, 50).forEach((player) => {
    dom.playerRows.appendChild(createPlayerRow(player));
  });
}

function renderRoster() {
  dom.rosterList.innerHTML = "";

  if (!Object.values(roster).some(Boolean)) {
    dom.rosterList.innerHTML = '<div class="empty-state">Your roster will appear here as you fill the field.</div>';
    return;
  }

  ROSTER_SLOTS.forEach((slot) => {
    dom.rosterList.appendChild(createRosterRow(slot, roster[slot.id]));
  });
}

function renderSummary() {
  const spent = totalSpent();
  const remaining = BUDGET_MAX - spent;
  const filled = filledCount();
  const hitters = ROSTER_SLOTS.filter((slot) => slot.type === "batter" && roster[slot.id]).length;
  const pitchers = ROSTER_SLOTS.filter((slot) => slot.type === "starter" && roster[slot.id]).length;
  const totalPoints = Object.values(roster).reduce((sum, player) => sum + (player?.pts || 0), 0);
  const complete = filled === ROSTER_SLOTS.length && remaining >= 0;

  dom.budgetUsed.textContent = formatMoney(spent);
  dom.budgetLeft.textContent = formatMoney(remaining);
  dom.spotsFilled.textContent = `${filled} / ${ROSTER_SLOTS.length}`;
  dom.rosterStatus.textContent = complete ? "Complete" : remaining < 0 ? "Over budget" : "Building";
  dom.rosterStatus.className = `stat-value ${complete ? "success" : remaining < 0 ? "warning" : ""}`.trim();
  dom.completionText.textContent = complete
    ? "Roster is complete and under budget."
    : `${ROSTER_SLOTS.length - filled} spots left • ${hitters}/9 batters • ${pitchers}/5 pitchers`;

  dom.summaryByType.innerHTML = `
    <div class="mini-card">
      <h3>Batters</h3>
      <p>${hitters} of 9 selected</p>
    </div>
    <div class="mini-card">
      <h3>Pitchers</h3>
      <p>${pitchers} of 5 selected</p>
    </div>
    <div class="mini-card">
      <h3>Projected points</h3>
      <p>${totalPoints.toFixed(1)} total</p>
    </div>
    <div class="mini-card">
      <h3>Budget rule</h3>
      <p>Stay at or below ${formatMoney(BUDGET_MAX)}</p>
    </div>
  `;
}

function renderAll() {
  renderField();
  renderTable();
  renderRoster();
  renderSummary();
}

// =============================
// Event handlers
// =============================
function bindEvents() {
  dom.resetRoster.addEventListener("click", resetRoster);

  dom.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTable();
  });

  dom.themeToggle.addEventListener("click", () => {
    document.documentElement.dataset.theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  });

  dom.sortableHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const key = header.dataset.sort;
      const [currentKey, currentDirection] = state.sort.split("_");
      const nextDirection = currentKey === key && currentDirection === "asc" ? "desc" : "asc";

      state.sort = `${key}_${nextDirection}`;

      dom.sortableHeaders.forEach((cell) => {
        cell.classList.remove("sort-asc", "sort-desc");
      });

      header.classList.add(nextDirection === "asc" ? "sort-asc" : "sort-desc");
      renderTable();
    });
  });

  dom.diamond.addEventListener("click", (event) => {
    if (event.target === dom.diamond || event.target.parentElement === dom.diamond) {
      state.search = "";
      state.posFilter = "";
      dom.searchInput.value = "";
      activeSlot = null;

      document.querySelectorAll(".position-btn").forEach((button) => {
        button.classList.remove("active");
      });

      renderTable();
    }
  });
}

// =============================
// Initialization
// =============================
async function loadPlayers() {
  const season = 2026;
  const teamsUrl = `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`;

  try {
    const teamsResponse = await fetch(teamsUrl);
    if (!teamsResponse.ok) {
      throw new Error(`Failed to load teams: ${teamsResponse.status}`);
    }

    const teamsData = await teamsResponse.json();
    const teams = teamsData.teams || [];

    const rosterRequests = teams.map(async (team) => {
      const rosterUrl = `https://statsapi.mlb.com/api/v1/teams/${team.id}/roster?season=${season}`;

      try {
        const rosterResponse = await fetch(rosterUrl);
        if (!rosterResponse.ok) return [];

        const rosterData = await rosterResponse.json();
        const roster = rosterData.roster || [];

        return roster.map((entry) => {
          const pos = entry.position?.abbreviation || "";
          const person = entry.person || {};

          return {
            id: String(person.id),
            mlbam: String(person.id),
            name: person.fullName || "Unknown Player",
            team: team.abbreviation || team.teamName || "",
            posRaw: pos,
            positions: normalizePos(pos),
            dollars: estimateSalary(pos),
            pts: estimatePoints(pos)
          };
        });
      } catch {
        return [];
      }
    });

    const rosterResults = await Promise.all(rosterRequests);

    players = rosterResults
      .flat()
      .filter((player) => player.name && player.positions.length)
      .filter(
        (player, index, arr) =>
          arr.findIndex((p) => p.id === player.id) === index
      );

    state.search = "";
    state.sort = DEFAULT_SORT;
    state.posFilter = "";
    activeSlot = null;
    dom.searchInput.value = "";
    dom.panelSubtitle.textContent =
      "All players available. Click a field position to filter.";

    renderAll();
  } catch (error) {
    console.error(error);
    dom.playerRows.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          Could not load MLB API data.
        </td>
      </tr>
    `;
  }
}

function estimateSalary(pos) {
  if (["SP", "RP", "P"].includes(pos)) return 12;
  if (["C"].includes(pos)) return 8;
  if (["1B", "2B", "3B", "SS", "OF", "DH"].includes(pos)) return 10;
  return 6;
}

function estimatePoints(pos) {
  if (["SP"].includes(pos)) return 15;
  if (["RP", "P"].includes(pos)) return 10;
  if (["C"].includes(pos)) return 7;
  if (["1B", "2B", "3B", "SS", "OF", "DH"].includes(pos)) return 9;
  return 5;
}

/*
Old Fetch function from csv
function loadPlayers() {
  return fetch("./fangraphs-auction-calculator.csv")
    .then((response) => response.text())
    .then((text) => {
      players = csvToObjects(text)
        .map(mapPlayer)
        .filter((player) => player.name && player.positions.length && Number.isFinite(player.dollars));

      state.search = "";
      state.sort = DEFAULT_SORT;
      state.posFilter = "";
      activeSlot = null;
      dom.searchInput.value = "";
      dom.panelSubtitle.textContent = "All players available. Click a field position to filter.";

      renderAll();
    })
    .catch(() => {
      dom.playerRows.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">
            Could not load the CSV. Keep the HTML file next to the CSV file.
          </td>
        </tr>
      `;
    });
}
*/

function init() {
  bindEvents();
  loadPlayers();
}

init();
