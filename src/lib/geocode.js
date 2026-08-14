// Nominatim geocoding — reuses LensLink's location-handling pattern (browser
// geolocation + reverse geocode, manual forward-geocode search), with the
// Firebase-dependent parts dropped since Astro Planner has no backend.
// Nominatim usage policy: max ~1 request/sec, no bulk/concurrent requests.
// https://operations.osmfoundation.org/policies/nominatim/

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const MIN_REQUEST_GAP_MS = 1000;

let lastRequestAt = 0;

async function rateLimitedFetch(url) {
  const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim request failed: ${res.status}`);
  return res.json();
}

function shortName(display) {
  // Nominatim's display_name is a long comma-separated address; keep it
  // short (locality + state/country) rather than the full string.
  const parts = display.split(",").map((p) => p.trim());
  return parts.slice(0, 2).join(", ");
}

export async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
  const data = await rateLimitedFetch(url);
  if (!data || !data.display_name) throw new Error("No reverse geocode result");
  return {
    name: shortName(data.display_name),
    lat: Number(data.lat),
    lon: Number(data.lon),
    countryCode: data.address?.country_code ?? null,
    countryName: data.address?.country ?? null,
  };
}

// `countryCode` (ISO 3166-1 alpha-2, e.g. "au") scopes results to that
// country via Nominatim's countrycodes param — omit/null for worldwide.
export async function searchLocations(query, countryCode) {
  if (!query || query.trim().length < 3) return [];
  const params = new URLSearchParams({ format: "jsonv2", q: query, limit: "5", addressdetails: "1" });
  if (countryCode) params.set("countrycodes", countryCode);
  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
  const data = await rateLimitedFetch(url);
  return (Array.isArray(data) ? data : []).map((r) => ({
    name: shortName(r.display_name),
    lat: Number(r.lat),
    lon: Number(r.lon),
    countryCode: r.address?.country_code ?? null,
    countryName: r.address?.country ?? null,
  }));
}

// Debounced typeahead wrapper: `onResults(results)` fires after the pause,
// with in-flight results from a stale query ignored. `countryCode` is read
// fresh on each call (not captured at creation) so a region change or the
// worldwide toggle takes effect on the very next keystroke.
export function createLocationSearch(onResults, delayMs = 700) {
  let timer = null;
  let requestId = 0;

  return function search(query, countryCode) {
    clearTimeout(timer);
    if (!query || query.trim().length < 3) {
      onResults([]);
      return;
    }
    const id = ++requestId;
    timer = setTimeout(async () => {
      try {
        const results = await searchLocations(query, countryCode);
        if (id === requestId) onResults(results);
      } catch {
        if (id === requestId) onResults([]);
      }
    }, delayMs);
  };
}

export function getCurrentPosition(options = { timeout: 8000 }) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      options
    );
  });
}
