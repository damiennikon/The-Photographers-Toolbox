import { icon } from "../icons.js";

let root = null;

function render() {
  return `
    <div class="pt-modal-backdrop" data-placeholder-backdrop style="display:none">
      <div class="pt-modal" role="dialog" aria-modal="true">
        <div class="pt-modal-icon">${icon("clock")}</div>
        <h2 class="pt-modal-title" data-placeholder-title>Coming Soon</h2>
        <p class="pt-modal-body" data-placeholder-body>This tool isn't built yet — check back soon.</p>
        <button class="pt-modal-close" data-placeholder-close>Close</button>
      </div>
    </div>`;
}

function ensureMounted() {
  if (root) return;
  root = document.createElement("div");
  root.innerHTML = render();
  document.body.appendChild(root);

  root.querySelector("[data-placeholder-backdrop]").addEventListener("click", (e) => {
    if (e.target.dataset.placeholderBackdrop !== undefined && e.target === e.currentTarget) closePlaceholder();
  });
  root.querySelector("[data-placeholder-close]").addEventListener("click", closePlaceholder);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePlaceholder();
  });
}

export function openPlaceholder(title = "Coming Soon", body = "This tool isn't built yet — check back soon.") {
  ensureMounted();
  root.querySelector("[data-placeholder-title]").textContent = title;
  root.querySelector("[data-placeholder-body]").textContent = body;
  root.querySelector("[data-placeholder-backdrop]").style.display = "flex";
}

export function closePlaceholder() {
  if (!root) return;
  root.querySelector("[data-placeholder-backdrop]").style.display = "none";
}
