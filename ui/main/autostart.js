// Starting with the session: the agent's user service and the window's autostart entry.
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const plat = require('../platform');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const { isOurIcon } = require('./uninstall-plan');
const list = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };

// from the other parts of the main process, filled in by link()
let APPIMAGE, PACKAGED, WM_CLASS, debInstalled, launchCmd, loadUi, resPath;
exports.link = ctx => { ({ APPIMAGE, PACKAGED, WM_CLASS, debInstalled, launchCmd, loadUi, resPath } = ctx); };

// Artefacts left by an older name of the project: a stale enabled unit points at a binary
// that no longer exists and quietly fails at login.
const LEGACY_NAMES = ['openoptions'];
function cleanupLegacyAutostart() {
  const autostartDir = path.join(os.homedir(), '.config', 'autostart');
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  for (const n of LEGACY_NAMES) {
    try { fs.unlinkSync(path.join(autostartDir, n + '.desktop')); } catch (e) {}
    const u = path.join(unitDir, n + '.service');
    try { if (!fs.existsSync(u)) continue; } catch (e) { continue; }
    execFile('systemctl', ['--user', 'disable', '--now', n + '.service'], () => {
      try { fs.unlinkSync(u); } catch (e) {}
      execFile('systemctl', ['--user', 'daemon-reload'], () => {});
    });
  }
}

// Leftovers of other installs of NotLogi in this user's account: a launcher and icons written by a
// checkout or an AppImage beside the package's own (two NotLogi in the app grid), a launcher whose
// program is gone, a user unit saying the same as the package's. An install that still works, and
// is not this one, is left as it is.
const SYSTEM_UNIT = '/usr/lib/systemd/user/logimx.service';
function cleanupLeftovers() {
  const home = os.homedir();
  const launcher = path.join(home, '.local', 'share', 'applications', 'logimx.desktop');
  const iconDir = path.join(home, '.local', 'share', 'icons', 'hicolor');
  // the package's launcher serves, whether this is the package or something started beside it
  const deb = (PACKAGED && !APPIMAGE && fs.existsSync('/usr/share/applications/logimx.desktop')) || debInstalled();
  let drop = deb;
  if (!drop) { try { const m = /^Exec=(?:"([^"]+)"|(\S+))/m.exec(fs.readFileSync(launcher, 'utf8')); drop = !!m && !fs.existsSync(m[1] || m[2]); } catch (e) {} }
  if (drop) {
    try { fs.unlinkSync(launcher); execFile('update-desktop-database', [path.dirname(launcher)], () => {}); } catch (e) {}
    if (deb) {
      for (const size of list(iconDir)) for (const f of list(path.join(iconDir, size, 'apps'))) if (isOurIcon(f)) { try { fs.unlinkSync(path.join(iconDir, size, 'apps', f)); } catch (e) {} }
      execFile('gtk-update-icon-cache', ['-q', '-f', '-t', iconDir], () => {});
    }
  }
  const unit = path.join(home, '.config', 'systemd', 'user', 'logimx.service');
  try {
    if (fs.existsSync(SYSTEM_UNIT) && /^ExecStart=\/usr\/bin\/logimx-agent\s*$/m.test(fs.readFileSync(unit, 'utf8'))) {
      fs.unlinkSync(unit);
      execFile('systemctl', ['--user', 'daemon-reload'], () => execFile('systemctl', ['--user', 'enable', 'logimx.service'], () => {}));
    }
  } catch (e) {}
}

// Re-apply the login setting every time the app starts, so a rename, a moved checkout or a
// hand-edited unit cannot leave 'start at login' switched on but broken.
function ensureAutostart() {
  if (!plat.IS_LINUX) { try { if (loadUi().autostart) plat.setLoginItem(true); } catch (e) {} return; }
  cleanupLegacyAutostart();
  cleanupLeftovers();
  // a unit written by an AppImage points into a mount that no longer exists: rewrite or drop it
  try {
    const unitPath = path.join(os.homedir(), '.config', 'systemd', 'user', 'logimx.service');
    const cur = fs.readFileSync(unitPath, 'utf8');
    const m = /^ExecStart=(.*)$/m.exec(cur);
    if (m && !fs.existsSync(m[1].trim())) { fs.unlinkSync(unitPath); execFile('systemctl', ['--user', 'daemon-reload'], () => {}); }
  } catch (e) {}
  try { if (loadUi().autostart) setAutostart(true); } catch (e) {}
}

// A path that will still exist at the next login. The agent inside an AppImage lives on a
// temporary mount that disappears when the app quits, so it can never go into a unit file.
function stableAgentBin() {
  const c = ['/usr/bin/logimx-agent', '/usr/local/bin/logimx-agent', path.join(os.homedir(), '.local', 'bin', 'logimx-agent')];
  if (!PACKAGED) c.push(path.join(ROOT, '..', 'agent', 'build', 'logimx-agent'));
  else if (!APPIMAGE) c.push(resPath('agent', 'logimx-agent'));
  for (const p of c) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {} }
  return null;
}

// true when a unit exists but its ExecStart no longer resolves, e.g. one written by a previous
// AppImage run into a mount that is long gone
function unitPointsAtMissingBinary(unitPath) {
  try {
    const m = /^ExecStart=(.*)$/m.exec(fs.readFileSync(unitPath, 'utf8'));
    if (!m) return true;
    fs.accessSync(m[1].trim(), fs.constants.X_OK);
    return false;
  } catch (e) {
    return fs.existsSync(unitPath);
  }
}

