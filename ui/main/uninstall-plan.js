// What removing NotLogi takes away, as a list, before anything is touched: the same list drives the
// Remove NotLogi dialog, the removal itself and the cleaner that runs at start. No Electron here, so
// it can be tested on its own (test/uninstall.test.mjs).
//
// An install is one of: 'deb' (the package), 'appimage', 'source' (a checkout), 'win' (the setup),
// 'mac' (the bundle). Settings go only when asked: a later install then finds them again.
const path = require('path');

// how this very process was installed
function installKind({ platform, packaged, appimage, appPath }) {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  if (appimage) return 'appimage';
  if (packaged && String(appPath || '').startsWith('/opt/')) return 'deb';
  return packaged ? 'deb' : 'source';
}

// Names older versions used for their files: an enabled unit of theirs quietly fails at login
const LEGACY_NAMES = ['openoptions'];

// icons the app put in the user's icon theme (see autostart.js ensureDesktopEntry)
const isOurIcon = f => /^(logimx|notlogi(-[0-9a-f]{8})?)\.png$/.test(f) || /logimx/i.test(f);

// The plan: steps in the order they run, each with the files it removes (only ones that exist, so
// the dialog says what is really there). `exists(p)` and `list(dir)` are the file system.
//   home     the user's home folder
//   userData the window's settings folder (Electron's userData)
//   socket   the agent's socket (Linux, macOS)
//   settings true to remove settings, profiles and backups as well
function plan(o) {
  const { kind, home, exists, settings } = o;
  const list = o.list || (() => []);
  const have = ps => ps.filter(p => { try { return exists(p); } catch (e) { return false; } });
  const steps = [];
  const step = (id, files, extra) => steps.push(Object.assign({ id, files: have(files) }, extra || {}));
  if (kind === 'win') {
    step('agent', []);
    step('login', []);
    if (settings) step('settings', [o.userData, path.join(o.localAppData || path.join(home, 'AppData', 'Local'), 'LogiMX')]);
    step('app', have([o.uninstaller].filter(Boolean)));
    return steps;
  }
  if (kind === 'mac') {
    step('agent', [o.socket].filter(Boolean));
    step('login', []);
    step('permissions', []);
    if (settings) step('settings', [o.userData, path.join(home, 'Library', 'Caches', 'io.github.aabdelghani.logimx'), path.join(home, 'Library', 'Preferences', 'io.github.aabdelghani.logimx.plist'), path.join(home, 'Library', 'Saved Application State', 'io.github.aabdelghani.logimx.savedState'), path.join(home, 'Library', 'Logs', 'NotLogi')]);
    step('app', have([o.bundle].filter(Boolean)));
    return steps;
  }
  // Linux
  const cfg = path.join(home, '.config'), share = path.join(home, '.local', 'share');
  const units = ['logimx', ...LEGACY_NAMES].map(n => path.join(cfg, 'systemd', 'user', n + '.service'));
  step('agent', [...units, path.join(home, '.local', 'bin', 'logimx-agent'), path.join(home, '.local', 'bin', 'logimxctl'), o.socket].filter(Boolean));
  step('autostart', ['logimx', ...LEGACY_NAMES].map(n => path.join(cfg, 'autostart', n + '.desktop')));
  const iconRoot = path.join(share, 'icons', 'hicolor');
  const icons = [];
  for (const size of list(iconRoot)) for (const f of list(path.join(iconRoot, size, 'apps'))) if (isOurIcon(f)) icons.push(path.join(iconRoot, size, 'apps', f));
  step('launcher', [path.join(share, 'applications', 'logimx.desktop'), ...icons]);
  if (settings) step('settings', [path.join(cfg, 'logimx'), path.join(home, '.local', 'state', 'logimx'), o.userData, path.join(home, '.cache', 'LogiMX')]);
  // the program itself, and what the package or the Install rule button put outside home (root)
  const system = have(['/etc/udev/rules.d/60-logimx.rules', '/usr/local/bin/logimx-agent', '/usr/local/bin/logimxctl', '/usr/local/lib/systemd/user/logimx.service']);
  if (kind === 'deb') step('package', system, { root: true });
  else {
    if (kind === 'appimage') step('appimage', [o.appimage]);
    if (system.length) step('udev', system, { root: true });
  }
  return steps;
}

// the shell script the package step runs as root: purge the package, then the files from before it
function rootScript(steps) {
  const files = steps.filter(s => s.root).flatMap(s => s.files);
  const lines = [];
  if (steps.some(s => s.id === 'package')) lines.push('if command -v apt-get >/dev/null 2>&1; then apt-get purge -y logimx || dpkg -P logimx; else dpkg -P logimx; fi');
  if (files.length) lines.push('rm -f ' + files.map(f => `'${f.replace(/'/g, "'\\''")}'`).join(' '));
  lines.push('command -v udevadm >/dev/null 2>&1 && udevadm control --reload || true');
  lines.push('command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true');
  return lines.join('\n');
}

module.exports = { installKind, plan, rootScript, LEGACY_NAMES, isOurIcon };
