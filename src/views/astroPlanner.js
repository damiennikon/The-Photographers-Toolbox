import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";
import { navigate } from "../router.js";
import { getMilkyWayIntel, getMoonIllumination, getDarknessWindow, getMoonInfo } from "../lib/astroCalc.js";
import { reverseGeocode, createLocationSearch, getCurrentPosition } from "../lib/geocode.js";

// Matches the default location used by the toolbox's other tools.
const DEFAULT_LOCATION = { name: "Loganholme, QLD", lat: -27.6954, lon: 153.1185 };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Built from local Y/M/D components rather than `new Date(isoString)` so the
// selected calendar date can't shift a day when the browser is west of UTC.
function parseDateInput(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const mins = Math.round((end - start) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function computeDashboard(state) {
  const date = parseDateInput(state.dateValue);
  const { lat, lon } = state.location;
  const darkness = getDarknessWindow(date, lat, lon);
  const moon = getMoonInfo(date, lat, lon, darkness.duskStart, darkness.dawnEnd);
  const illumination = getMoonIllumination(date);
  const milkyWay = getMilkyWayIntel(date);
  return { darkness, moon, illumination, milkyWay };
}

function moonFlag(darkness, moon) {
  if (!darkness.valid || moon.upDuringDark === null) {
    return { tone: "neutral", text: "Can't determine dark-hours moon presence — no true astronomical darkness window for this date/location." };
  }
  if (moon.upDuringDark) {
    return { tone: "warn", text: "Moon is up during dark hours — will wash out fainter targets." };
  }
  return { tone: "good", text: "Moon absent during dark hours — good for deep sky." };
}

function moonRiseSetText(moon) {
  if (moon.alwaysUp) return "Up all day (circumpolar)";
  if (moon.alwaysDown) return "Doesn't rise this day";
  return `Rise ${formatTime(moon.rise)} · Set ${formatTime(moon.set)}`;
}

function darknessCardMarkup(darkness) {
  const body = darkness.valid
    ? `
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Dark starts</span>
          <span class="pt-planner-stat-value">${formatTime(darkness.duskStart)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Dark ends</span>
          <span class="pt-planner-stat-value">${formatTime(darkness.dawnEnd)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Duration</span>
          <span class="pt-planner-stat-value">${formatDuration(darkness.duskStart, darkness.dawnEnd)}</span>
        </div>
      </div>`
    : `<p class="pt-planner-empty">No true astronomical darkness this night at this location — check back closer to a different season, or a lower-latitude location.</p>`;

  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("sunrise", "pt-card-icon")}<h3>Darkness Window</h3></div>
      ${body}
    </section>`;
}

function moonCardMarkup(darkness, moon, illumination) {
  const flag = moonFlag(darkness, moon);
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("moon", "pt-card-icon")}<h3>Moon</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Illumination</span>
          <span class="pt-planner-stat-value">${illumination}%</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Rise / Set</span>
          <span class="pt-planner-stat-value pt-planner-stat-value--sm">${moonRiseSetText(moon)}</span>
        </div>
      </div>
      <div class="pt-planner-flag pt-planner-flag--${flag.tone}">${flag.text}</div>
    </section>`;
}

function milkyWayCardMarkup(milkyWay) {
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("telescope", "pt-card-icon")}<h3>Milky Way Core</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Rises</span>
          <span class="pt-planner-stat-value">${milkyWay.riseTime}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Best window</span>
          <span class="pt-planner-stat-value pt-planner-stat-value--sm">${milkyWay.bestWindow}</span>
        </div>
      </div>
      <p class="pt-planner-note">Rough monthly estimate, not date-precise. Direction isn't shown — it moves through the night and needs a proper ephemeris calculation to state accurately, which is out of scope for this pass.</p>
    </section>`;
}

function astroWeatherCardMarkup() {
  return `
    <a href="#/tool/astro-weather" class="pt-card pt-card--link">
      <div class="pt-card-head">${icon("cloudMoon", "pt-card-icon")}<h3>Conditions</h3></div>
      <p class="pt-planner-note">Cloud, wind and lightning aren't re-scored here — AstroWeather already covers that.</p>
      <div class="pt-planner-link-cta">
        <span>Check tonight's conditions on AstroWeather</span>
        ${icon("chevronRight")}
      </div>
    </a>`;
}

function searchResultsMarkup(state) {
  if (state.searchLoading) return `<li class="pt-planner-search-status">Searching…</li>`;
  if (state.searchError) return `<li class="pt-planner-search-status">Search failed — try again.</li>`;
  if (!state.searchResults.length) return "";
  return state.searchResults
    .map(
      (r, i) => `
        <li class="pt-planner-search-result" data-result-index="${i}">
          ${icon("mapPin")}<span>${r.name}</span>
        </li>`
    )
    .join("");
}

function searchMarkup(state) {
  return `
    <div class="pt-planner-search">
      <div class="pt-planner-search-input-wrap">
        ${icon("search", "pt-planner-search-icon")}
        <input type="text" class="pt-planner-search-input" data-location-input placeholder="Search for a place…" autocomplete="off" />
      </div>
      <ul class="pt-planner-search-results" data-location-results>${searchResultsMarkup(state)}</ul>
    </div>`;
}

function controlsMarkup(state) {
  const locationLabel = state.locationStatus === "locating" ? "Locating…" : state.location.name;
  return `
    <section class="pt-planner-controls">
      <div class="pt-planner-location">
        ${icon("mapPin", "pt-planner-location-icon")}
        <span class="pt-planner-location-name">${locationLabel}</span>
        <button class="pt-planner-location-change" data-toggle-search type="button">${state.searchOpen ? "Cancel" : "Change"}</button>
      </div>
      ${state.searchOpen ? searchMarkup(state) : ""}
      <label class="pt-planner-date">
        <span class="pt-planner-date-label">${icon("calendar", "pt-planner-date-icon")}Night of</span>
        <input type="date" class="pt-planner-date-input" data-date-input value="${state.dateValue}" />
      </label>
    </section>`;
}

export function renderAstroPlanner(container) {
  const tool = getTool("astro-planner");
  if (!tool) {
    navigate("/");
    return;
  }

  const state = {
    dateValue: todayInputValue(),
    location: { ...DEFAULT_LOCATION },
    locationStatus: "locating",
    searchOpen: false,
    searchResults: [],
    searchLoading: false,
    searchError: false,
  };

  const searchDebounced = createLocationSearch((results) => {
    state.searchLoading = false;
    state.searchError = false;
    state.searchResults = results;
    updateResultsList();
  });

  function render() {
    const { darkness, moon, illumination, milkyWay } = computeDashboard(state);

    container.innerHTML = `
      <div class="pt-tool-view">
        <header class="pt-tool-topbar">
          <button class="pt-tool-back" data-back aria-label="Back to toolbox">
            ${icon("arrowLeft")}
            <span class="pt-tool-back-label pt-tool-back-label--full">Back to Toolbox</span>
            <span class="pt-tool-back-label pt-tool-back-label--short">Toolbox</span>
          </button>
          <div class="pt-tool-current">
            ${icon(tool.icon, "pt-tool-current-icon")}
            <span class="pt-tool-title">${tool.name}</span>
          </div>
        </header>
        <div class="pt-planner-scroll">
          <div class="pt-planner">
            ${controlsMarkup(state)}
            ${darknessCardMarkup(darkness)}
            ${moonCardMarkup(darkness, moon, illumination)}
            ${milkyWayCardMarkup(milkyWay)}
            ${astroWeatherCardMarkup()}
          </div>
        </div>
      </div>`;

    bindEvents();
  }

  function updateResultsList() {
    const list = container.querySelector("[data-location-results]");
    if (!list) return;
    list.innerHTML = searchResultsMarkup(state);
    bindResultClicks();
  }

  function bindResultClicks() {
    container.querySelectorAll("[data-result-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const result = state.searchResults[Number(el.dataset.resultIndex)];
        if (!result) return;
        state.location = result;
        state.locationStatus = "resolved";
        state.searchOpen = false;
        state.searchResults = [];
        render();
      });
    });
  }

  function bindEvents() {
    container.querySelector("[data-back]").addEventListener("click", () => navigate("/"));

    container.querySelector("[data-date-input]").addEventListener("change", (e) => {
      state.dateValue = e.target.value || todayInputValue();
      render();
    });

    container.querySelector("[data-toggle-search]").addEventListener("click", () => {
      state.searchOpen = !state.searchOpen;
      state.searchResults = [];
      state.searchError = false;
      render();
    });

    const searchInput = container.querySelector("[data-location-input]");
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener("input", (e) => {
        const q = e.target.value;
        state.searchLoading = q.trim().length >= 3;
        state.searchError = false;
        updateResultsList();
        searchDebounced(q);
      });
    }

    bindResultClicks();
  }

  render();

  getCurrentPosition()
    .then(({ lat, lon }) =>
      reverseGeocode(lat, lon)
        .then((r) => ({ lat, lon, name: r.name }))
        .catch(() => ({ lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}` }))
    )
    .catch(() => ({ ...DEFAULT_LOCATION }))
    .then((location) => {
      state.location = location;
      state.locationStatus = "resolved";
      render();
    });
}
