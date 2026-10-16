// What the window asks of the system: app icons, accessibility, updates, the problem report.
const { execFile } = require('child_process');
const { ipcMain, app, screen } = require('electron');
const plat = require('../platform');
const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let ringLog, ringState, rpc;
exports.link = ctx => { ({ ringLog, ringState, rpc } = ctx); };

// What went wrong in the main process, for the problem report: a renderer or the GPU process
// gone, a window that stopped answering, an uncaught error (watched only: what the app does
// about them is unchanged).
const faults = [];
const fault = s => { faults.push(`${new Date().toTimeString().slice(0, 8)} ${s}`); if (faults.length > 12) faults.shift(); };
process.on('uncaughtExceptionMonitor', (e, origin) => fault(`${origin === 'unhandledRejection' ? 'unhandled rejection' : 'uncaught'}: ${String(e && (e.stack || e.message || e)).split('\n').slice(0, 2).join(' | ')}`));
app.on('child-process-gone', (_e, d) => fault(`${d.type}${d.name ? ' ' + d.name : ''} process gone: ${d.reason} (exit ${d.exitCode})`));
app.on('render-process-gone', (_e, wc, d) => { let page = ''; try { page = wc.getURL().split('/').pop(); } catch (e) {} fault(`page ${page} gone: ${d.reason} (exit ${d.exitCode})`); });
app.on('browser-window-created', (_e, w) => w.on('unresponsive', () => { let page = ''; try { page = w.webContents.getURL().split('/').pop(); } catch (e) {} fault(`page ${page} not answering`); }));

