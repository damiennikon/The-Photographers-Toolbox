const STORAGE_KEY = "pt-preferences";

export function getPreferences() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage may be unavailable or contain an invalid value.
  }
  return {
    plannerPinId: typeof saved?.plannerPinId === "string" ? saved.plannerPinId : "",
    timeFormat: saved?.timeFormat === "12" ? "12" : "24",
  };
}

export function savePreferences(preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
