// Stroke icon set (24x24, drawn for this demo). Used by Astro components and client renders.
export const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  inbox: '<path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/><path d="M5.5 5h13L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6z"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  flow: '<rect x="3" y="4" width="7" height="5" rx="1.5"/><rect x="14" y="15" width="7" height="5" rx="1.5"/><path d="M6.5 9v3.5a2 2 0 0 0 2 2h4M14 17.5h-1.5"/><circle cx="17.5" cy="6.5" r="2.5"/><path d="M10 6.5h5"/>',
  template: '<path d="M5 4h14v11l-4 5H5z"/><path d="M15 20v-5h4M8.5 8.5h7M8.5 12h4.5"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M7.5 15.5 9 20"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx=".8"/><rect x="10.5" y="6" width="3" height="11.5" rx=".8"/><rect x="15.5" y="13" width="3" height="4.5" rx=".8"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  reset: '<path d="M5 12a7 7 0 1 0 2.1-5"/><path d="M5 4.5V8h3.5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  back: '<path d="M14.5 6 8.5 12l6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  send: '<path d="M4.5 12 19.5 5l-4 14-4-5.5z"/><path d="m11.5 13.5 8-8.5"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M7.5 14h9"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  bolt: '<path d="M13 3.5 5.5 13.5H11l-1 7 7.5-10H12z"/>',
  forward: '<path d="M4.5 6.5 11 12l-6.5 5.5zM12.5 6.5 19 12l-6.5 5.5z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  edit: '<path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z"/><path d="m13.5 7 3.5 3.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  note: '<path d="M6 4h12v16H6z"/><path d="M9 9h6M9 12.5h6M9 16h3"/>',
  wait: '<path d="M7 4h10M7 20h10M8 4c0 4 8 4 8 8s-8 4-8 8M16 4c0 4-8 4-8 8"/>',
  branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M6 14c0-3 2-5 10-5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, cls = 'icon'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}
