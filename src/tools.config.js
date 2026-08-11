// Single source of truth for tool tiles. Update URLs here only — layout
// code never hardcodes a tool's name, icon, or destination.
//
// type: "iframe"      -> renders full-screen at #/tool/:id via <iframe src=url>
// type: "placeholder" -> tapping the tile opens a "Coming soon" modal instead of navigating
export const TOOLS = [
  {
    id: "spotters-log",
    name: "SPOTTERS LOG",
    description: "Live flight tracking, arrivals, departures and more.",
    icon: "plane",
    bg: "aviation",
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
    type: "iframe",
    url: "https://damiennikon.github.io/astro-weather/",
  },
  {
    id: "dso-search",
    name: "DSO SEARCH",
    description: "Search and explore deep sky objects in the night sky.",
    icon: "telescope",
    bg: "dso",
    type: "iframe",
    url: "https://damiennikon.github.io/DSO-Search/",
  },
  {
    id: "astro-planner",
    name: "ASTRO PLANNER",
    description: "Plan the perfect night with detailed astro insights.",
    icon: "calendarStar",
    bg: "planner",
    type: "placeholder",
  },
];

export function getTool(id) {
  return TOOLS.find((t) => t.id === id);
}
