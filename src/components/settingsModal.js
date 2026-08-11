import { icon } from "../icons.js";

let root = null;

function render() {
  return `
    <div class="pt-modal-backdrop" data-settings-backdrop style="display:none">
      <div class="pt-modal" role="dialog" aria-modal="true">
        <div class="pt-modal-icon">${icon("settings")}</div>
        <h2 class="pt-modal-title">Settings</h2>
        <p class="pt-modal-body">Settings coming soon.</p>
        <button class="pt-modal-close" data-settings-close>Close</button>
      </div>
    </div>`;
}

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.innerHTML = render();
  document.body.appendChild(root);

  root.querySelector("[data-settings-backdrop]").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });
  root.querySelector("[data-settings-close]").addEventListener("click", closeSettings);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
}

export function openSettings() {
  ensureMounted();
  root.querySelector("[data-settings-backdrop]").style.display = "flex";
}

export function closeSettings() {
  if (!root) return;
  root.querySelector("[data-settings-backdrop]").style.display = "none";
}
