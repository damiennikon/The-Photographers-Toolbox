import { downloadFile, escapeHtml, fieldToolPage } from "../components/fieldTools.js";
import { windowTime } from "../components/saveShoot.js";
import { deleteShoot, getShoots } from "../lib/pinStore.js";
import { shootCalendar } from "../lib/shootPlan.js";

function shootCard(shoot, index) {
  const { title, planner, window, location, notes } = shoot;
  return `
    <article class="pt-card pt-field-stack">
      <p class="pt-field-eyebrow">${planner === "sun" ? "Sun Planner" : "Astro Planner"}</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(location.name)} · ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}</p>
      <p><strong>${escapeHtml(window.label)}</strong> · ${escapeHtml(windowTime(window, location.timeZone))} (${escapeHtml(location.timeZone)})</p>
      ${window.bearing === null ? "" : `<p>Direction ${window.bearing}° true</p>`}
      ${notes ? `<p class="pt-field-notes">${escapeHtml(notes)}</p>` : ""}
      <div class="pt-field-actions">
        <button class="pt-field-btn" type="button" data-calendar="${index}">Download calendar event</button>
        <button class="pt-field-btn" type="button" data-remove="${index}">Delete shoot</button>
      </div>
    </article>`;
}

export function renderMyShoots(container) {
  container.innerHTML = fieldToolPage("my-shoots", `
    <section class="pt-card pt-field-stack">
      <h2>My Shoots</h2>
      <p>Plans saved on this device are available here in the field.</p>
      <a class="pt-field-btn" href="#/tool/map-locations">Open Map Locations</a>
    </section>
    <p data-shoot-status role="status">Loading shoots…</p>
    <div class="pt-field-stack" data-shoots></div>`);
  const status = container.querySelector("[data-shoot-status]");
  const list = container.querySelector("[data-shoots]");

  async function loadShoots() {
    try {
      const shoots = await getShoots();
      if (!list.isConnected) return;
      shoots.sort((a, b) => a.window.start.localeCompare(b.window.start));
      list.innerHTML = shoots.map(shootCard).join("");
      status.textContent = shoots.length ? "" : "No shoots yet. Open a saved location or a planner to create one.";
      list.querySelectorAll("[data-calendar]").forEach((button) => {
        button.addEventListener("click", () => {
          const shoot = shoots[Number(button.dataset.calendar)];
          downloadFile(shootCalendar(shoot), "toolbox-shoot.ics", "text/calendar;charset=utf-8");
        });
      });
      list.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", async () => {
          const shoot = shoots[Number(button.dataset.remove)];
          if (!confirm(`Delete “${shoot.title}” from this device?`)) return;
          button.disabled = true;
          try {
            await deleteShoot(shoot.id);
            await loadShoots();
          } catch {
            status.textContent = "Couldn’t delete this shoot. Please try again.";
            button.disabled = false;
          }
        });
      });
    } catch {
      status.textContent = "Couldn’t open your saved shoots. Try reopening My Shoots.";
    }
  }

  loadShoots();
}
