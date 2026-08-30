import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";
import { navigate } from "../router.js";
import { getSunPosition, getSunTimes } from "../lib/astroCalc.js";
import { reverseGeocode, createLocationSearch, getCurrentPosition } from "../lib/geocode.js";
import { getAllPins } from "../lib/pinStore.js";
import { categoryById } from "../lib/pinCategories.js";

// Matches the default location used by the toolbox's other tools.
const DEFAULT_LOCATION = { name: "Loganholme, QLD", lat: -27.6954, lon: 153.1185, countryCode: "au", countryName: "Australia" };

const MAP_INIT_ZOOM = 11;
const MAP_FOCUS_ZOOM = 13;

// Length of the drawn sun-direction line, in km — purely visual (the map
// isn't scaled to real sun distance), kept as one named constant so it's
// easy to tune against how it looks at typical zoom levels.
const SUN_LINE_DISTANCE_KM = 3;
const EARTH_RADIUS_KM = 6371;

const COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function compassDirection(azimuthDeg) {
  return COMPASS_POINTS[Math.round(azimuthDeg / 22.5) % 16];
}

// Standard great-circle destination point (Vincenty's formula for a sphere):
// given an origin, a bearing (compass degrees, 0 = N clockwise) and a
// distance, returns the point that bearing/distance away. Used to turn the
// sun's azimuth into a second lat/lon for the polyline endpoint.
function destinationPoint(lat, lon, bearingDeg, distanceKm) {
  const dR = distanceKm / EARTH_RADIUS_KM;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(dR) * Math.cos(lat1), Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2));

  return { lat: (lat2 * 180) / Math.PI, lon: (((((lon2 * 180) / Math.PI) + 540) % 360) - 180) };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowInputValue() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Same local Y/M/D construction Astro Planner uses (rather than
// `new Date(isoString)`) so the selected calendar date can't shift a day
// when the browser is west of UTC — extended here to also fold in the H/M
// from the time input so a selected time can't shift across midnight the
// same way. Like the rest of the app, this builds a plain local-system-time
// Date; there's no location-timezone lookup dependency here, so a selected
// time is interpreted in the browser's own timezone, not the target
// location's — the same limitation Astro Planner's "night of" date already has.
function parseDateTimeInput(dateValue, timeValue) {
  const [y, m, d] = dateValue.split("-").map(Number);
  const [h, min] = (timeValue || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

function formatTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function computeDashboard(state) {
  const date = parseDateTimeInput(state.dateValue, state.timeValue);
  const { lat, lon } = state.location;
  const sun = getSunPosition(date, lat, lon);
  const times = getSunTimes(date, lat, lon);
  return { sun, times };
}

function sunPositionCardMarkup(sun) {
  const belowHorizon = sun.altitudeDeg < 0;
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("compass", "pt-card-icon")}<h3>Sun Position</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Azimuth</span>
          <span class="pt-planner-stat-value">${Math.round(sun.azimuthDeg)}° ${compassDirection(sun.azimuthDeg)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Altitude</span>
          <span class="pt-planner-stat-value">${sun.altitudeDeg >= 0 ? "" : "−"}${Math.abs(Math.round(sun.altitudeDeg))}°</span>
        </div>
      </div>
      ${belowHorizon ? `<p class="pt-planner-note">Sun is below the horizon at this date/time.</p>` : ""}
    </section>`;
}

function sunTimesCardMarkup(times) {
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("sunrise", "pt-card-icon")}<h3>Sunrise &amp; Sunset</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Sunrise</span>
          <span class="pt-planner-stat-value">${formatTime(times.sunrise)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Solar Noon</span>
          <span class="pt-planner-stat-value">${formatTime(times.solarNoon)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Sunset</span>
          <span class="pt-planner-stat-value">${formatTime(times.sunset)}</span>
        </div>
      </div>
    </section>`;
}

function goldenHourCardMarkup(times) {
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("sunset", "pt-card-icon")}<h3>Golden Hour</h3></div>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Morning ends</span>
          <span class="pt-planner-stat-value">${formatTime(times.goldenHourEnd)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Evening starts</span>
          <span class="pt-planner-stat-value">${formatTime(times.goldenHour)}</span>
        </div>
      </div>
    </section>`;
}

function blueHourCardMarkup(times) {
  return `
    <section class="pt-card">
      <div class="pt-card-head">${icon("moon", "pt-card-icon")}<h3>Blue Hour</h3></div>
      <p class="pt-planner-note">Civil twilight's end to nautical twilight's end, each side of the day.</p>
      <div class="pt-planner-stat-row">
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Morning</span>
          <span class="pt-planner-stat-value pt-planner-stat-value--sm">${formatTime(times.blueHourMorningStart)} – ${formatTime(times.blueHourMorningEnd)}</span>
        </div>
        <div class="pt-planner-stat">
          <span class="pt-planner-stat-label">Evening</span>
          <span class="pt-planner-stat-value pt-planner-stat-value--sm">${formatTime(times.blueHourEveningStart)} – ${formatTime(times.blueHourEveningEnd)}</span>
        </div>
      </div>
    </section>`;
}

function infoCardsMarkup(state) {
  const { sun, times } = computeDashboard(state);
  return [sunPositionCardMarkup(sun), sunTimesCardMarkup(times), goldenHourCardMarkup(times), blueHourCardMarkup(times)].join("");
}

function searchResultsMarkup(state) {
  if (state.searchLoading) return `<li class="pt-planner-search-status">Searching…</li>`;
  if (state.searchError) return `<li class="pt-planner-search-status">Search failed — try again.</li>`;
  if (!state.searchResults.length) return "";
  return state.searchResults
    .map((r, i) => `<li class="pt-planner-search-result" data-result-index="${i}">${icon("mapPin")}<span>${escapeHtml(r.name)}</span></li>`)
    .join("");
}

function pinListMarkup(pins) {
  if (!pins.length) return "";
  return `
    <div class="pt-planner-pin-list-wrap">
      <span class="pt-planner-search-status">Saved locations</span>
      <ul class="pt-planner-search-results" data-pin-results>
        ${pins
          .map((p, i) => {
            const cat = categoryById(p.category);
            return `
              <li class="pt-planner-search-result" data-pin-index="${i}">
                ${icon(cat.icon)}<span>${escapeHtml(p.name)}</span>
              </li>`;
          })
          .join("")}
      </ul>
    </div>`;
}

function effectiveCountryCode(state) {
  return state.searchWorldwide ? null : state.location.countryCode || null;
}

function locationPanelMarkup(state) {
  const scopeLabel =
    !state.searchWorldwide && state.location.countryName ? `Results scoped to ${state.location.countryName}` : "Searching worldwide";
  return `
    <div class="pt-planner-search">
      <button class="pt-planner-current-location-btn" data-use-current-location type="button">
        ${icon("mapPin")}<span>Use current location</span>
      </button>
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
      ${pinListMarkup(state.pins)}
    </div>`;
}

function controlsMarkup(state) {
  const locationLabel = state.locationStatus === "locating" ? "Locating…" : state.location.name;
  return `
    <section class="pt-planner-controls">
      <div class="pt-planner-location">
        ${icon("mapPin", "pt-planner-location-icon")}
        <span class="pt-planner-location-name" data-location-name>${escapeHtml(locationLabel)}</span>
        <button class="pt-planner-location-change" data-toggle-search type="button">${state.searchOpen ? "Cancel" : "Change"}</button>
      </div>
      <div data-location-panel ${state.searchOpen ? "" : "hidden"}></div>
      <div class="pt-planner-datetime">
        <label class="pt-planner-date">
          <span class="pt-planner-date-label">${icon("calendar", "pt-planner-date-icon")}Date</span>
          <input type="date" class="pt-planner-date-input" data-date-input value="${state.dateValue}" />
        </label>
        <label class="pt-planner-date">
          <span class="pt-planner-date-label">${icon("clock", "pt-planner-date-icon")}Time</span>
          <input type="time" class="pt-planner-date-input" data-time-input value="${state.timeValue}" />
        </label>
      </div>
    </section>`;
}

function shellMarkup(tool) {
  return `
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
          <div data-controls></div>
          <section class="pt-card pt-planner-map-card">
            <div class="pt-planner-map-canvas" data-map-canvas></div>
          </section>
          <div data-info-cards></div>
        </div>
      </div>
    </div>`;
}

export function renderSunPlanner(container) {
  const tool = getTool("sun-planner");
  if (!tool) {
    navigate("/");
    return;
  }

  const state = {
    dateValue: todayInputValue(),
    timeValue: nowInputValue(),
    location: { ...DEFAULT_LOCATION },
    locationStatus: "locating",
    searchOpen: false,
    searchQuery: "",
    searchWorldwide: false,
    searchResults: [],
    searchLoading: false,
    searchError: false,
    pins: [],
  };

  container.innerHTML = shellMarkup(tool);

  const controlsEl = container.querySelector("[data-controls]");
  const infoCardsEl = container.querySelector("[data-info-cards]");
  const mapCanvasEl = container.querySelector("[data-map-canvas]");

  // Map lives outside the imperatively-updated controls/info-cards markup so
  // re-rendering either of those (on every date/time/location change) never
  // touches — and so never destroys — the live Leaflet instance, following
  // Map Locations' render-shell-once-then-patch pattern rather than Astro
  // Planner's full re-render-per-change one.
  const map = L.map(mapCanvasEl, { zoomControl: true }).setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], MAP_INIT_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const marker = L.marker([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], { icon: markerIcon() }).addTo(map);
  let sunLine = null;

  function markerIcon() {
    return L.divIcon({
      className: "pt-map-marker",
      html: `<span class="pt-map-marker-badge">${icon("mapPin")}</span>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  function updateMap(focus) {
    const { lat, lon } = state.location;
    marker.setLatLng([lat, lon]);
    if (focus) map.setView([lat, lon], MAP_FOCUS_ZOOM);

    const { sun } = computeDashboard(state);
    const belowHorizon = sun.altitudeDeg < 0;
    const dest = destinationPoint(lat, lon, sun.azimuthDeg, SUN_LINE_DISTANCE_KM);

    if (sunLine) map.removeLayer(sunLine);
    sunLine = L.polyline(
      [
        [lat, lon],
        [dest.lat, dest.lon],
      ],
      {
        color: belowHorizon ? "#8a9ab0" : "#e0a83f",
        weight: 3,
        dashArray: belowHorizon ? "6 6" : null,
      }
    ).addTo(map);
  }

  function renderInfoCards() {
    infoCardsEl.innerHTML = infoCardsMarkup(state);
  }

  function renderLocationPanel() {
    const panel = controlsEl.querySelector("[data-location-panel]");
    if (!panel) return;
    panel.hidden = !state.searchOpen;
    if (!state.searchOpen) {
      panel.innerHTML = "";
    } else {
      panel.innerHTML = locationPanelMarkup(state);
      bindLocationPanelEvents();
    }
    // Unlike Map Locations (whose search UI is an absolutely-positioned
    // overlay), this panel sits in normal document flow above the map card —
    // showing/hiding it shifts the map's on-page position without Leaflet
    // knowing, which leaves its tile grid stale (blank/misaligned tiles)
    // until told to recheck its container size.
    requestAnimationFrame(() => map.invalidateSize());
  }

  function renderControls() {
    controlsEl.innerHTML = controlsMarkup(state);
    bindControlsEvents();
    renderLocationPanel();
  }

  function updateResultsList() {
    const list = controlsEl.querySelector("[data-location-results]");
    if (!list) return;
    list.innerHTML = searchResultsMarkup(state);
    bindResultClicks();
  }

  function selectLocation(location) {
    state.location = location;
    state.locationStatus = "resolved";
    state.searchOpen = false;
    state.searchWorldwide = false;
    state.searchResults = [];
    state.searchQuery = "";
    renderControls();
    updateMap(true);
    renderInfoCards();
  }

  function bindResultClicks() {
    controlsEl.querySelectorAll("[data-result-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const result = state.searchResults[Number(el.dataset.resultIndex)];
        if (!result) return;
        selectLocation(result);
      });
    });
  }

  function bindPinClicks() {
    controlsEl.querySelectorAll("[data-pin-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const pin = state.pins[Number(el.dataset.pinIndex)];
        if (!pin) return;
        selectLocation({ lat: pin.lat, lon: pin.lng, name: pin.name, countryCode: null, countryName: null });
      });
    });
  }

  const searchDebounced = createLocationSearch((results) => {
    state.searchLoading = false;
    state.searchError = false;
    state.searchResults = results;
    updateResultsList();
  });

  function bindLocationPanelEvents() {
    const searchInput = controlsEl.querySelector("[data-location-input]");
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

    const worldwideToggle = controlsEl.querySelector("[data-search-worldwide]");
    if (worldwideToggle) {
      worldwideToggle.addEventListener("change", (e) => {
        state.searchWorldwide = e.target.checked;
        state.searchLoading = state.searchQuery.trim().length >= 3;
        renderLocationPanel();
        searchDebounced(state.searchQuery, effectiveCountryCode(state));
      });
    }

    const currentLocationBtn = controlsEl.querySelector("[data-use-current-location]");
    if (currentLocationBtn) {
      currentLocationBtn.addEventListener("click", () => {
        currentLocationBtn.disabled = true;
        getCurrentPosition()
          .then(({ lat, lon }) =>
            reverseGeocode(lat, lon)
              .then((r) => ({ lat, lon, name: r.name, countryCode: r.countryCode, countryName: r.countryName }))
              .catch(() => ({ lat, lon, name: `${lat.toFixed(3)}, ${lon.toFixed(3)}`, countryCode: null, countryName: null }))
          )
          .then(selectLocation)
          .catch(() => {
            currentLocationBtn.disabled = false;
          });
      });
    }

    bindResultClicks();
    bindPinClicks();
  }

  function bindControlsEvents() {
    controlsEl.querySelector("[data-toggle-search]").addEventListener("click", () => {
      state.searchOpen = !state.searchOpen;
      state.searchQuery = "";
      state.searchWorldwide = false;
      state.searchResults = [];
      state.searchError = false;
      renderLocationPanel();
      controlsEl.querySelector("[data-toggle-search]").textContent = state.searchOpen ? "Cancel" : "Change";
    });

    controlsEl.querySelector("[data-date-input]").addEventListener("change", (e) => {
      state.dateValue = e.target.value || todayInputValue();
      updateMap(false);
      renderInfoCards();
    });

    controlsEl.querySelector("[data-time-input]").addEventListener("change", (e) => {
      state.timeValue = e.target.value || nowInputValue();
      updateMap(false);
      renderInfoCards();
    });
  }

  renderControls();
  renderInfoCards();
  updateMap(false);

  getAllPins()
    .then((pins) => {
      state.pins = pins;
      if (state.searchOpen) renderLocationPanel();
    })
    .catch((err) => console.error("Failed to load saved pins", err));

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
      const nameEl = controlsEl.querySelector("[data-location-name]");
      if (nameEl) nameEl.textContent = location.name;
      updateMap(true);
      renderInfoCards();
    });

  container.querySelector("[data-back]").addEventListener("click", () => {
    map.remove();
    navigate("/");
  });
}
