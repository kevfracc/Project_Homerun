const HEADSHOT_BASE = "https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/";
const HEADSHOT_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#e7edf2"/><stop offset="1" stop-color="#ccd5dc"/></linearGradient></defs><rect width="120" height="120" rx="60" fill="url(#g)"/><circle cx="60" cy="46" r="24" fill="#aab8c3"/><path d="M24 104c8-18 25-28 36-28s28 10 36 28" fill="#aab8c3"/></svg>`
  );

const ROSTER_SLOTS = [
  { id: "C", label: "Catcher", type: "batter", matchers: ["C"] },
  { id: "1B", label: "First Base", type: "batter", matchers: ["1B"] },
  { id: "2B", label: "Second Base", type: "batter", matchers: ["2B"] },
  { id: "3B", label: "Third Base", type: "batter", matchers: ["3B"] },
  { id: "SS", label: "Shortstop", type: "batter", matchers: ["SS"] },
  // Generic outfield slots
  { id: "OF1", label: "Outfield 1", type: "batter", matchers: ["OF"] },
  { id: "OF2", label: "Outfield 2", type: "batter", matchers: ["OF"] },
  { id: "OF3", label: "Outfield 3", type: "batter", matchers: ["OF"] },
  //{ id: "LF", label: "Left Field", type: "batter", matchers: ["OF"] },
  //{ id: "CF", label: "Center Field", type: "batter", matchers: ["OF"] },
  //{ id: "RF", label: "Right Field", type: "batter", matchers: ["OF"] },
  { id: "UTIL", label: "Utility", type: "batter", matchers: ["C", "1B", "2B", "3B", "SS", "OF", "DH"] },
  { id: "SP1", label: "Starter 1", type: "pitcher", matchers: ["SP", "P"] },
  { id: "SP2", label: "Starter 2", type: "pitcher", matchers: ["SP", "P"] },
  { id: "SP3", label: "Starter 3", type: "pitcher", matchers: ["SP", "P"] },
  { id: "SP4", label: "Starter 4", type: "pitcher", matchers: ["SP", "P"] },
  { id: "RP", label: "Reliever", type: "pitcher", matchers: ["RP", "P"] }
];

const BUDGET_MAX = 200;
const DEFAULT_VIEW = "roster";

let players = [];
let currentView = DEFAULT_VIEW;
let activeSlotId = "";

const roster = Object.fromEntries(ROSTER_SLOTS.map((slot) => [slot.id, null]));

const state = {
  search: ""
};

const dom = {
  budgetUsed: document.getElementById("budgetUsed"),
  budgetLeft: document.getElementById("budgetLeft"),
  spotsFilled: document.getElementById("spotsFilled"),
  completionText: document.getElementById("completionText"),
  panelSubtitle: document.getElementById("panelSubtitle"),
  rosterRows: document.getElementById("rosterRows"),
  playerRows: document.getElementById("playerRows"),
  tabRoster: document.getElementById("tabRoster"),
  tabPool: document.getElementById("tabPool"),
  panelRoster: document.getElementById("panelRoster"),
  panelPool: document.getElementById("panelPool"),
  resetRoster: document.getElementById("resetRoster"),
  searchInput: document.getElementById("searchInput"),
  slotSelector: document.getElementById("slotSelector")
};

function normalizePos(raw) {
  const code = String(raw || "").toUpperCase().trim();

  // Map all outfield positions to generic OF
  if (code === "LF" || code === "CF" || code === "RF") {
    return ["OF"];
  }

  if (["SP", "RP", "P", "C", "1B", "2B", "3B", "SS", "OF", "DH"].includes(code)) {
    return [code];
  }

  return [];
}
/*
function normalizePos(raw) {
  return String(raw || "").match(/SP|RP|P|C|1B|2B|3B|SS|OF|DH/g) || [];
}
*/

function estimateSalary(pos) {
  if (["SP", "RP", "P"].includes(pos)) return 12;
  if (pos === "C") return 8;
  if (["1B", "2B", "3B", "SS", "OF", "DH"].includes(pos)) return 10;
  return 6;
}

