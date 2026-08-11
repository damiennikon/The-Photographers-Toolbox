// Minimal hash router. No server-side rewrites needed for GitHub Pages.
// Routes are registered as { pattern: RegExp, handler: (params) => void }.

const routes = [];
let notFoundHandler = () => {};

export function route(pattern, handler) {
  routes.push({ pattern, handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

function currentPath() {
  const hash = window.location.hash || "#/";
  return hash.slice(1) || "/";
}

function resolve() {
  const path = currentPath();
  for (const { pattern, handler } of routes) {
    const match = path.match(pattern);
    if (match) {
      handler(match.groups || {});
      return;
    }
  }
  notFoundHandler();
}

export function navigate(path) {
  window.location.hash = path;
}

export function startRouter() {
  window.addEventListener("hashchange", resolve);
  resolve();
}
