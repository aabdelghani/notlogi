// Mapping a compositor-logical cursor position (KWin's workspace.cursorPos,
// Hyprland's cursorpos) into the coordinate space Electron's screen module
// reports. Under XWayland those spaces differ whenever the scales are mixed or
// fractional, and a raw copy of the logical point lands the ring off the
// pointer; the same disease JuhRadial MX fixes by fractional mapping per
// monitor (their overlay's map_and_clamp_menu). Pure functions only: this
// module is shared with the tests and never touches Electron.

// the compositor's monitor that contains the point, or the closest one
export function pickMonitorAt(pt, monitors) {
  if (!Array.isArray(monitors) || !monitors.length) return null;
  let best = null, bestD = Infinity;
  for (const m of monitors) {
    if (typeof m?.x !== 'number' || typeof m?.w !== 'number') continue;
    const cx = m.x + m.w / 2, cy = (m.y || 0) + (m.h || 0) / 2;
    // inside wins outright; otherwise keep the nearest centre for
    // points that fall between monitors (a rounding gap)
    const d = Math.hypot(pt.x - cx, pt.y - cy);
    const inside = pt.x >= m.x && pt.x < m.x + m.w && pt.y >= (m.y || 0) && pt.y < (m.y || 0) + (m.h || 1);
    if (inside) return m;
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

// the display an Electron sees for a compositor monitor: by connector name
// when both sides expose one (KWin's screen.name and Electron's X11 display
// labels are both xrandr names like DP-1), else by overlap
export function matchDisplay(monitor, displays) {
  if (!monitor || !Array.isArray(displays) || !displays.length) return null;
  const name = String(monitor.name || '').trim();
  if (name) {
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const hit = displays.find(d => norm(d.label) === norm(name) || norm(d.name) === norm(name));
    if (hit) return hit;
  }
  let best = null, bestA = 0;
  for (const d of displays) {
    const b = d.bounds || d;
    if (typeof b?.x !== 'number') continue;
    const x1 = Math.max(b.x, monitor.x || 0), y1 = Math.max(b.y, monitor.y || 0);
    const x2 = Math.min(b.x + b.width, (monitor.x || 0) + (monitor.w || 0));
    const y2 = Math.min(b.y + b.height, (monitor.y || 0) + (monitor.h || 0));
    const a = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (a > bestA) { bestA = a; best = d; }
  }
  return best;
}

// a compositor-logical point -> the space of Electron's screen: the point's
// fractional position inside its monitor, applied to the matching display's
// bounds. Falls back to mapping across the unions when nothing matches.
// Reduces to identity when the two layouts are the same (100% scaling).
export function mapCompositorPoint(pt, monitors, displays) {
  const mon = pickMonitorAt(pt, monitors) || union(monitors);
  if (!mon || typeof mon.x !== 'number' || !mon.w) return null;
  const disp = matchDisplay(mon, displays) || union(displays.map(d => {
    const b = d.bounds || d;
    return { name: d.label || d.name, x: b.x, y: b.y, w: b.width, h: b.height };
  }));
  if (!disp) return null;
  const b = disp.bounds || disp;
  if (typeof b?.x !== 'number' || !b.width) return null;
  const fx = Math.min(1, Math.max(0, (pt.x - mon.x) / mon.w));
  const fy = Math.min(1, Math.max(0, (pt.y - (mon.y || 0)) / (mon.h || 1)));
  return { x: Math.round(b.x + fx * b.width), y: Math.round(b.y + fy * b.height) };
}

// the bounding box of a monitor list, as a pseudo-monitor
function union(monitors) {
  if (!Array.isArray(monitors) || !monitors.length) return null;
  const ms = monitors.filter(m => typeof m?.x === 'number' && m.w);
  if (!ms.length) return null;
  const x = Math.min(...ms.map(m => m.x)), y = Math.min(...ms.map(m => m.y || 0));
  const r = Math.max(...ms.map(m => m.x + m.w)), b = Math.max(...ms.map(m => (m.y || 0) + (m.h || 0)));
  return { name: '', x, y, w: r - x, h: b - y };
}
