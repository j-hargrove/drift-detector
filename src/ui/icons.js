// Line icons, 24×24, drawn with currentColor strokes. Decorative: every use sits next to a text label,
// so each is aria-hidden.

const PATHS = {
  upload: '<path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  octagon: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  scale: '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0z"/><path d="m19 7-3 6a3 3 0 0 0 6 0z"/>',
  wand: '<path d="m4 20 11-11"/><path d="m14 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1z"/><path d="M19 12v3"/><path d="M17.5 13.5h3"/>',
  sliders: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h4"/><path d="M12 17h8"/><circle cx="10" cy="17" r="2"/>',
  listCheck: '<path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><path d="m3.5 6 1.5 1.5L8 4.5"/><path d="m3.5 12 1.5 1.5L8 10.5"/><path d="m3.5 18 1.5 1.5L8 16.5"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9 7h6"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
  spacing: '<path d="M4 4v16"/><path d="M20 4v16"/><rect x="8" y="8" width="8" height="8" rx="1.5"/><path d="M4 12h2"/><path d="M18 12h2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/>',
  filePen: '<path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5"/><path d="M18 8v2"/><path d="m14 21 1-3.5 5-5 2.5 2.5-5 5z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17v.01"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M4 19h16"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
};

export const icon = (name, size = 18) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name] ?? ''}</svg>`;

export const RULE_ICON = {
  'no-hardcoded-color': 'drop',
  'no-arbitrary-spacing': 'spacing',
  'no-off-contract-variant': 'layers',
};
export const ruleIcon = (rule, size) => icon(RULE_ICON[rule] ?? 'flag', size);