function getHeadshot(player) {
  return player?.mlbam
    ? `${HEADSHOT_BASE}${player.mlbam}/headshot/67/current`
    : HEADSHOT_FALLBACK;
}

function formatMoney(value) {
  return `$${(value || 0).toFixed(1)}`;
}

function totalSpent() {
  return Object.values(roster).reduce((sum, player) => sum + (player?.dollars || 0), 0);
}

function filledCount() {
  return Object.values(roster).filter(Boolean).length;
}

function selectedPlayerIds() {
  return new Set(Object.values(roster).filter(Boolean).map((player) => player.id));
}

function playersUsedSet(excludeSlotId = null) {
  return new Set(
    Object.entries(roster)
      .filter(([slotId, player]) => player && slotId !== excludeSlotId)
      .map(([, player]) => player.id)
  );
}

function getSlotById(slotId) {
  return ROSTER_SLOTS.find((slot) => slot.id === slotId) || null;
}

function eligiblePlayers() {
  const query = state.search.trim().toLowerCase();
  const slot = getSlotById(activeSlotId);
  const used = playersUsedSet(activeSlotId || null);
  const currentSpentExcludingSlot = slot
    ? totalSpent() - (roster[slot.id]?.dollars || 0)
    : totalSpent();

  let filtered = players.filter((player) => !used.has(player.id));

  if (slot) {
    filtered = filtered.filter((player) =>
      player.positions.some((pos) => slot.matchers.includes(pos))
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

  // Sort by price (dollars) descending, then name ascending
  return filtered.sort((a, b) => {
    const aPrice = Number(a.dollars) || 0;
    const bPrice = Number(b.dollars) || 0;

    if (aPrice !== bPrice) {
      return bPrice - aPrice; // highest price first
    }

    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
}
/*
function eligiblePlayers() {
  const query = state.search.trim().toLowerCase();
  const slot = getSlotById(activeSlotId);
  const used = playersUsedSet(activeSlotId || null);
  const currentSpentExcludingSlot = slot ? totalSpent() - (roster[slot.id]?.dollars || 0) : totalSpent();

  let filtered = players.filter((player) => !used.has(player.id));

  if (slot) {
    filtered = filtered.filter((player) => player.positions.some((pos) => slot.matchers.includes(pos)));
    filtered = filtered.filter((player) => player.dollars + currentSpentExcludingSlot <= BUDGET_MAX + 0.0001);
  }

  if (query) {
    filtered = filtered.filter((player) =>
      [player.name, player.team, player.posRaw].join(" ").toLowerCase().includes(query)
    );
  }

  return filtered.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
}
  */

function setView(viewName) {
  currentView = viewName;
  const rosterActive = viewName === "roster";

  dom.tabRoster.classList.toggle("is-active", rosterActive);
  dom.tabPool.classList.toggle("is-active", !rosterActive);
  dom.tabRoster.setAttribute("aria-selected", String(rosterActive));
  dom.tabPool.setAttribute("aria-selected", String(!rosterActive));
  dom.panelRoster.hidden = !rosterActive;
  dom.panelPool.hidden = rosterActive;
}

function renderSummary() {
  const spent = totalSpent();
  const remaining = BUDGET_MAX - spent;
  const filled = filledCount();

  dom.budgetUsed.textContent = formatMoney(spent);
  dom.budgetLeft.textContent = formatMoney(remaining);
  dom.spotsFilled.textContent = `${filled} / ${ROSTER_SLOTS.length}`;
  dom.completionText.textContent = activeSlotId
    ? `Filling ${activeSlotId}. Open Player Pool to assign or replace a player.`
    : "Select a row to assign or replace a player.";

  dom.panelSubtitle.textContent = activeSlotId
    ? `Showing eligible players for ${activeSlotId}.`
    : "All players loaded from the MLB API.";
}

function renderSlotSelector() {
  dom.slotSelector.innerHTML = '<option value="">Remaining Players</option>';

  ROSTER_SLOTS.forEach((slot) => {
    const option = document.createElement("option");
    option.value = slot.id;
    option.textContent = `${slot.id} — ${slot.label}`;
    option.selected = slot.id === activeSlotId;
    dom.slotSelector.appendChild(option);
  });
}

function renderRosterTable() {
  dom.rosterRows.innerHTML = "";

  ROSTER_SLOTS.forEach((slot) => {
    const player = roster[slot.id];
    const row = document.createElement("tr");
    row.className = "roster-row";
    row.innerHTML = `
      <th scope="row">${slot.id}</th>
      <td>${player ? formatMoney(player.dollars) : "$0.0"}</td>
      <td>
        <img class="avatar" src="${player ? getHeadshot(player) : HEADSHOT_FALLBACK}" alt="${player ? `${player.name} headshot` : `${slot.label} placeholder`}" />
      </td>
      <td>
        <div class="player-name">${player ? player.name : "Empty slot"}</div>
      </td>
      <td class="muted">${player ? player.team || "—" : "—"}</td>
    `;

    row.addEventListener("click", () => {
      activeSlotId = slot.id;
      renderAll();
      setView("pool");
    });

    dom.rosterRows.appendChild(row);
  });
}

function renderPlayerPoolTable() {
  dom.playerRows.innerHTML = "";
  const selectedIds = selectedPlayerIds();
  const filtered = eligiblePlayers();

  if (!filtered.length) {
    dom.playerRows.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">No players match the current search or slot filter.</td>
      </tr>
    `;
    return;
  }

  filtered.forEach((player) => {
    const isSelected = selectedIds.has(player.id);
    const row = document.createElement("tr");
    row.className = `player-row ${isSelected ? "is-selected" : ""} ${activeSlotId ? "is-fillable" : ""}`.trim();
    row.innerHTML = `
      <td>${player.posRaw || "—"}</td>
      <td>${formatMoney(player.dollars)}</td>
      <td><img class="avatar" src="${getHeadshot(player)}" alt="${player.name} headshot" /></td>
      <td><span class="player-name">${player.name}</span></td>
      <td>${player.team || "—"}</td>
      <td>${isSelected ? '<span class="selected-badge">Selected</span>' : '<span class="placeholder-text">Available</span>'}</td>
    `;

    row.addEventListener("click", () => {
      if (!activeSlotId) return;
      roster[activeSlotId] = player;
      renderAll();
      setView("roster");
    });

    dom.playerRows.appendChild(row);
  });
}

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
        return (rosterData.roster || []).map((entry) => {
          const pos = entry.position?.abbreviation || "";
          const person = entry.person || {};

          return {
            id: String(person.id),
            mlbam: String(person.id),
            name: person.fullName || "Unknown Player",
            team: team.abbreviation || team.teamName || "",
            posRaw: pos,
            positions: normalizePos(pos),
            dollars: estimateSalary(pos)
          };
        });
      } catch {
        return [];
      }
    });

    const results = await Promise.all(rosterRequests);

    players = results
      .flat()
      .filter((player) => player.name && player.positions.length)
      .filter((player, index, array) => array.findIndex((p) => p.id === player.id) === index);

    renderAll();
  } catch (error) {
    console.error(error);
    dom.playerRows.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">Could not load MLB API data.</td>
      </tr>
    `;
  }
}

function renderAll() {
  renderSummary();
  renderSlotSelector();
  renderRosterTable();
  renderPlayerPoolTable();
}

function bindEvents() {
  dom.tabRoster.addEventListener("click", () => setView("roster"));
  dom.tabPool.addEventListener("click", () => setView("pool"));

  dom.resetRoster.addEventListener("click", () => {
    Object.keys(roster).forEach((slotId) => {
      roster[slotId] = null;
    });
    activeSlotId = "";
    state.search = "";
    dom.searchInput.value = "";
    renderAll();
    setView("roster");
  });

  dom.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    renderPlayerPoolTable();
  });

  dom.slotSelector.addEventListener("change", (event) => {
    activeSlotId = event.target.value;
    renderAll();
  });

}

function init() {
  bindEvents();
  setView(DEFAULT_VIEW);
  renderAll();
  loadPlayers();
}

init();
