import { icon } from "../icons.js";
import { getAllPins } from "../lib/pinStore.js";
import { getPreferences, savePreferences } from "../lib/preferences.js";

export function openSettings() {
  const { plannerPinId, timeFormat } = getPreferences();
  const dialog = document.createElement("dialog");
  dialog.className = "pt-modal pt-app-dialog";
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.innerHTML = `
    <div class="pt-modal-icon" aria-hidden="true">${icon("settings")}</div>
    <h2 class="pt-modal-title" id="settings-title">Settings</h2>
    <form>
      <div class="pt-field pt-field-stack pt-app-dialog-content">
        <label>
          Planner start location
          <select name="plannerPinId" aria-describedby="planner-location-hint" disabled>
            <option value="">Use my current location</option>
          </select>
        </label>
        <p class="pt-field-eyebrow" id="planner-location-hint" role="status">Loading saved locations…</p>
        <label>
          Time format
          <select name="timeFormat">
            <option value="24">24-hour (18:42)</option>
            <option value="12">12-hour (6:42 pm)</option>
          </select>
        </label>
        <p class="pt-field-eyebrow">These preferences are saved on this device.</p>
        <p data-save-status role="status"></p>
      </div>
      <div class="pt-app-dialog-actions">
        <button class="pt-modal-close" type="button" data-cancel>Cancel</button>
        <button class="pt-modal-close pt-app-dialog-save" type="submit">Save settings</button>
      </div>
    </form>`;

  const form = dialog.querySelector("form");
  const locationSelect = form.elements.plannerPinId;
  const hint = dialog.querySelector("#planner-location-hint");
  form.elements.timeFormat.value = timeFormat;
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      savePreferences({
        plannerPinId: locationSelect.disabled ? plannerPinId : locationSelect.value,
        timeFormat: form.elements.timeFormat.value,
      });
      dialog.close();
    } catch {
      dialog.querySelector("[data-save-status]").textContent = "Couldn’t save your settings on this device.";
    }
  });

  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();

  getAllPins().then((pins) => {
    if (!dialog.open) return;
    const options = pins.map((pin) => new Option(pin.name || "Saved location", pin.id));
    options.sort((a, b) => a.text.localeCompare(b.text));
    locationSelect.append(...options);
    if (plannerPinId && !pins.some((pin) => pin.id === plannerPinId)) {
      locationSelect.add(new Option("Previously saved location (unavailable)", plannerPinId));
    }
    locationSelect.value = plannerPinId;
    locationSelect.disabled = false;
    hint.textContent = pins.length
      ? "Used when opening Sun Planner or Astro Planner."
      : "Save a spot in Map Locations to use it in both planners.";
  }).catch(() => {
    if (!dialog.open) return;
    hint.textContent = "Couldn’t load saved locations. Reopen Settings to try again.";
  });
}
