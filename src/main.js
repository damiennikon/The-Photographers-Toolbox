import { route, notFound, navigate, startRouter } from "./router.js";
import { renderHome } from "./views/home.js";
import { renderToolView } from "./views/toolView.js";
import { renderAstroPlanner } from "./views/astroPlanner.js";
import { mountNavDrawer } from "./components/navDrawer.js";
import { getTool } from "./tools.config.js";

const app = document.getElementById("app");

mountNavDrawer(document.body);

// "internal" tools render via their own first-party view module instead of
// the generic iframe wrapper. Astro Planner is the only one so far.
route(/^\/tool\/(?<id>[\w-]+)$/, ({ id }) => {
  const tool = getTool(id);
  if (tool?.type === "internal" && tool.id === "astro-planner") {
    renderAstroPlanner(app);
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