function removeAgentUnit(unitPath) {
  execFile('systemctl', ['--user', 'disable', '--now', 'logimx.service'], () => {
    try { fs.unlinkSync(unitPath); } catch (e) {}
    execFile('systemctl', ['--user', 'daemon-reload'], () => {});
  });
}

function setAutostart(on) {
  if (!plat.IS_LINUX) return plat.setLoginItem(on);
  cleanupLegacyAutostart();
  const unitDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  const unitPath = path.join(unitDir, 'logimx.service');
  const agentBin = on ? stableAgentBin() : null;
  if (agentBin === '/usr/bin/logimx-agent' && fs.existsSync(SYSTEM_UNIT)) {
    // the package's own unit: enabled as it is, and a copy of this user's saying the same goes
    try { fs.unlinkSync(unitPath); } catch (e) {}
    execFile('systemctl', ['--user', 'daemon-reload'], () => execFile('systemctl', ['--user', 'enable', 'logimx.service'], () => {}));
  } else if (agentBin) {
    const unit = `[Unit]\nDescription=NotLogi agent for MX Master and MX Keys devices\nAfter=graphical-session.target\nPartOf=graphical-session.target\n\n[Service]\nType=simple\nExecStart=${agentBin}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=graphical-session.target\n`;
    try {
      fs.mkdirSync(unitDir, { recursive: true });
      fs.writeFileSync(unitPath, unit);
      execFile('systemctl', ['--user', 'daemon-reload'], () => execFile('systemctl', ['--user', 'enable', 'logimx.service'], () => {}));
    } catch (e) {}
  } else if (!on && fs.existsSync(SYSTEM_UNIT)) {
    execFile('systemctl', ['--user', 'disable', 'logimx.service'], () => {});   // the package's unit: off at login, still running now
    if (unitPointsAtMissingBinary(unitPath)) removeAgentUnit(unitPath);
  } else if (unitPointsAtMissingBinary(unitPath)) {
    // nothing durable to point a unit at, and the one on disk is already broken. The desktop
    // entry starts the app, which starts its own agent, so drop the unit rather than let it
    // fail at every login. A unit that still resolves belongs to another install: leave it.
    removeAgentUnit(unitPath);
  }
  const autostartDir = path.join(os.homedir(), '.config', 'autostart'), desktop = path.join(autostartDir, 'logimx.desktop');
  if (on) { try { fs.mkdirSync(autostartDir, { recursive: true }); fs.writeFileSync(desktop, `[Desktop Entry]\nType=Application\nName=NotLogi\nIcon=${iconName()}\nExec=${launchCmd()} --hidden\nStartupWMClass=${WM_CLASS}\nX-GNOME-Autostart-enabled=true\n`); } catch (e) {} }
  else { try { fs.unlinkSync(desktop); } catch (e) {} }
}
// the desktop icon's name: notlogi and a hash of the picture (see ensureDesktopEntry)
function iconName() {
  try { return 'notlogi-' + require('crypto').createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'assets', 'icon.png'))).digest('hex').slice(0, 8); } catch (e) { return 'notlogi'; }
}
function ensureDesktopEntry() {
  if (!plat.IS_LINUX) return;          // the installer made the shortcuts
  if (PACKAGED && !APPIMAGE) return;   // the .deb installs its own entry
  if (debInstalled()) return;          // the .deb is installed beside this: its entry serves (cleanupLeftovers drops ours)
  try {
    const iconDir = path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const appDir = path.join(os.homedir(), '.local', 'share', 'applications');
    fs.mkdirSync(iconDir, { recursive: true }); fs.mkdirSync(appDir, { recursive: true });
    // the desktop keeps an icon it has shown by its name until the next login: the name carries a
    // hash of the picture, so a new logo shows in the dock at once; older copies are removed
    const iconSrc = path.join(ROOT, 'assets', 'icon.png');
    const icon = iconName();
    const iconDst = path.join(iconDir, icon + '.png');
    if (!fs.existsSync(iconDst)) fs.copyFileSync(iconSrc, iconDst);
    for (const f of fs.readdirSync(iconDir)) if ((f === 'logimx.png' || /^notlogi(-[0-9a-f]{8})?\.png$/.test(f)) && f !== icon + '.png') { try { fs.unlinkSync(path.join(iconDir, f)); } catch (e) {} }
    const entry = `[Desktop Entry]\nType=Application\nName=NotLogi\nComment=Unofficial mouse & keyboard tools for Linux\nExec=${launchCmd()}\nIcon=${icon}\nTerminal=false\nCategories=Settings;HardwareSettings;\nKeywords=mouse;keyboard;MX;Bolt;\nStartupWMClass=${WM_CLASS}\nStartupNotify=true\n`;
    const dst = path.join(appDir, 'logimx.desktop');
    let cur = ''; try { cur = fs.readFileSync(dst, 'utf8'); } catch (e) {}
    if (cur !== entry) { fs.writeFileSync(dst, entry); execFile('update-desktop-database', [appDir], () => {}); execFile('gtk-update-icon-cache', ['-f', '-t', path.join(os.homedir(), '.local', 'share', 'icons', 'hicolor')], () => {}); }
  } catch (e) {}
}

exports.provide = { LEGACY_NAMES, cleanupLegacyAutostart, cleanupLeftovers, ensureAutostart, stableAgentBin, unitPointsAtMissingBinary, removeAgentUnit, setAutostart, ensureDesktopEntry };
