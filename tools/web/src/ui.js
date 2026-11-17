// Small helpers of the web app's pages and the sheet viewer alike (sheetpanel.js; the Android app's viewer runs the same):
// making elements, the icons, what this device keeps (localStorage), a toast, the theme, the popup menu.

const $ = (sel, root = document) => root.querySelector(sel);

// h('div', {class: 'x', onclick: f}, child, 'text', [more]) -> element
export function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  append(e, children);
  return e;
}

export function append(e, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

export const ICONS = {
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
  print: '<path d="M7 9V3.5h10V9M7 17H4.5V10h15v7H17M7 14h10v6.5H7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  book: '<path d="M4 4.5h6a2 2 0 0 1 2 2V20a1.5 1.5 0 0 0-1.5-1.5H4zM20 4.5h-6a2 2 0 0 0-2 2V20a1.5 1.5 0 0 1 1.5-1.5H20z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  paper: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  textSmaller: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6"/>',
  textBigger: '<path d="M3 18l4.5-11L12 18M4.6 14h5.8M15 13h6M18 10v6"/>',
  home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
  // the Android app's gear (res/drawable/ic_settings_white_48dp.xml), filled
  settings: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M19.1,12.9a2.8,2.8 0,0 0,0.1 -0.9,2.8 2.8,0 0,0 -0.1,-0.9l2.1,-1.6a0.7,0.7 0,0 0,0.1 -0.6L19.4,5.5a0.7,0.7 0,0 0,-0.6 -0.2l-2.4,1a6.5,6.5 0,0 0,-1.6 -0.9l-0.4,-2.6a0.5,0.5 0,0 0,-0.5 -0.4H10.1a0.5,0.5 0,0 0,-0.5 0.4L9.3,5.4a5.6,5.6 0,0 0,-1.7 0.9l-2.4,-1a0.4,0.4 0,0 0,-0.5 0.2l-2,3.4c-0.1,0.2 0,0.4 0.2,0.6l2,1.6a2.8,2.8 0,0 0,-0.1 0.9,2.8 2.8,0 0,0 0.1,0.9L2.8,14.5a0.7,0.7 0,0 0,-0.1 0.6l1.9,3.4a0.7,0.7 0,0 0,0.6 0.2l2.4,-1a6.5,6.5 0,0 0,1.6 0.9l0.4,2.6a0.5,0.5 0,0 0,0.5 0.4h3.8a0.5,0.5 0,0 0,0.5 -0.4l0.3,-2.6a5.6,5.6 0,0 0,1.7 -0.9l2.4,1a0.4,0.4 0,0 0,0.5 -0.2l2,-3.4c0.1,-0.2 0,-0.4 -0.2,-0.6ZM12,15.6A3.6,3.6 0,1 1,15.6 12,3.6 3.6,0 0,1 12,15.6Z"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M5.5 12v6.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>',
  // the Share menu's tiles, as the Android app's (res/drawable/ic_set_share.xml, ic_set_link.xml)
  shareNodes: '<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="5.5" r="2.6"/><circle cx="18" cy="18.5" r="2.6"/><path d="M8.3 10.8l7.4-4.2M8.3 13.2l7.4 4.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  cloud: '<path d="M7 18.5a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6 1.1A3.5 3.5 0 0 1 17 18.5z"/>',
  piano: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M9.2 5v14M14.8 5v14M7.2 5v7M12 5v7M16.8 5v7"/>',
  tune: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  original: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><path d="M12 8v4l2.5 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

export function icon(name, label) {
  return h('span', {class: 'icon', 'aria-hidden': label ? null : 'true', html:
    `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`});
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('hfw.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('hfw.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  },
};

export function toast(msg) {
  let t = $('#toast');
  if (!t) { t = h('div', {id: 'toast', role: 'status', 'aria-live': 'polite'}); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

export function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t !== 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// a small menu under a button (Share, the sheet's ⋯): items {icon, label, run, checked?} (checked: true/false makes it
// a choice that is on or off, with a tick when on)
export function popupMenu(anchor, items, cls = '') {
  document.querySelector('.share-menu')?.remove();
  const menu = h('div', {class: 'share-menu ' + cls, role: 'menu'}, items.map((it) =>
    h('button', {role: it.checked == null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': it.checked == null ? null : String(!!it.checked),
      onclick: () => { close(); it.run(); }}, h('span', {class: 'tile'}, icon(it.icon)), it.label,
    it.checked ? h('span', {class: 'tick'}, icon('check')) : null)));
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', esc, true);
    anchor.setAttribute('aria-expanded', 'false');
  };
  const away = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.right = Math.max(8, innerWidth - r.right) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc, true);
  menu.querySelector('button').focus();
  return menu;
}

export const themeListeners = new Set();
