import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { icon } from "../icons.js";
import { getTool } from "../tools.config.js";
import { navigate } from "../router.js";
import { getCurrentPosition, createLocationSearch, reverseGeocode } from "../lib/geocode.js";
import { getAllPins, savePin, updatePinPosition, updatePinAddress, deletePin, createPinId, restorePins } from "../lib/pinStore.js";
import { compressImage } from "../lib/imageCompress.js";
import { CATEGORIES, categoryById } from "../lib/pinCategories.js";
import { decodeLocationBackup, encodeLocationBackup, MAX_BACKUP_BYTES } from "../lib/locationBackup.js";
import { downloadFile, escapeHtml } from "../components/fieldTools.js";

// Matches the default location used by the toolbox's other tools.
const DEFAULT_LOCATION = { lat: -27.6954, lon: 153.1185 };

function markerIcon(categoryId, draft = false) {
  const cat = categoryById(categoryId);
  return L.divIcon({
    className: draft ? "pt-map-marker pt-map-marker--draft" : "pt-map-marker",
    html: `<span class="pt-map-marker-badge" style="--marker-color:${cat.color}">${icon(cat.icon)}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function shellMarkup(tool) {
  return `
    <div class="pt-tool-view">
      <header class="pt-tool-topbar">
        <button class="pt-tool-back" data-back aria-label="Back to toolbox">
          ${icon("arrowLeft")}
          <span class="pt-tool-back-label pt-tool-back-label--full">Back to Toolbox</span>
          <span class="pt-tool-back-label pt-tool-back-label--short">Toolbox</span>
        </button>
        <div class="pt-tool-current">
          ${icon(tool.icon, "pt-tool-current-icon")}
          <span class="pt-tool-title">${tool.name}</span>
        </div>
      </header>

      <details class="pt-map-backup pt-field" data-backup-panel>
        <summary>Back up locations</summary>
        <div class="pt-field-actions">
          <button type="button" class="pt-field-btn" data-export-pins>Export backup</button>
          <button type="button" class="pt-field-btn" data-import-pins>Restore backup</button>
          <input type="file" accept=".json,application/json" data-backup-file hidden>
        </div>
        <p>Backups include pins, notes and reference photos. Restoring keeps existing pins with the same ID.</p>
        <p data-backup-status role="status"></p>
      </details>

      <div class="pt-map-wrap">
        <div class="pt-map-canvas" data-map-canvas></div>

        <div class="pt-map-hint" data-add-hint hidden>
          <span data-add-hint-text></span>
          <button class="pt-icon-btn" data-cancel-add type="button" aria-label="Cancel adding a pin">${icon("close")}</button>
        </div>

        <div class="pt-map-category-picker" data-category-picker hidden>
          ${CATEGORIES.map(
            (c) => `
            <button class="pt-map-category-btn" data-category="${c.id}" type="button" style="--marker-color:${c.color}">
              ${icon(c.icon)}
              <span>${c.label}</span>
            </button>`
          ).join("")}
        </div>

        <button class="pt-map-fab" data-fab-add type="button" aria-label="Add a pin">${icon("plus")}</button>
      </div>

      <div class="pt-modal-backdrop" data-pin-modal-backdrop style="display:none">
        <div class="pt-modal pt-map-modal" role="dialog" aria-modal="true">
          <div class="pt-map-modal-head">
            <span class="pt-map-modal-category" data-modal-category></span>
            <button class="pt-icon-btn" data-modal-close type="button" aria-label="Close">${icon("close")}</button>
          </div>

          <input type="text" class="pt-map-input" data-pin-name placeholder="Name this location…" autocomplete="off" />

          <div class="pt-map-search">
            <div class="pt-planner-search-input-wrap">
              ${icon("search", "pt-planner-search-icon")}
              <input type="text" class="pt-planner-search-input" data-pin-search placeholder="Search address to fine-tune position…" autocomplete="off" />
            </div>
            <ul class="pt-planner-search-results" data-pin-search-results></ul>
          </div>

          <textarea class="pt-map-textarea" data-pin-notes placeholder="Notes…" rows="3"></textarea>

          <label class="pt-map-photo-input">
            ${icon("camera")}
            <span data-photo-label>Attach reference photo</span>
            <input type="file" accept="image/*" hidden data-pin-photo />
          </label>

          <button class="pt-map-save-btn" data-pin-save type="button">Save Location</button>
        </div>
      </div>
    </div>`;
}

function popupMarkup(pin, photoUrl) {
  const cat = categoryById(pin.category);
  const mapsUrl = `https://www.google.com/maps?q=${pin.lat},${pin.lng}`;
  const pinQuery = new URLSearchParams({ pin: pin.id });
  return `
    <div class="pt-map-popup">
      ${photoUrl ? `<img class="pt-map-popup-photo" src="${photoUrl}" alt="" />` : ""}
      <div class="pt-map-popup-head">
        <span class="pt-map-popup-category" style="--marker-color:${cat.color}">${icon(cat.icon)}</span>
        <h4>${escapeHtml(pin.name || cat.label)}</h4>
      </div>
      ${pin.notes ? `<p class="pt-map-popup-notes">"${escapeHtml(pin.notes)}"</p>` : ""}
      ${pin.address ? `<p class="pt-map-popup-address">${icon("mapPin")}<span>${escapeHtml(pin.address)}</span></p>` : ""}
      <div class="pt-map-popup-planners">
        <strong>Plan a shoot</strong>
        <a href="#/tool/sun-planner?${pinQuery}">Sun Planner</a>
        <a href="#/tool/astro-planner?${pinQuery}">Astro Planner</a>
      </div>
      <div class="pt-map-popup-actions">
        <a class="pt-map-popup-maps" href="${mapsUrl}" target="_blank" rel="noopener">${icon("externalLink")}<span>Google Maps</span></a>
        <button class="pt-map-popup-delete" data-delete-pin type="button">${icon("trash")}<span>Delete</span></button>
      </div>
    </div>`;
}

export function renderMapLocations(container) {
  const tool = getTool("map-locations");
  if (!tool) {
    navigate("/");
    return;
  }

  let disposed = false;
  container.innerHTML = shellMarkup(tool);

  const mapCanvasEl = container.querySelector("[data-map-canvas]");
  const addHintEl = container.querySelector("[data-add-hint]");
  const addHintTextEl = container.querySelector("[data-add-hint-text]");
  const categoryPickerEl = container.querySelector("[data-category-picker]");
  const fabEl = container.querySelector("[data-fab-add]");
  const modalBackdropEl = container.querySelector("[data-pin-modal-backdrop]");
  const modalCategoryEl = container.querySelector("[data-modal-category]");
  const nameInput = container.querySelector("[data-pin-name]");
  const notesInput = container.querySelector("[data-pin-notes]");
  const searchInput = container.querySelector("[data-pin-search]");
  const searchResultsEl = container.querySelector("[data-pin-search-results]");
  const photoInput = container.querySelector("[data-pin-photo]");
  const photoLabelEl = container.querySelector("[data-photo-label]");
  const saveBtn = container.querySelector("[data-pin-save]");

  // The rest of this view's chrome (FAB, modal, hint banner) is rendered
  // once above and updated imperatively from here on — unlike Astro
  // Planner's full re-render-per-state-change pattern, a full innerHTML
  // wipe here would destroy the live Leaflet map instance on every change.
  const map = L.map(mapCanvasEl, { zoomControl: true, zoomAnimation: false })
    .setView([DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const markersById = new Map();
  let addCategory = null;
  let draftMarker = null;
  let draftLatLng = null;
  let pendingPhotoFile = null;
  let lastSearchResults = [];

  function attachPinMarker(pin) {
    if (disposed) return null;
    if (markersById.has(pin.id)) return markersById.get(pin.id);
    const marker = L.marker([pin.lat, pin.lng], { icon: markerIcon(pin.category), draggable: true }).addTo(map);
    markersById.set(pin.id, marker);

    let popupPhotoUrl = null;
    marker.bindPopup("", { maxWidth: 240 });

    function renderPopup() {
      const popup = marker.getPopup();
      popup.setContent(popupMarkup(pin, popupPhotoUrl));
      popup
        .getElement()
        ?.querySelector("[data-delete-pin]")
        ?.addEventListener("click", () => {
          deletePin(pin.id)
            .then(() => {
              marker.closePopup();
              map.removeLayer(marker);
              markersById.delete(pin.id);
            })
            .catch((err) => console.error("Failed to delete pin", err));
        });
    }

    marker.on("popupopen", () => {
      popupPhotoUrl = pin.photoBlob ? URL.createObjectURL(pin.photoBlob) : null;
      renderPopup();

      // Older pins saved before the address field existed, or ones whose
      // save-time lookup failed, backfill (and cache) on next view rather
      // than blocking the popup from opening.
      if (!pin.address) {
        reverseGeocode(pin.lat, pin.lng)
          .then((r) => r.name)
          .catch(() => null)
          .then((address) => {
            if (!address || disposed) return;
            pin.address = address;
            updatePinAddress(pin.id, address).catch((err) => console.error("Failed to persist address", err));
            if (marker.isPopupOpen()) renderPopup();
          });
      }
    });

    marker.on("popupclose", () => {
      if (popupPhotoUrl) {
        URL.revokeObjectURL(popupPhotoUrl);
        popupPhotoUrl = null;
      }
    });

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      pin.lat = lat;
      pin.lng = lng;
      updatePinPosition(pin.id, lat, lng).catch((err) => console.error("Failed to update pin position", err));
    });

    return marker;
  }

  getAllPins()
    .then((pins) => {
      if (disposed) return;
      pins.forEach(attachPinMarker);
    })
    .catch((err) => console.error("Failed to load saved pins", err));

  const backupPanel = container.querySelector("[data-backup-panel]");
  const backupStatus = backupPanel.querySelector("[data-backup-status]");
  const backupFile = backupPanel.querySelector("[data-backup-file]");
  const exportButton = backupPanel.querySelector("[data-export-pins]");
  const importButton = backupPanel.querySelector("[data-import-pins]");

  function setBackupBusy(busy) {
    exportButton.disabled = busy;
    importButton.disabled = busy;
  }

  backupPanel.addEventListener("toggle", () => {
    if (!disposed) map.invalidateSize();
  });
  exportButton.addEventListener("click", async () => {
    setBackupBusy(true);
    backupStatus.textContent = "Preparing backup…";
    try {
      const pins = await getAllPins();
      const data = await encodeLocationBackup(pins);
      if (disposed) return;
      if (new Blob([data]).size > MAX_BACKUP_BYTES) {
        backupStatus.textContent = "This backup exceeds the 80 MB file limit.";
        return;
      }
      downloadFile(data, "toolbox-locations.json", "application/json");
      backupStatus.textContent = `Exported ${pins.length} location(s).`;
    } catch {
      backupStatus.textContent = "Couldn’t export locations.";
    } finally {
      setBackupBusy(false);
    }
  });
  importButton.addEventListener("click", () => backupFile.click());
  backupFile.addEventListener("change", async () => {
    const file = backupFile.files[0];
    backupFile.value = "";
    if (!file) return;
    setBackupBusy(true);
    backupStatus.textContent = "Reading backup…";
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup too large");
      const pins = decodeLocationBackup(await file.text());
      if (disposed) return;
      const added = await restorePins(pins);
      if (disposed) return;
      added.forEach(attachPinMarker);
      if (added.length) map.setView([added[0].lat, added[0].lng], 12);
      backupStatus.textContent = `Restored ${added.length} location(s). Kept ${pins.length - added.length} existing location(s).`;
    } catch {
      backupStatus.textContent = "Couldn’t restore the backup. Choose a Toolbox locations file under 80 MB.";
    } finally {
      setBackupBusy(false);
    }
  });

  getCurrentPosition()
    .then(({ lat, lon }) => {
      if (!disposed) map.setView([lat, lon], 12);
    })
    .catch(() => {
      // Geolocation denied/unavailable — stay at the default SE Queensland center.
    });

  function enterAddMode(categoryId) {
    addCategory = categoryId;
    categoryPickerEl.hidden = true;
    addHintEl.hidden = false;
    addHintTextEl.textContent = `Tap the map to place your ${categoryById(categoryId).label} pin`;
    mapCanvasEl.classList.add("pt-map-canvas--picking");
  }

  function exitAddMode() {
    addCategory = null;
    addHintEl.hidden = true;
    mapCanvasEl.classList.remove("pt-map-canvas--picking");
    if (draftMarker) {
      map.removeLayer(draftMarker);
      draftMarker = null;
    }
  }

  function resetModalFields() {
    nameInput.value = "";
    notesInput.value = "";
    searchInput.value = "";
    searchResultsEl.innerHTML = "";
    photoInput.value = "";
    pendingPhotoFile = null;
    photoLabelEl.textContent = "Attach reference photo";
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Location";
  }

  function openSaveModal(categoryId, latlng) {
    draftLatLng = latlng;
    modalCategoryEl.textContent = categoryById(categoryId).label;
    resetModalFields();
    modalBackdropEl.style.display = "flex";
    window.addEventListener("keydown", handleEscape);
    nameInput.focus();
  }

  function closeSaveModal() {
    modalBackdropEl.style.display = "none";
    window.removeEventListener("keydown", handleEscape);
  }

  function handleEscape(e) {
    if (e.key === "Escape") {
      closeSaveModal();
      exitAddMode();
    }
  }

  function bindSearchResultClicks() {
    searchResultsEl.querySelectorAll("[data-search-index]").forEach((el) => {
      el.addEventListener("click", () => {
        const result = lastSearchResults[Number(el.dataset.searchIndex)];
        if (!result) return;
        draftLatLng = { lat: result.lat, lng: result.lon };
        if (draftMarker) draftMarker.setLatLng(draftLatLng);
        map.panTo(draftLatLng);
        searchInput.value = result.name;
        searchResultsEl.innerHTML = "";
      });
    });
  }

  const searchDebounced = createLocationSearch((results) => {
    if (disposed) return;
    lastSearchResults = results;
    searchResultsEl.innerHTML = results
      .map((r, i) => `<li class="pt-planner-search-result" data-search-index="${i}">${icon("mapPin")}<span>${escapeHtml(r.name)}</span></li>`)
      .join("");
    bindSearchResultClicks();
  }, 700, () => {
    if (disposed) return;
    searchResultsEl.innerHTML = `<li class="pt-planner-search-status">Search failed — try again.</li>`;
  });

  async function handleSavePin() {
    if (!draftLatLng || !addCategory) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const [photoBlob, address] = await Promise.all([
        pendingPhotoFile ? compressImage(pendingPhotoFile) : Promise.resolve(null),
        reverseGeocode(draftLatLng.lat, draftLatLng.lng)
          .then((r) => r.name)
          .catch(() => null),
      ]);
      const pin = {
        id: createPinId(),
        category: addCategory,
        name: nameInput.value.trim() || categoryById(addCategory).label,
        notes: notesInput.value.trim(),
        lat: draftLatLng.lat,
        lng: draftLatLng.lng,
        address,
        photoBlob,
        createdAt: Date.now(),
      };
      await savePin(pin);
      attachPinMarker(pin);
      closeSaveModal();
      exitAddMode();
    } catch (err) {
      console.error("Failed to save pin", err);
      saveBtn.textContent = "Save failed — try again";
      saveBtn.disabled = false;
    }
  }

  map.on("click", (e) => {
    if (!addCategory) return;
    if (draftMarker) map.removeLayer(draftMarker);
    draftMarker = L.marker(e.latlng, { icon: markerIcon(addCategory, true) }).addTo(map);
    openSaveModal(addCategory, e.latlng);
  });

  fabEl.addEventListener("click", () => {
    categoryPickerEl.hidden = !categoryPickerEl.hidden;
  });

  categoryPickerEl.querySelectorAll("[data-category]").forEach((btn) => {
    btn.addEventListener("click", () => enterAddMode(btn.dataset.category));
  });

  container.querySelector("[data-cancel-add]").addEventListener("click", exitAddMode);

  container.querySelector("[data-modal-close]").addEventListener("click", () => {
    closeSaveModal();
    exitAddMode();
  });

  modalBackdropEl.addEventListener("click", (e) => {
    if (e.target === modalBackdropEl) {
      closeSaveModal();
      exitAddMode();
    }
  });

  searchInput.addEventListener("input", (e) => searchDebounced(e.target.value, null));

  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0] || null;
    pendingPhotoFile = file;
    photoLabelEl.textContent = file ? file.name : "Attach reference photo";
  });

  saveBtn.addEventListener("click", handleSavePin);

  container.querySelector("[data-back]").addEventListener("click", () => {
    navigate("/");
  });

  return () => {
    disposed = true;
    searchDebounced.cancel();
    window.removeEventListener("keydown", handleEscape);
    map.remove();
  };
}
