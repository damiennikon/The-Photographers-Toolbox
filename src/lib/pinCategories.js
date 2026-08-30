// Pin categories shared by Map Locations (choosing/rendering a pin) and Sun
// Planner (labeling a pin in its location picker) — extracted from
// mapLocations.js so a second tool doesn't need its own copy.
export const CATEGORIES = [
  { id: "astro", label: "Astro", icon: "telescope", color: "#7c9fe0" },
  { id: "aviation", label: "Aviation", icon: "plane", color: "#4fb8e0" },
  { id: "wildlife", label: "Wildlife", icon: "paw", color: "#6fbf73" },
  { id: "landscape", label: "Landscape", icon: "mountain", color: "#e0a83f" },
  { id: "other", label: "Other", icon: "mapPin", color: "#e0293a" },
];

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}
