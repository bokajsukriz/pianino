/* ui.js — kleine DOM-Helfer, gemeinsam für App und Übungen. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/** Feld eines Screens: <… data-f="name">. */
export const field = (screen, name) => screen.querySelector(`[data-f="${name}"]`);

let currentScreen = null;
export const screenName = () => currentScreen;

/** Screen zeigen, alle anderen verbergen. */
export function showScreen(name) {
  for (const s of $$('.screen')) s.hidden = s.dataset.screen !== name;
  const el = $(`#s-${name}`);
  document.body.classList.toggle('is-dark', !!el?.classList.contains('dark'));
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = el?.classList.contains('dark') ? '#241b3d' : '#fff7ec';
  currentScreen = name;
  window.scrollTo(0, 0);
  screenHook?.(name);
  return el;
}

let screenHook = null;
/** Wird bei jedem Screenwechsel mit dem Namen aufgerufen (app.js: Verlauf). */
export const onScreen = (fn) => { screenHook = fn; };

/** Auf einen Klick in `root` auf ein Element mit data-<attr> warten.
 *  → Promise mit dem Attributwert. */
export function waitChoice(root, attr) {
  return new Promise((resolve) => {
    const onClick = (e) => {
      const b = e.target.closest(`[data-${attr}]`);
      if (!b || !root.contains(b) || b.disabled) return;
      root.removeEventListener('click', onClick);
      resolve(b.dataset[attr]);
    };
    root.addEventListener('click', onClick);
  });
}

/** Frage-Dialog. buttons: [{ label, value, primary }] → Promise<value>. */
export function modal(title, text, buttons) {
  const box = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  $('#modal-text').hidden = !text;
  $('#modal-input').hidden = true;
  const row = $('#modal-buttons');
  row.replaceChildren(...buttons.map((b) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${b.primary ? 'btn-primary' : 'btn-secondary'}`;
    el.textContent = b.label;
    el.dataset.value = b.value;
    return el;
  }));
  box.hidden = false;
  row.querySelector('.btn-primary')?.focus();
  return waitChoice(row, 'value').then((v) => { box.hidden = true; return v; });
}

/** Eingabe-Dialog. → Promise<Text> oder null (Abbrechen). */
export async function ask(title, text, { value = '', placeholder = '', ok = 'OK' } = {}) {
  const input = $('#modal-input');
  const p = modal(title, text, [{ label: 'Abbrechen', value: 'no' }, { label: ok, value: 'ok', primary: true }]);
  input.hidden = false;
  input.value = value;
  input.placeholder = placeholder;
  input.focus();
  input.select();
  const enter = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#modal-buttons .btn-primary').click(); } };
  input.addEventListener('keydown', enter);
  const a = await p;
  input.removeEventListener('keydown', enter);
  input.hidden = true;
  return a === 'ok' ? input.value.trim() : null;
}

/** Langes Drücken (≥ 0,5 s) oder Kontextmenü. → Aufräumen. */
export function onLongPress(elm, fn) {
  let t = null;
  const clear = () => { clearTimeout(t); t = null; };
  const down = (e) => { clear(); t = setTimeout(() => { t = null; elm.dataset.longpress = '1'; fn(e); }, 500); };
  elm.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) elm.addEventListener(ev, clear);
  elm.addEventListener('contextmenu', (e) => { e.preventDefault(); clear(); elm.dataset.longpress = '1'; fn(e); });
  // Der Klick nach einem langen Druck zählt nicht.
  elm.addEventListener('click', (e) => { if (elm.dataset.longpress) { delete elm.dataset.longpress; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

/** Schlagpunkte anlegen (n Stück, der erste als Eins). */
export function makeDots(host, n) {
  host.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const d = document.createElement('i');
    if (i === 0) d.className = 'one';
    return d;
  }));
}
/** Punkte bis einschließlich k (0-basiert) füllen; k < 0 = keiner. */
export function setDots(host, k) {
  [...host.children].forEach((d, i) => d.classList.toggle('on', i <= k));
}

/** requestAnimationFrame-Schleife; → stop(). */
export function frameLoop(fn) {
  let id = 0, on = true;
  const step = () => { if (!on) return; fn(); id = requestAnimationFrame(step); };
  id = requestAnimationFrame(step);
  return () => { on = false; cancelAnimationFrame(id); };
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Schalter (aria-pressed) setzen. */
export function setToggle(btn, on, disabled = false) {
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.disabled = disabled;
}

/** Zufall außerhalb der reinen Module. */
export const rand = () => Math.random();
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
