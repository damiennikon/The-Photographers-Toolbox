import L from "leaflet";
import { parseCalendarDate } from "../lib/astroCalc.js";
import { findAlignments, landmarkBearing, signedAngle } from "../lib/shotAlignment.js";
import { shootingWindow } from "../lib/shootPlan.js";
import { formatTimeInZone } from "../lib/timezone.js";
import { openSaveShoot } from "./saveShoot.js";

export function alignmentMarkup() {
  return `
    <section class="pt-card pt-field pt-field-stack">
      <h3>Line Up a Shot</h3>
      <p>Use the planner location as your camera position, or pick a new one. Choose a landmark to see when the Sun or Moon lines up with its bearing on the selected date.</p>
      <div class="pt-field-actions">
        <button class="pt-field-btn" type="button" data-pick-camera>Pick camera on map</button>
        <button class="pt-field-btn" type="button" data-pick-landmark>Pick landmark on map</button>
      </div>
      <form class="pt-field-stack" data-alignment-form>
        <div class="pt-field-columns">
          <label>Landmark latitude<input name="latitude" type="number" step="any" min="-90" max="90" required></label>
          <label>Landmark longitude<input name="longitude" type="number" step="any" min="-180" max="180" required></label>
        </div>
        <label>Subject<select name="body"><option value="sun">Sun</option><option value="moon">Moon</option></select></label>
        <button class="pt-field-btn pt-field-primary" type="submit">Find alignments</button>
      </form>
      <p data-alignment-status role="status"></p>
      <ul data-alignment-results class="pt-field-list"></ul>
      <p class="pt-field-eyebrow">Matches use true bearing and a clear horizon. Check the listed altitude against terrain and buildings.</p>
    </section>`;
}

export function mountAlignment(container, map, state, selectLocation) {
  const form = container.querySelector("[data-alignment-form]");
  const status = container.querySelector("[data-alignment-status]");
  const results = container.querySelector("[data-alignment-results]");
  const hint = container.querySelector("[data-alignment-hint]");
  const mapCanvas = map.getContainer();
  let targetMarker = null;
  let bearingLine = null;
  let picking = null;

  function stopPicking() {
    picking = null;
    hint.hidden = true;
    mapCanvas.classList.remove("pt-map-canvas--picking");
  }

  function startPicking(which) {
    picking = which;
    hint.hidden = false;
    hint.querySelector("span").textContent = which === "camera"
      ? "Tap the map where you’ll stand." : "Tap the landmark on the map.";
    mapCanvas.classList.add("pt-map-canvas--picking");
    mapCanvas.scrollIntoView({ block: "nearest" });
    hint.querySelector("button").focus({ preventScroll: true });
  }

  function clearResults() {
    results.replaceChildren();
    status.textContent = "";
  }

  function updateLine() {
    targetMarker?.remove();
    bearingLine?.remove();
    const lat = form.elements.latitude.valueAsNumber;
    const lon = form.elements.longitude.valueAsNumber;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !form.elements.latitude.validity.valid ||
        !form.elements.longitude.validity.valid) return;
    const { location } = state;
    const target = [lat, location.lon + signedAngle(lon - location.lon)];
    targetMarker = L.circleMarker(target, { radius: 7, color: "#77d2e8", interactive: false }).addTo(map);
    bearingLine = L.polyline([[location.lat, location.lon], target], {
      color: "#77d2e8", dashArray: "5 5", interactive: false,
    }).addTo(map);
  }

  container.querySelector("[data-pick-camera]").addEventListener("click", () => startPicking("camera"));
  container.querySelector("[data-pick-landmark]").addEventListener("click", () => startPicking("landmark"));
  hint.querySelector("button").addEventListener("click", stopPicking);
  map.on("click", ({ latlng }) => {
    if (!picking) return;
    const { lat, lng: lon } = latlng.wrap();
    if (picking === "camera") {
      selectLocation({ lat, lon, name: `Camera at ${lat.toFixed(4)}, ${lon.toFixed(4)}` });
    } else {
      form.elements.latitude.value = lat.toFixed(6);
      form.elements.longitude.value = lon.toFixed(6);
      clearResults();
      updateLine();
    }
    stopPicking();
    form.scrollIntoView({ block: "nearest" });
    form.elements.latitude.focus({ preventScroll: true });
  });

  form.addEventListener("input", () => {
    clearResults();
    updateLine();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearResults();
    const { location, dateValue } = state;
    if (state.locationStatus === "locating") {
      status.textContent = "Choose a camera location first.";
      return;
    }
    const bearing = landmarkBearing(location, {
      lat: form.elements.latitude.valueAsNumber,
      lon: form.elements.longitude.valueAsNumber,
    });
    if (bearing === null) {
      status.textContent = "Choose a distinct landmark with a defined bearing from the camera.";
      return;
    }
    const body = form.elements.body.value;
    const name = body === "moon" ? "Moon" : "Sun";
    const matches = findAlignments(parseCalendarDate(dateValue, location.timeZone), location, bearing, body);
    const direction = Math.round(bearing) % 360;
    status.textContent = matches.length
      ? `Landmark ${direction}° true. Times shown in ${location.timeZone}.`
      : `No above-horizon ${name} alignment at ${direction}° true on ${dateValue}.`;
    for (const { time, altitude } of matches) {
      const row = document.createElement("li");
      const detail = document.createElement("span");
      detail.textContent = `${formatTimeInZone(time, location.timeZone)} · ${name} altitude ${altitude.toFixed(1)}°`;
      const button = document.createElement("button");
      button.className = "pt-field-btn";
      button.type = "button";
      button.textContent = "Save alignment";
      button.addEventListener("click", () => {
        openSaveShoot(button, location, "sun", [
          shootingWindow(`${name} alignment · ${altitude.toFixed(1)}° above horizon`, time, null, bearing),
        ]);
      });
      row.append(detail, button);
      results.append(row);
    }
  });

  return () => {
    clearResults();
    updateLine();
  };
}
