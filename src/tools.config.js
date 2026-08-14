// Single source of truth for tool tiles. Update URLs here only — layout
// code never hardcodes a tool's name, icon, or destination.
//
// type: "iframe"       -> renders full-screen at #/tool/:id via <iframe src=url>
// type: "internal"     -> renders full-screen at #/tool/:id via a first-party view module (see main.js)
// type: "placeholder"  -> tapping the tile opens a "Coming soon" modal instead of navigating
//
// backgroundImage: path relative to the app's base (resolved against
// import.meta.env.BASE_URL at render time) -> public/assets/tiles/*.webp.
// bg: fallback CSS gradient class suffix, used if backgroundImage is
// missing or fails to load (see .pt-tile-bg--<bg> in components.css).
export const TOOLS = [
  {
    id: "spotters-log",
    name: "SPOTTERS LOG",
    description: "Live flight tracking, arrivals, departures and more.",
    icon: "plane",
    bg: "aviation",
    backgroundImage: "assets/tiles/spotters-log.webp",
    type: "iframe",
    // NOTE: will change when Spotters Log moves to damienleydenphotography.au — update here only
    url: "https://airscapephotos.com/photo-log/index-layout-test.html",
  },
  {
    id: "astro-weather",
    name: "ASTROWEATHER",
    description: "Real-time astro weather conditions at your location.",
    icon: "cloudMoon",
    bg: "astro",
    backgroundImage: "assets/tiles/astro-weather.webp",
    type: "iframe",
    url: "https://damiennikon.github.io/astro-weather/",
  },
  {
    id: "dso-search",
    name: "DSO SEARCH",
    description: "Search and explore deep sky objects in the night sky.",
    icon: "telescope",
    bg: "dso",
    backgroundImage: "assets/tiles/dso-search.webp",
    type: "iframe",
    url: "https://damiennikon.github.io/DSO-Search/",
  },
  {
    id: "astro-planner",
    name: "ASTRO PLANNER",
    description: "Plan the perfect night with detailed astro insights.",
    icon: "calendarStar",
    bg: "planner",
    backgroundImage: "assets/tiles/astro-planner.webp",
    type: "internal",
  },
];

export function getTool(id) {
  return TOOLS.find((t) => t.id === id);
}
