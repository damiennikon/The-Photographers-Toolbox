import { route, notFound, navigate, startRouter } from "./router.js";
import { renderHome } from "./views/home.js";
import { renderToolView } from "./views/toolView.js";
import { renderAstroPlanner } from "./views/astroPlanner.js";
import { renderMapLocations } from "./views/mapLocations.js";
import { renderSunPlanner } from "./views/sunPlanner.js";
import { mountNavDrawer } from "./components/navDrawer.js";
import { getTool } from "./tools.config.js";

const app = document.getElementById("app");

mountNavDrawer(document.body);

// "internal" tools render via their own first-party view module instead of
// the generic iframe wrapper. Keyed by tool id so a new internal tool only
// needs an entry here, not another branch.
const INTERNAL_VIEWS = {
  "astro-planner": renderAstroPlanner,
  "map-locations": renderMapLocations,
  "sun-planner": renderSunPlanner,
};

route(/^\/tool\/(?<id>[\w-]+)$/, ({ id }) => {
  const tool = getTool(id);
  const renderInternal = tool?.type === "internal" ? INTERNAL_VIEWS[tool.id] : null;
  if (renderInternal) {
    renderInternal(app);
  } else {
    renderToolView(app, id);
  }
});
route(/^\/$/, () => renderHome(app));
notFound(() => navigate("/"));

startRouter();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // non-fatal: app still works without offline support
    });
  });
}
