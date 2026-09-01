import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";
import { navigate } from "../router.js";
import {
  getMilkyWayVisibility,
  milkyWayCompassDirection,
  MILKY_WAY_MIN_ALTITUDE,
  getMoonIllumination,
  getDarknessWindow,
  getMoonInfo,
  getTargetPeakAltitude,
  DSO_MIN_ALTITUDE,
  parseCalendarDate,
} from "../lib/astroCalc.js";
import { reverseGeocode, createLocationSearch, getCurrentPosition } from "../lib/geocode.js";
import { openNightAR, openPolarAlign } from "../components/nightAR.js";
import { DSO_DATABASE } from "../../database/database.js";

// Matches the default location used by the toolbox's other tools.
const DEFAULT_LOCATION = { name: "Loganholme, QLD", lat: -27.6954, lon: 153.1185, countryCode: "au", countryName: "Australia" };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Same escaping Sun Planner uses (sunPlanner.js:45) for the same job — this
// view was missing it entirely, which let unescaped geocoder-supplied
// strings (search results, the search query, location/country names) reach
// innerHTML verbatim.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function formatTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

// Many catalog entries (database/database.js) use their `name` field for a
// generic category description rather than a proper name — e.g. 26 separate
// Barnard dark nebulae are all literally named "Dark Nebula". Rendering
// `name` verbatim in that case makes distinct objects look like duplicates,
// so this table tracks which name values are shared so the label picker
// below can fall back to `id` (the catalog designation, always unique —
// e.g. "Barnard 92") for exactly those entries. Built once at module load
// since it depends only on the static catalog, not per-render state.
const DSO_NAME_OCCURRENCES = DSO_DATABASE.reduce((counts, entry) => {
  counts[entry.name] = (counts[entry.name] || 0) + 1;
  return counts;
}, {});

// Prefers the catalog's `name`, but falls back to `id` when name is missing
// or — as is common in this catalog — just a generic type description
// shared by multiple entries, so every rendered row gets a unique, specific
// label instead of e.g. three targets all reading "Dark Nebula".
function dsoTargetLabel(target) {
  const hasDistinctName = target.name && DSO_NAME_OCCURRENCES[target.name] === 1;
  return hasDistinctName ? target.name : target.id;
}

// "Alignment" catalog entries (NCP/SCP) are consumed by Polar Align, not
// this list — they're fixed reference points, not shoot targets.
//
// database/database.js stores every entry's RA in degrees (0-360), but
// getTargetPeakAltitude()/astronomy-engine's Horizon() take RA in sidereal
// hours (0-24) — the parameter is literally named raHours. Converting here,
// at this single call site, rather than rewriting all 198 catalog entries:
// this is the only place RA is read from the catalog for altitude/time math
// (the galactic core and celestial pole use their own hardcoded/irrelevant
// RA values, unaffected).
function getDsoTargets(darkness, lat, lon) {
  return DSO_DATABASE.filter((entry) => entry.type !== "Alignment")
    .map((entry) => ({ ...entry, ...getTargetPeakAltitude(darkness, lat, lon, entry.ra / 15, entry.dec) }))
    .filter((entry) => entry.peakAltitude !== null && entry.peakAltitude > DSO_MIN_ALTITUDE)
    .sort((a, b) => b.peakAltitude - a.peakAltitude);
}

function computeDashboard(state) {
  const date = parseCalendarDate(state.dateValue);
  const { lat, lon } = state.location;
  const darkness = getDarknessWindow(date, lat, lon);
  const moon = getMoonInfo(date, lat, lon, darkness.duskStart, darkness.dawnEnd);
  const illumination = getMoonIllumination(date);
  const milkyWay = getMilkyWayVisibility(darkness, lat, lon);
  const dsoTargets = getDsoTargets(darkness, lat, lon);
  return { darkness, moon, illumination, milkyWay, dsoTargets };
}

// Tier boundaries and severity wording mirror AstroWeather's own moon-impact
// scoring (src/scoring.js: moonScore bands at illumination <=10/25/50/80%,
// with a hard veto above 80%) so the two tools agree on what "bad" means.
function moonSeverityText(illumination) {
  if (illumination <= 10) return "negligible — minimal impact on deep sky";
  if (illumination <= 25) return "slight impact, faint targets still workable";
  if (illumination <= 50) return "some impact on fainter targets, brighter DSOs fine";
  if (illumination <= 80) return "will wash out fainter targets";
  return "severe washout — essentially unshootable for deep sky";
}

function moonSeverityTone(illumination) {
  if (illumination <= 25) return "good";
  if (illumination <= 50) return "neutral";
  return "warn";
}

