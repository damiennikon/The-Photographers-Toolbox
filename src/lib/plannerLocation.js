import { getCurrentPlannerLocation } from "./geocode.js";
import { getPin } from "./pinStore.js";
import { locationFromPin } from "./shootPlan.js";
import { getTimeZone } from "./timezone.js";

export const DEFAULT_LOCATION = {
  name: "Loganholme, QLD",
  lat: -27.6954,
  lon: 153.1185,
  timeZone: getTimeZone(-27.6954, 153.1185),
  countryCode: "au",
  countryName: "Australia",
};

export function plannerFallbackLocation(pinId) {
  const reason = pinId ? "saved location unavailable" : "default — location unavailable";
  return { ...DEFAULT_LOCATION, name: `${DEFAULT_LOCATION.name} (${reason})` };
}

export async function getPlannerStartLocation(pinId) {
  if (!pinId) return getCurrentPlannerLocation();
  const pin = await getPin(pinId);
  if (!pin) throw new Error("Saved location not found");
  return locationFromPin(pin);
}
