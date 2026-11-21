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

  // The outer document must not become a second scroll container around an
  // embedded app. Track Safari's visible viewport, including toolbar changes.
  const previousPosition = { x: window.scrollX, y: window.scrollY };
  document.documentElement.classList.add("pt-embedded-tool");

  container.innerHTML = `
    <div class="pt-tool-view pt-tool-view--embedded">
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

  const view = container.querySelector(".pt-tool-view");
  const viewport = window.visualViewport;
  const syncViewport = () => {
    // Leave pinch zoom to the browser; changing layout during zoom fights it.
    const useVisual = viewport && viewport.scale === 1;
    view.style.setProperty("--pt-viewport-height", `${useVisual ? viewport.height : window.innerHeight}px`);
    view.style.setProperty("--pt-viewport-top", `${useVisual ? viewport.offsetTop : 0}px`);
  };
  syncViewport();
  window.addEventListener("resize", syncViewport);
  viewport?.addEventListener("resize", syncViewport);
  viewport?.addEventListener("scroll", syncViewport);

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
  // Keep a real viewport while loading; display:none can initialise an iOS
  // frame at zero size before its popup reads innerHeight.
  iframe.style.visibility = "hidden";

  iframe.addEventListener("load", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    loadingEl.remove();
    iframe.style.visibility = "visible";
  });

  iframe.addEventListener("error", showFallback);

  frameWrap.appendChild(iframe);

  return () => {
    settled = true;
    clearTimeout(timer);
    iframe.remove();
    window.removeEventListener("resize", syncViewport);
    viewport?.removeEventListener("resize", syncViewport);
    viewport?.removeEventListener("scroll", syncViewport);
    document.documentElement.classList.remove("pt-embedded-tool");
    window.scrollTo({ left: previousPosition.x, top: previousPosition.y, behavior: "instant" });
  };
}

