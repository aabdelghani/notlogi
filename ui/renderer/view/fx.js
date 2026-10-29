// View: the few effects on the drawn page the view models ask for, so they never read or touch
// the page themselves: focus a field, mark a pick without redrawing a long list (it would lose its
// scroll), keep the add panel's button in step.

// from the rest of the window, filled in by link()
let root;
export function link(ctx) { ({ root } = ctx); }
let V;   // the view functions passed through below
export function linkViews(ctx) { V = ctx; }

// put the cursor in a field once it is drawn (after `delay` ms), optionally selecting its text
function focus(selector, { delay = 0, select = false } = {}) {
  setTimeout(() => { const n = root.querySelector(selector); if (n) { n.focus(); if (select) n.select(); } }, delay);
}
// the picked key or action marked in the picker's lists, the others unmarked
function markPicked(kind, key, drawer) {
  if (kind === 'key') {
    root.querySelectorAll('.drawer .act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-key' && x.dataset.key === key));
    root.querySelectorAll('.drawer .kc').forEach(x => x.classList.toggle('on', x.dataset.key === key));
  } else {
    root.querySelectorAll(drawer ? '.drawer .act, .drawer .kc' : '.act').forEach(x => x.classList.toggle('on', x.dataset.act === 'pick-item' && x.dataset.key === key));
  }
}
// an application ticked or unticked in the add panel, and its Add button
function markAddPick(key, on, count, label) {
  root.querySelectorAll(`[data-act=add-pick][data-key="${CSS.escape(key)}"]`).forEach(x => x.classList.toggle('on', on));
  const ok = root.querySelector('[data-act=add-confirm]');
  if (ok) { ok.disabled = !count; ok.innerHTML = `<i class="fa-solid fa-plus"></i>${label}`; }
}
// Home's row of devices moved one card to the left (-1) or right (1)
function scrollHome(dir) {
  const strip = root.querySelector('.home-strip'), card = strip && strip.querySelector('.dev-card');
  if (card) strip.scrollBy({ left: dir * (card.offsetWidth + parseFloat(getComputedStyle(strip).columnGap || 0)), behavior: 'smooth' });
}
// a part of the page brought into view and flashed once it is drawn (a link from elsewhere led to it)
// (and once more a little later: what it shows may still be arriving and draw the page again)
function reveal(selector, { delay = 0 } = {}) {
  const show = flash => { const n = root.querySelector(selector); if (!n) return; n.scrollIntoView({ block: 'start' }); if (flash) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); } };
  setTimeout(() => show(true), delay);
  setTimeout(() => show(true), delay + 700);
}
// a side panel (Backlight, Point & scroll, adding apps) is open beside the device
const panelOpen = () => !!root.querySelector('.devview2.panel-open');

export const provide = { fx: {
  focus, markPicked, markAddPick, panelOpen, reveal, scrollHome, // the side panel slides out, then `after` runs and the window is redrawn
  closeDrawer: after => V.closeDrawer(after), // the profile bar and the picker's app list redrawn on their own (the rest of the page stays)
  refreshBar: () => V.refreshBar(), refreshAppList: () => V.renderAppList(), stopRecorder: () => V.stopRecorder() } };
