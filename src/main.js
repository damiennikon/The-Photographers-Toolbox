import { route, notFound, navigate, startRouter } from "./router.js";
import { renderHome } from "./views/home.js";
import { renderToolView } from "./views/toolView.js";
import { renderAstroPlanner } from "./views/astroPlanner.js";
import { renderMapLocations } from "./views/mapLocations.js";
import { renderSunPlanner } from "./views/sunPlanner.js";
import { renderMyShoots } from "./views/myShoots.js";
import { renderNdTimer } from "./views/ndTimer.js";
import { mountNavDrawer } from "./components/navDrawer.js";
import { getTool } from "./tools.config.js";

const app = document.getElementById("app");
let disposeCurrentView = null;

function renderView(renderer, ...args) {
  disposeCurrentView?.();
  disposeCurrentView = renderer(...args) || null;
}

mountNavDrawer(document.body);

// "internal" tools render via their own first-party view module instead of
// the generic iframe wrapper. Keyed by tool id so a new internal tool only
// needs an entry here, not another branch.
const INTERNAL_VIEWS = {
  "astro-planner": renderAstroPlanner,
  "map-locations": renderMapLocations,
  "sun-planner": renderSunPlanner,
  "my-shoots": renderMyShoots,
  "nd-timer": renderNdTimer,
};

route(/^\/tool\/(?<id>[\w-]+)(?:\?(?<query>[^#]*))?$/, ({ id, query }) => {
  const tool = getTool(id);
  const renderInternal = tool?.type === "internal" ? INTERNAL_VIEWS[tool.id] : null;
  if (renderInternal) {
    renderView(renderInternal, app, new URLSearchParams(query));
  } else {
    renderView(renderToolView, app, id);
  }
});
route(/^\/$/, () => renderView(renderHome, app));
notFound(() => navigate("/"));

startRouter();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // non-fatal: app still works without offline support
    });
  });
}
