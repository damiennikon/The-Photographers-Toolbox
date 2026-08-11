import { icon } from "../icons.js";
import { TOOLS } from "../tools.config.js";
import { navigate } from "../router.js";
import { openNavDrawer } from "../components/navDrawer.js";
import { openSettings } from "../components/settingsModal.js";
import { openPlaceholder } from "../components/placeholderModal.js";

function tileMarkup(tool) {
  return `
    <a href="#" class="pt-tile" data-tool-id="${tool.id}" data-tool-type="${tool.type}" data-disabled="${tool.type === "placeholder"}">
      <div class="pt-tile-bg pt-tile-bg--${tool.bg}"></div>
      <div class="pt-tile-badge">${icon(tool.icon)}</div>
      <h3 class="pt-tile-name">${tool.name}</h3>
      <div class="pt-tile-underline"></div>
      <p class="pt-tile-desc">${tool.description}</p>
      <div class="pt-tile-chevron">${icon("chevronRight")}</div>
    </a>`;
}

export function renderHome(container) {
  container.innerHTML = `
    <div class="pt-home">
      <header class="pt-topbar">
        <button class="pt-icon-btn" data-open-nav aria-label="Open menu">${icon("menu")}</button>
        <button class="pt-icon-btn" data-open-settings aria-label="Open settings">${icon("settings")}</button>
      </header>

      <section class="pt-hero">
        <div class="pt-hero-mark">${icon("aperture")}</div>
        <h1 class="pt-hero-title">PHOTOGRAPHER'S <span>TOOLBOX</span></h1>
        <p class="pt-hero-tagline">Everything you need. Right when you need it.</p>
        <div class="pt-hero-divider"></div>
      </section>

      <section class="pt-grid">
        ${TOOLS.map(tileMarkup).join("")}
      </section>

      <footer class="pt-pill">
        ${icon("aperture")}
        <span>PLAN &bull; CAPTURE &bull; CREATE</span>
        ${icon("mountain")}
      </footer>
    </div>`;

  container.querySelector("[data-open-nav]").addEventListener("click", openNavDrawer);
  container.querySelector("[data-open-settings]").addEventListener("click", openSettings);

  container.querySelectorAll("[data-tool-id]").forEach((tile) => {
    tile.addEventListener("click", (e) => {
      e.preventDefault();
      const { toolId, toolType } = tile.dataset;
      if (toolType === "placeholder") {
        openPlaceholder();
      } else {
        navigate(`/tool/${toolId}`);
      }
    });
  });
}
