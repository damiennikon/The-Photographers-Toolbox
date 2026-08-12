import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";
import { navigate } from "../router.js";

const LOAD_TIMEOUT_MS = 5000;

function fallbackMarkup(url) {
  return `
    <div class="pt-tool-fallback" data-fallback>
      <p>This tool can't be embedded here.</p>
      <a href="${url}" target="_blank" rel="noopener noreferrer">
        ${icon("externalLink")}
        <span>Open in new tab</span>
      </a>
    </div>`;
}

export function renderToolView(container, toolId) {
  const tool = getTool(toolId);

  if (!tool || tool.type !== "iframe") {
    navigate("/");
    return;
  }

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
      <div class="pt-tool-frame-wrap" data-frame-wrap>
        <div class="pt-tool-fallback" data-loading>
          <div class="pt-spinner"></div>
        </div>
      </div>
    </div>`;

  container.querySelector("[data-back]").addEventListener("click", () => navigate("/"));

  const frameWrap = container.querySelector("[data-frame-wrap]");
  const loadingEl = container.querySelector("[data-loading]");
  let settled = false;

  const showFallback = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    iframe.remove();
    frameWrap.innerHTML = fallbackMarkup(tool.url);
  };

  // Some embedded tools set X-Frame-Options / CSP frame-ancestors that block
  // embedding entirely — a blocked iframe never fires `load` or `error` in a
  // detectable way, so we race the load event against a timeout instead.
  // If this fires often for a given tool, fix the response headers on that
  // tool's own site rather than working around it here.
  const timer = setTimeout(showFallback, LOAD_TIMEOUT_MS);

  const iframe = document.createElement("iframe");
  iframe.src = tool.url;
  iframe.title = tool.name;
  iframe.allow = "geolocation; fullscreen";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.style.display = "none";

  iframe.addEventListener("load", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    loadingEl.remove();
    iframe.style.display = "block";
  });

  iframe.addEventListener("error", showFallback);

  frameWrap.appendChild(iframe);
}
