// Hand-authored, lucide-style inline SVGs (24x24, stroke-based) so the shell
// has zero icon-package dependency. Pass a fill/stroke via CSS currentColor.
const wrap = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  menu: wrap('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),

  close: wrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),

  settings: wrap(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
  ),

  chevronRight: wrap('<polyline points="9 18 15 12 9 6"/>'),

  arrowLeft: wrap('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),

  aperture: wrap(
    '<circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/>'
  ),

  plane: wrap(
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 .1-1.3.5l-.5.7c-.3.5-.2 1.1.3 1.4L9 12l-2 3H4l-1 1.5 3 1 1 3L8.5 19v-3l3-2 3.6 6.2c.3.5.9.6 1.4.3l.7-.5c.4-.3.6-.8.5-1.3z"/>'
  ),

  cloudMoon: wrap(
    '<path d="M12.5 3a5.5 5.5 0 1 0 5.9 6.9A6.5 6.5 0 0 1 12.5 3z"/><path d="M5 16.5a3.5 3.5 0 0 1 .7-6.94 4.5 4.5 0 0 1 8.6-1.3 3.5 3.5 0 0 1 .2 8.24"/><path d="M6 20h11"/>'
  ),

  telescope: wrap(
    '<path d="m10.1 12.9-6.6 3.8"/><path d="M14.5 3.4 21 15l-8.5 4.9L6 8.3z"/><circle cx="6" cy="17.5" r="2.5"/><path d="M9 22l1.5-2.5"/><path d="M13.5 6.5 17 12.5"/>'
  ),

  calendarStar: wrap(
    '<rect x="3" y="4.5" width="18" height="16" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/><path d="m12 12.5 1.1 2.2 2.4.35-1.75 1.7.4 2.35L12 18l-2.15 1.1.4-2.35-1.75-1.7 2.4-.35z"/>'
  ),

  mountain: wrap('<path d="m3 20 6-11 4 6.5L16.5 9 21 20z"/>'),

  externalLink: wrap(
    '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
  ),

  clock: wrap('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>'),

  info: wrap('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>'),
};

export function icon(name, extraClass = "") {
  const svg = icons[name] || "";
  if (!extraClass) return svg;
  return svg.replace("<svg ", `<svg class="${extraClass}" `);
}