// Plain-language description of when, within the dark window, the moon is
// up — a moon up for the final 20 minutes of a 10-hour window reads very
// differently to one up the entire night, even at identical illumination.
function moonOverlapClause(darkness, moon) {
  const atDusk = moon.overlapStart.getTime() <= darkness.duskStart.getTime() + 60000;
  const tillDawn = moon.overlapEnd.getTime() >= darkness.dawnEnd.getTime() - 60000;

  if (atDusk && tillDawn) return "up the entire night";
  if (atDusk) return `up for the first ${formatDuration(darkness.duskStart, moon.overlapEnd)} (until ${formatTime(moon.overlapEnd)})`;
  if (tillDawn) return `up for the final ${formatDuration(moon.overlapStart, darkness.dawnEnd)} (from ${formatTime(moon.overlapStart)})`;
  return `up for ${formatDuration(moon.overlapStart, moon.overlapEnd)} (${formatTime(moon.overlapStart)}–${formatTime(moon.overlapEnd)})`;
}

function moonFlag(darkness, moon, illumination) {
  if (!darkness.valid || moon.upDuringDark === null) {
    return { tone: "neutral", text: "Can't determine dark-hours moon presence — no true astronomical darkness window for this date/location." };
  }
  if (!moon.upDuringDark) {
    return { tone: "good", text: "Moon absent during dark hours — excellent for deep sky." };
  }
  return {
    tone: moonSeverityTone(illumination),
    text: `Moon ${moonOverlapClause(darkness, moon)} at ${illumination}% — ${moonSeverityText(illumination)}.`,
  };
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
  const flag = moonFlag(darkness, moon, illumination);
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

// Lives on every Milky Way Core card state (even "not visible tonight") since
// it reflects the live current position, not the selected planning date —
// worth pointing your phone at even if tonight's computed window says no.
function nightArButtonMarkup() {
  return `
    <button class="pt-planner-ar-btn" data-open-night-ar type="button">
      ${icon("camera")}
      <span>Night AR — where is the core right now?</span>
    </button>
    <p class="pt-planner-note">Points your camera toward the core's live position right now — independent of the date selected above.</p>`;
}

function milkyWayCardMarkup(milkyWay) {
  if (!milkyWay.visible) {
    return `
      <section class="pt-card">
        <div class="pt-card-head">${icon("telescope", "pt-card-icon")}<h3>Milky Way Core</h3></div>
        <p class="pt-planner-empty">Not visible tonight — the core stays below ${MILKY_WAY_MIN_ALTITUDE}° all night at this date/location.</p>
        ${nightArButtonMarkup()}
      </section>`;
  }

  const startDir = milkyWayCompassDirection(milkyWay.startAzimuth);
  const endDir = milkyWayCompassDirection(milkyWay.endAzimuth);
  const directionNote = startDir && endDir ? `<p class="pt-planner-note">${startDir} → ${endDir}</p>` : "";

  if (milkyWay.allNight) {
    return `
      <section class="pt-card">
        <div class="pt-card-head">${icon("telescope", "pt-card-icon")}<h3>Milky Way Core</h3></div>
        <div class="pt-planner-flag pt-planner-flag--good">Visible all night — above ${MILKY_WAY_MIN_ALTITUDE}° for the entire dark window.</div>
        ${directionNote}
        ${nightArButtonMarkup()}
      </section>`;
  }

  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("telescope", "pt-card-icon")}<h3>Milky Way Core</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Visible from</span>
          <span class="pt-planner-stat-value">${formatTime(milkyWay.start)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Visible until</span>
          <span class="pt-planner-stat-value">${formatTime(milkyWay.end)}</span>
        </div>
      </div>
      ${directionNote}
      ${nightArButtonMarkup()}
    </section>`;
}

// Like the Night AR button, this reflects the live current position rather
// than the selected planning date — the celestial pole doesn't rise or set,
// so unlike the Milky Way core there's no "visible tonight" window to gate
// this behind; it's just always there.
const DSO_TARGETS_COLLAPSED_COUNT = 8;

function dsoTargetRowMarkup(target) {
  return `
    <li class="pt-planner-dso-row">
      <div class="pt-planner-dso-row-main">
        <span class="pt-planner-dso-name">${dsoTargetLabel(target)}</span>
        <span class="pt-planner-dso-type">${target.type}</span>
      </div>
      <div class="pt-planner-dso-row-stats">
        <span class="pt-planner-dso-alt">${Math.round(target.peakAltitude)}°</span>
        <span class="pt-planner-dso-time">${formatTime(target.peakTime)}</span>
      </div>
    </li>`;
}

function dsoTargetsCardMarkup(dsoTargets, expanded) {
  if (!dsoTargets.length) {
    return `
      <section class="pt-card">
        <div class="pt-card-head">${icon("aperture", "pt-card-icon")}<h3>Tonight's Best DSO Targets</h3></div>
        <p class="pt-planner-empty">Nothing clears ${DSO_MIN_ALTITUDE}° during the dark window tonight — check a different date or location.</p>
      </section>`;
  }

  const visible = expanded ? dsoTargets : dsoTargets.slice(0, DSO_TARGETS_COLLAPSED_COUNT);
  const hasMore = dsoTargets.length > DSO_TARGETS_COLLAPSED_COUNT;
  const toggle = hasMore
    ? `<button class="pt-planner-dso-toggle" data-toggle-dso-expand type="button">${
        expanded ? "Show fewer" : `Show all ${dsoTargets.length} targets`
      }</button>`
    : "";

  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("aperture", "pt-card-icon")}<h3>Tonight's Best DSO Targets</h3></div>
      <p class="pt-planner-note">Above ${DSO_MIN_ALTITUDE}° at some point during the dark window, sorted by peak altitude.</p>
      <ul class="pt-planner-dso-list">${visible.map(dsoTargetRowMarkup).join("")}</ul>
      ${toggle}
    </section>`;
}

function polarAlignCardMarkup(state) {
  const hemisphere = state.location.lat >= 0 ? "N" : "S";
  const poleAbbr = hemisphere === "N" ? "NCP" : "SCP";
  const poleName = hemisphere === "N" ? "North Celestial Pole" : "South Celestial Pole";
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("compass", "pt-card-icon")}<h3>Polar Align</h3></div>
      <p class="pt-planner-note">Points your camera toward the ${poleName} for aligning an equatorial mount — its position in the sky is fixed, so this works any time, any night.</p>
      <button class="pt-planner-ar-btn" data-open-polar-align type="button">
        ${icon("compass")}
        <span>Polar Align — locate the ${poleAbbr}</span>
      </button>
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
          ${icon("mapPin")}<span>${escapeHtml(r.name)}</span>
        </li>`
    )
    .join("");
}

function effectiveCountryCode(state) {
  return state.searchWorldwide ? null : state.location.countryCode || null;
}

function searchMarkup(state) {
  const scopeLabel =
    !state.searchWorldwide && state.location.countryName
      ? `Results scoped to ${escapeHtml(state.location.countryName)}`
      : "Searching worldwide";
  return `
    <div class="pt-planner-search">
      <div class="pt-planner-search-input-wrap">
        ${icon("search", "pt-planner-search-icon")}
        <input type="text" class="pt-planner-search-input" data-location-input placeholder="Search for a place…" autocomplete="off" value="${escapeHtml(state.searchQuery)}" />
      </div>
      <div class="pt-planner-search-scope">
        <span>${scopeLabel}</span>
        <label class="pt-planner-search-worldwide">
          <input type="checkbox" data-search-worldwide ${state.searchWorldwide ? "checked" : ""} />
          <span>Search worldwide</span>
        </label>
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
        <span class="pt-planner-location-name">${escapeHtml(locationLabel)}</span>
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
    searchQuery: "",
    searchWorldwide: false,
    searchResults: [],
    searchLoading: false,
    searchError: false,
    dsoExpanded: false,
  };

  const searchDebounced = createLocationSearch((results) => {
    state.searchLoading = false;
    state.searchError = false;
    state.searchResults = results;
    updateResultsList();
  });

  function render() {
    const { darkness, moon, illumination, milkyWay, dsoTargets } = computeDashboard(state);

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
            ${dsoTargetsCardMarkup(dsoTargets, state.dsoExpanded)}
            ${polarAlignCardMarkup(state)}
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
        state.searchWorldwide = false;
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
      state.searchQuery = "";
      state.searchWorldwide = false;
      state.searchResults = [];
      state.searchError = false;
      render();
    });

    const searchInput = container.querySelector("[data-location-input]");
    if (searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      searchInput.addEventListener("input", (e) => {
        const q = e.target.value;
        state.searchQuery = q;
        state.searchLoading = q.trim().length >= 3;
        state.searchError = false;
        updateResultsList();
        searchDebounced(q, effectiveCountryCode(state));
      });
    }

    const worldwideToggle = container.querySelector("[data-search-worldwide]");
    if (worldwideToggle) {
      worldwideToggle.addEventListener("change", (e) => {
        state.searchWorldwide = e.target.checked;
        state.searchLoading = state.searchQuery.trim().length >= 3;
        render();
        searchDebounced(state.searchQuery, effectiveCountryCode(state));
      });
    }

    container.querySelector("[data-open-night-ar]").addEventListener("click", () => {
      openNightAR(state.location);
    });

    container.querySelector("[data-open-polar-align]").addEventListener("click", () => {
      openPolarAlign(state.location);
    });

    const dsoToggle = container.querySelector("[data-toggle-dso-expand]");
    if (dsoToggle) {
      dsoToggle.addEventListener("click", () => {
        state.dsoExpanded = !state.dsoExpanded;
        render();
      });
    }

    bindResultClicks();
  }

  render();

  getCurrentPosition()
    .then(({ lat, lon }) =>
      reverseGeocode(lat, lon)
        .then((r) => ({ lat, lon, name: r.name, countryCode: r.countryCode, countryName: r.countryName }))
        .catch(() => ({ lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, countryCode: null, countryName: null }))
    )
    .catch(() => ({ ...DEFAULT_LOCATION }))
    .then((location) => {
      state.location = location;
      state.locationStatus = "resolved";
      render();
    });
}
