import { escapeHtml } from "./fieldTools.js";
import { saveShoot } from "../lib/pinStore.js";
import { dateInZone, formatTimeInZone } from "../lib/timezone.js";

export function windowTime(window, zone) {
  const start = new Date(window.start);
  const first = `${dateInZone(start, zone)} · ${formatTimeInZone(start, zone)}`;
  if (!window.end) return first;
  const end = new Date(window.end);
  const endDay = dateInZone(end, zone);
  const dayLabel = endDay === dateInZone(start, zone) ? "" : `${endDay} · `;
  return `${first}–${dayLabel}${formatTimeInZone(end, zone)}`;
}

export function openSaveShoot(trigger, location, planner, windows) {
  const choices = windows.filter(Boolean);
  if (!choices.length) return;
  const dialog = document.createElement("dialog");
  dialog.className = "pt-field-dialog pt-field";
  dialog.setAttribute("aria-label", "Save a shoot");
  dialog.innerHTML = `
    <form class="pt-field-stack">
      <h3>Save a shoot</h3>
      <p>${escapeHtml(location.name)} · ${escapeHtml(location.timeZone)}</p>
      <label>Shoot name<input name="title" required maxlength="100" value="${escapeHtml(location.name.slice(0, 100))}"></label>
      <label>Shooting window<select name="window">${choices.map((choice, i) =>
        `<option value="${i}">${escapeHtml(choice.label)} · ${escapeHtml(windowTime(choice, location.timeZone))}</option>`
      ).join("")}</select></label>
      <label>Composition notes<textarea name="notes" rows="4" maxlength="4000" placeholder="Where to stand, lens, access notes…">${escapeHtml((location.notes || "").slice(0, 4000))}</textarea></label>
      <p data-save-status role="status" hidden></p>
      <div class="pt-field-actions">
        <button class="pt-field-btn pt-field-primary" type="submit">Save shoot</button>
        <button class="pt-field-btn" type="button" data-cancel>Cancel</button>
      </div>
    </form>`;
  // The dialog belongs to the active tool. A route change removes it with that tool.
  trigger.closest(".pt-tool-view").append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.elements.title.value.trim();
    const status = dialog.querySelector("[data-save-status]");
    if (!title) {
      status.hidden = false;
      status.textContent = "Enter a name for this shoot.";
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const { name, lat, lon, timeZone } = location;
      await saveShoot({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        title,
        planner,
        location: { name, lat, lon, timeZone },
        window: choices[Number(form.elements.window.value)],
        notes: form.elements.notes.value.trim(),
      });
      if (!dialog.isConnected) return;
      status.hidden = false;
      status.innerHTML = 'Shoot saved on this device. <a href="#/tool/my-shoots">Open My Shoots</a>';
      submit.hidden = true;
      dialog.querySelector("[data-cancel]").textContent = "Done";
    } catch {
      status.hidden = false;
      status.textContent = "Couldn’t save this shoot. Please try again.";
      submit.disabled = false;
    }
  });
  dialog.showModal();
}
