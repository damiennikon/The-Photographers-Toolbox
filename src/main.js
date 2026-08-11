import { route, notFound, navigate, startRouter } from "./router.js";
import { renderHome } from "./views/home.js";
import { renderToolView } from "./views/toolView.js";
import { mountNavDrawer } from "./components/navDrawer.js";

const app = document.getElementById("app");

mountNavDrawer(document.body);

route(/^\/tool\/(?<id>[\w-]+)$/, ({ id }) => renderToolView(app, id));
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