function run(cmd, args) { return new Promise(resolve => execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || ''), error: err ? String(stderr || err.message).trim() : '' }))); }
// An application's icon for the profile bar, as a data URL. Linux names icons by theme name
// (looked up in hicolor and pixmaps, the way a launcher would); Windows and macOS ask the shell for
// the icon of the app's shortcut or bundle. null when there is none to show.
const appIcons = new Map();
ipcMain.handle('app-icon', async (_e, spec) => {
  const key = JSON.stringify(spec || {});
  if (appIcons.has(key)) return appIcons.get(key);
  let url = null;
  try {
    if (!plat.IS_LINUX) {
      if (spec && spec.id && fs.existsSync(spec.id)) url = (await app.getFileIcon(spec.id, { size: 'normal' })).toDataURL();
    } else if (spec && spec.icon) {
      const name = spec.icon;
      const roots = [path.join(os.homedir(), '.local/share/icons'), '/usr/share/icons', '/var/lib/flatpak/exports/share/icons', path.join(os.homedir(), '.local/share/flatpak/exports/share/icons')];
      const sizes = ['64x64', '48x48', '128x128', '96x96', '256x256', '32x32', 'scalable'];
      const tries = path.isAbsolute(name) ? [name] : [];
      for (const r of roots) for (const s of sizes) for (const ext of ['png', 'svg']) tries.push(path.join(r, 'hicolor', s, 'apps', `${name}.${ext}`));
      for (const ext of ['png', 'svg', 'xpm']) tries.push(path.join('/usr/share/pixmaps', `${name}.${ext}`));
      const hit = tries.find(f => { try { return fs.statSync(f).isFile(); } catch (e) { return false; } });
      if (hit && !hit.endsWith('.xpm')) {
        // only real images: some packages ship a placeholder (a Git LFS pointer) under an icon's name
        const buf = fs.readFileSync(hit), svg = hit.endsWith('.svg');
        const real = svg ? /<svg[\s>]/i.test(buf.slice(0, 4096).toString('utf8')) : buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
        if (real) url = `data:${svg ? 'image/svg+xml' : 'image/png'};base64,${buf.toString('base64')}`;
      }
    }
  } catch (e) {}
  appIcons.set(key, url);
  return url;
});
// macOS: posting key and button actions needs the Accessibility permission for LogiMX
ipcMain.handle('accessibility', (_e, prompt) => ({ trusted: plat.accessibilityTrusted(prompt), needed: plat.IS_MAC }));
ipcMain.handle('open-accessibility', () => plat.openAccessibilitySettings());
// Accessibility first (see platform.js), then asks (the system's prompt the first time) and opens the setting
ipcMain.handle('input-monitoring-open', () => {
  if (!plat.accessibilityTrusted(false)) { plat.accessibilityTrusted(true); plat.openAccessibilitySettings(); return 'accessibility'; }
  const s = plat.inputMonitoring(true);
  if (s !== 'granted') plat.openInputMonitoringSettings();
  return s;
});
ipcMain.handle('open-bluetooth', () => { if (!plat.IS_LINUX) return plat.openBluetooth(); execFile('gnome-control-center', ['bluetooth'], () => execFile('systemsettings', ['kcm_bluetooth'], () => {})); });
// The latest release on GitHub. A renamed repository answers at its old address with a redirect,
// so redirects are followed (a few, to the same API host).
ipcMain.handle('check-updates', () => new Promise(resolve => {
  const https = require('https');
  const get = (where, hops) => {
    const req = https.get(Object.assign({ host: 'api.github.com', headers: { 'User-Agent': 'NotLogi' }, timeout: 8000 }, where), res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops > 0) {
        res.resume();
        try { const u = new URL(res.headers.location, 'https://api.github.com'); if (u.host === 'api.github.com') return get({ path: u.pathname + u.search }, hops - 1); } catch (e) {}
        return resolve({ ok: false, error: t('unexpected redirect') });
      }
      let body = ''; res.on('data', c => body += c); res.on('end', () => { try { const j = JSON.parse(body); resolve({ ok: true, latest: (j.tag_name || '').replace(/^v/, ''), url: j.html_url, current: app.getVersion() }); } catch (e) { resolve({ ok: false, error: t('unexpected reply') }); } });
    });
    req.on('error', e => resolve({ ok: false, error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: t('timeout') }); });
  };
  get({ path: '/repos/aabdelghani/notlogi/releases/latest' }, 3);
}));
// A report for a public issue: what is needed to reproduce a problem and nothing that identifies the
// person. Serial numbers, host names, the user name and the home directory are taken out, and
// custom actions are reduced to their kind (a command or a typed text never leaves the machine).
ipcMain.handle('diag-report', async () => {
  const os = require('os');
  let distro = plat.IS_LINUX ? '' : plat.systemName(); try { if (plat.IS_LINUX) distro = (/^PRETTY_NAME="?([^"\n]*)/m.exec(fs.readFileSync('/etc/os-release', 'utf8')) || [])[1] || ''; } catch (e) {}
  const install = process.env.APPIMAGE ? 'AppImage' : app.isPackaged ? (plat.IS_WIN ? 'installer' : plat.IS_MAC ? '.dmg' : app.getAppPath().startsWith('/opt/') ? '.deb' : 'packaged') : 'from source';
  let st = {}, devs = [], logs = [];
  try { st = await rpc('status', {}); } catch (e) {}
  try { for (const d of await rpc('devices', {})) devs.push(await rpc('device', { id: d.id })); } catch (e) {}
  try { logs = await rpc('logs', {}); } catch (e) {}
  const secrets = new Set([os.hostname(), os.userInfo().username]);
  for (const d of devs) {
    if (d.serial) secrets.add(d.serial);
    for (const h of (((d.state || {}).hosts || {}).names || [])) if (h.name) secrets.add(h.name);
  }
  const redact = t => { let o = String(t).split(os.homedir()).join('~'); for (const x of secrets) if (x && x.length > 2) o = o.split(x).join('[removed]'); return o; };
  const kindOf = a => typeof a === 'string' ? a : a && a.type ? (a.preset || a.type) : 'native';
  const lines = [];
  lines.push('| | |', '|---|---|');
  lines.push(`| NotLogi | ${app.getVersion()} (agent ${st.version || 'not running'}), ${install} |`);
  lines.push(plat.IS_LINUX ? `| System | ${distro || os.type()}, kernel ${os.release()} |` : `| System | ${distro}, ${os.arch()} |`);
  if (plat.IS_LINUX) lines.push(`| Desktop | ${process.env.ORIGINAL_XDG_CURRENT_DESKTOP || process.env.XDG_CURRENT_DESKTOP || 'unknown'}, ${process.env.XDG_SESSION_TYPE || 'unknown session'} |`);
  let gpu = ''; try { const g = app.getGPUFeatureStatus(); gpu = ['gpu_compositing', 'webgl', 'opengl'].filter(k => g[k]).map(k => `${k.replace('gpu_', '')} ${g[k]}`).join(', '); } catch (e) {}
  lines.push(`| Electron | ${process.versions.electron}, Chromium ${process.versions.chrome}${gpu ? ', ' + gpu : ''} |`);
  // how this process came to be: what to know when the app does not open, or started itself again
  const since = new Date(Date.now() - process.uptime() * 1000).toTimeString().slice(0, 8);
  let started = `since ${since}, ${process.argv.slice(1).filter(a => a.startsWith('--')).join(' ') || 'no flags'}`;
  if (plat.IS_LINUX) {
    const read = f => { try { return fs.readFileSync(f, 'utf8').trim(); } catch (e) { return ''; } };
    const parent = read(`/proc/${process.ppid}/comm`), nnp = (/^NoNewPrivs:\s*(\d)/m.exec(read('/proc/self/status')) || [])[1], userns = read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns');
    started += `, ozone ${app.commandLine.getSwitchValue('ozone-platform') || 'default'}${process.env.NOTLOGI_RESTARTED ? ` (restarted from ${process.env.NOTLOGI_RESTARTED})` : ''}${parent ? `, parent ${parent}` : ''}`;
    started += process.argv.includes('--no-sandbox') ? ', sandbox off' : `, sandbox on, no_new_privs ${nnp === undefined ? '?' : nnp}, userns restricted ${userns === '' ? 'n/a' : userns}`;
  }
  lines.push(`| Process | ${started} |`);
  const win = state.win && !state.win.isDestroyed() ? state.win : null, emoji = state.emojiWin && !state.emojiWin.isDestroyed() ? state.emojiWin : null;
  const where = w => { const b = w.getBounds(), all = screen.getAllDisplays(), i = all.findIndex(d => d.id === screen.getDisplayMatching(b).id); return `${b.width}x${b.height} at (${b.x}, ${b.y})${all.length > 1 ? ` on display ${i + 1}` : ''}`; };
  lines.push(`| Windows | main ${!win ? 'none' : !win.isVisible() ? 'hidden' : (win.isMinimized() ? 'minimised, ' : 'shown, ') + where(win)}; ring ${ringState()}; tray ${state.tray ? 'yes' : 'no'}; emoji ${!emoji ? 'none' : emoji.isVisible() ? 'shown' : 'hidden'} |`);
  lines.push(`| Agent | ${state.connected ? 'connected' : 'not connected'}, focus tracking ${st.tracker || 'n/a'}, receivers ${st.receivers || 'none'}, other tools running: ${((st.conflicts || []).map(c => c.name).join(', ')) || 'none'}${st.paused ? ', paused' : ''} |`);
  for (const d of devs) {
    const stt = d.state || {}, prof = ((d.config || {}).profiles || {}).default || {};
    lines.push('', `**${d.name}** (${d.id}, ${d.kind}, ${d.transport || 'unknown link'}) firmware ${d.firmware || '?'}, battery ${d.battery ? (d.battery.known === false ? 'level not reported' : d.battery.percent + '%') + (d.battery.charging ? ' charging' : d.battery.external_power ? ' on the cable' : '') : 'n/a'}`);
    lines.push(`- features: ${(d.features || []).join(' ')}`);
    lines.push(`- controls: ${(d.controls || []).map(c => c.cid + (c.diverted ? '*' : '')).join(' ')} (* = diverted)`);
    const asg = [];
    for (const sec of ['buttons', 'keys']) for (const [cid, a] of Object.entries(prof[sec] || {})) if (kindOf(a) !== 'native') asg.push(`${cid} ${kindOf(a)}`);
    if (prof.thumbwheel && kindOf(prof.thumbwheel) !== 'native') asg.push(`thumb wheel ${kindOf(prof.thumbwheel)}`);
    lines.push(`- assignments: ${asg.join(', ') || 'all default'}`);
    const bits = [];
    if (stt.dpi) bits.push(`dpi ${stt.dpi.dpi}`);
    if (stt.smartshift) bits.push(`smartshift ${stt.smartshift.mode}/${stt.smartshift.threshold}`);
    if (stt.haptic) bits.push(`haptic ${stt.haptic.enabled ? 'on' : 'off'}/${stt.haptic.level}`);
    if (stt.backlight) bits.push(`backlight ${stt.backlight.enabled ? 'on' : 'off'}`);
    if (stt.fn_swap !== undefined) bits.push(`fn swap ${stt.fn_swap}`);
    if (bits.length) lines.push(`- state: ${bits.join(', ')}`);
  }
  if (!devs.length) lines.push('', 'No devices found.');
  const ring = (state.general || {}).ring || {};
  lines.push('', `Action ring: ${Array.isArray(ring.profiles) ? ring.profiles.length + ' profile(s)' : 'not set up'}, ${ring.free_pointer ? 'pointer free' : 'steered'}`);
  // how the ring found the pointer on its last openings: the thing that goes wrong on Wayland
  const disp = screen.getAllDisplays().map(d => `${d.bounds.width}x${d.bounds.height}@${d.bounds.x},${d.bounds.y}${d.scaleFactor !== 1 ? ' x' + d.scaleFactor : ''}`).join(', ');
  if (!plat.IS_LINUX) lines.push(`Displays: ${disp}`);
  else lines.push(`Displays: ${disp}; session ${process.env.XDG_SESSION_TYPE || '?'}, DISPLAY ${process.env.DISPLAY ? 'set' : 'unset'}, WAYLAND_DISPLAY ${process.env.WAYLAND_DISPLAY ? 'set' : 'unset'}, ozone hint ${process.env.ELECTRON_OZONE_PLATFORM_HINT || 'none'}`);
  if (ringLog.length) lines.push('Ring openings (last first): ' + ringLog.slice().reverse().map(r => r.how === 'window' ? `${r.when} window ${r.size} at (${r.x}, ${r.y})` : `${r.when} ${r.raw ? 'steered' : 'pointer'}: ${r.how} at ${r.ms} ms, drawn at (${r.x}, ${r.y})${r.dx !== undefined ? `, moved by (${r.dx}, ${r.dy})` : ''}${r.guess ? `, last known (${Math.round(r.guess.x)}, ${Math.round(r.guess.y)})` : ''}`).join('; '));
  else lines.push('Ring openings: none since the app started');
  lines.push(faults.length ? 'Main process faults (last first): ' + faults.slice().reverse().join('; ') : 'Main process faults: none since the app started');
  const summary = redact(lines.join('\n'));
  const log = redact((logs || []).slice(-40).join('\n'));
  return { summary, log, title: `Problem report: ${devs.map(d => d.name).join(', ') || 'no device'} · NotLogi ${app.getVersion()}` };
});

exports.provide = { run, appIcons };
