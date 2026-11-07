const FORMAT = "photographers-toolbox-locations";
export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

async function encodePhoto(blob) {
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

export async function encodeLocationBackup(pins) {
  const locations = [];
  for (const { photoBlob, ...pin } of pins) {
    locations.push({ ...pin, photo: await encodePhoto(photoBlob) });
  }
  return JSON.stringify({ format: FORMAT, version: 1, locations });
}

export function decodeLocationBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.format !== FORMAT || backup.version !== 1 || !Array.isArray(backup.locations)) {
    throw new Error("Unrecognized Toolbox backup");
  }

  const ids = new Set();
  return backup.locations.map((pin) => {
    if (!pin) throw new Error("Invalid location");
    const { id, lat, lng, category, name, notes, address, createdAt, photo } = pin;
    if (typeof id !== "string" || !id || ids.has(id) ||
        !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) ||
        typeof category !== "string" || typeof name !== "string" ||
        (notes != null && typeof notes !== "string") ||
        (address != null && typeof address !== "string") ||
        (photo != null && typeof photo !== "string")) {
      throw new Error("Invalid location");
    }
    ids.add(id);
    const bytes = photo ? Uint8Array.from(atob(photo), (char) => char.charCodeAt(0)) : null;
    // Map Locations stores compressed JPEGs. Reject other payloads on import.
    if (bytes && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)) {
      throw new Error("Invalid reference photo");
    }
    return {
      id, lat, lng, category, name,
      notes: notes || "",
      address: address || null,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      photoBlob: bytes ? new Blob([bytes], { type: "image/jpeg" }) : null,
    };
  });
}
