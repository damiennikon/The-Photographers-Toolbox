import { icon } from "../icons.js";
import { TOOLS } from "../tools.config.js";
import { navigate } from "../router.js";
import { openPlaceholder } from "./placeholderModal.js";

let root = null;

function render() {
  const links = TOOLS.map(
    (tool) => `
      <a href="#" class="pt-drawer-link" data-tool-id="${tool.id}" data-tool-type="${tool.type}">
        ${icon(tool.icon)}
        <span>${tool.name}</span>
      </a>`
  ).join("");

  return `
    <div class="pt-overlay" data-nav-overlay></div>
    <nav class="pt-drawer" data-nav-drawer>
      <div class="pt-drawer-header">
        <span class="pt-drawer-title">Menu</span>
        <button class="pt-icon-btn" data-nav-close aria-label="Close menu">${icon("close")}</button>
      </div>
      <div class="pt-drawer-nav">
        ${links}
        <div class="pt-drawer-divider"></div>
        <a href="#" class="pt-drawer-link" data-nav-about>
          ${icon("info")}
          <span>About</span>
        </a>
      </div>
    </nav>`;
}

export function mountNavDrawer(container) {
  const host = document.createElement("div");
  host.innerHTML = render();
  container.appendChild(host);
  root = host;

  const overlay = host.querySelector("[data-nav-overlay]");
  const drawer = host.querySelector("[data-nav-drawer]");

  host.querySelector("[data-nav-close]").addEventListener("click", closeNavDrawer);
  overlay.addEventListener("click", closeNavDrawer);

  host.querySelectorAll("[data-tool-id]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const { toolId, toolType } = link.dataset;
      closeNavDrawer();
      if (toolType === "placeholder") {
        openPlaceholder();
      } else {
        navigate(`/tool/${toolId}`);
      }
    });
  });

  host.querySelector("[data-nav-about]").addEventListener("click", (e) => {
    e.preventDefault();
    closeNavDrawer();
    openPlaceholder("About", "About info is coming soon.");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNavDrawer();
  });
}

export function openNavDrawer() {
  if (!root) return;
  root.querySelector("[data-nav-overlay]").dataset.open = "true";
  root.querySelector("[data-nav-drawer]").dataset.open = "true";
}

export function closeNavDrawer() {
  if (!root) return;
  root.querySelector("[data-nav-overlay]").dataset.open = "false";
  root.querySelector("[data-nav-drawer]").dataset.open = "false";
}
