// Removing NotLogi: the plan names only what is there, keeps settings unless asked, and knows what
// each kind of install has to take away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const { installKind, plan, rootScript } = createRequire(import.meta.url)('../main/uninstall-plan.js');

const home = '/home/u';
const fsOf = files => ({ exists: p => files.has(p), list: d => [...files].filter(f => f.startsWith(d + '/')).map(f => f.slice(d.length + 1).split('/')[0]).filter((v, i, a) => a.indexOf(v) === i) });
const ids = steps => steps.map(s => s.id);
const files = steps => steps.flatMap(s => s.files);

test('install kind', () => {
  assert.equal(installKind({ platform: 'linux', packaged: true, appPath: '/opt/logimx/resources/app.asar' }), 'deb');
  assert.equal(installKind({ platform: 'linux', packaged: true, appimage: '/home/u/NotLogi.AppImage', appPath: '/tmp/.mount_x/resources/app.asar' }), 'appimage');
  assert.equal(installKind({ platform: 'linux', packaged: false, appPath: '/home/u/src/ui' }), 'source');
  assert.equal(installKind({ platform: 'win32', packaged: true }), 'win');
  assert.equal(installKind({ platform: 'darwin', packaged: true }), 'mac');
});

test('a .deb: user files, then the package as root; settings stay unless asked', () => {
  const have = new Set([`${home}/.config/systemd/user/logimx.service`, `${home}/.config/autostart/logimx.desktop`, `${home}/.local/share/applications/logimx.desktop`,
    `${home}/.local/share/icons/hicolor/256x256/apps/notlogi-1a2b3c4d.png`, `${home}/.local/share/icons/hicolor/48x48/apps/other.png`, `${home}/.config/logimx`, `${home}/.config/LogiMX`, '/etc/udev/rules.d/60-logimx.rules', '/run/user/1000/logimx.sock']);
  const o = { kind: 'deb', home, ...fsOf(have), userData: `${home}/.config/LogiMX`, socket: '/run/user/1000/logimx.sock' };
  const p = plan(o);
  assert.deepEqual(ids(p), ['agent', 'autostart', 'launcher', 'package']);
  assert.ok(files(p).includes(`${home}/.local/share/icons/hicolor/256x256/apps/notlogi-1a2b3c4d.png`), 'our icon goes');
  assert.ok(!files(p).includes(`${home}/.local/share/icons/hicolor/48x48/apps/other.png`), 'other icons stay');
  assert.ok(!files(p).includes(`${home}/.config/LogiMX`), 'settings kept');
  const pkg = p.find(s => s.id === 'package');
  assert.equal(pkg.root, true);
  assert.deepEqual(pkg.files, ['/etc/udev/rules.d/60-logimx.rules']);
  const all = plan({ ...o, settings: true });
  assert.deepEqual(ids(all), ['agent', 'autostart', 'launcher', 'settings', 'package']);
  assert.deepEqual(all.find(s => s.id === 'settings').files, [`${home}/.config/logimx`, `${home}/.config/LogiMX`]);
  const sh = rootScript(all);
  assert.match(sh, /apt-get purge -y logimx \|\| dpkg -P logimx/);
  assert.match(sh, /rm -f '\/etc\/udev\/rules.d\/60-logimx.rules'/);
});

test('an AppImage removes its own file, and asks for root only when something is outside home', () => {
  const have = new Set([`${home}/Apps/NotLogi.AppImage`, `${home}/.config/autostart/logimx.desktop`]);
  const o = { kind: 'appimage', home, ...fsOf(have), userData: `${home}/.config/LogiMX`, appimage: `${home}/Apps/NotLogi.AppImage` };
  let p = plan(o);
  assert.deepEqual(ids(p), ['agent', 'autostart', 'launcher', 'appimage']);
  assert.deepEqual(p.find(s => s.id === 'appimage').files, [`${home}/Apps/NotLogi.AppImage`]);
  have.add('/etc/udev/rules.d/60-logimx.rules');
  p = plan(o);
  assert.deepEqual(ids(p), ['agent', 'autostart', 'launcher', 'appimage', 'udev']);
  assert.ok(!rootScript(p).includes('apt-get'), 'no package to purge');
});

test('macOS and Windows: login item, permissions, the bundle or the setup\'s uninstaller', () => {
  const mac = plan({ kind: 'mac', home, ...fsOf(new Set(['/Applications/NotLogi.app', `${home}/Library/Application Support/LogiMX`])), userData: `${home}/Library/Application Support/LogiMX`, bundle: '/Applications/NotLogi.app', settings: true });
  assert.deepEqual(ids(mac), ['agent', 'login', 'permissions', 'settings', 'app']);
  assert.deepEqual(mac.find(s => s.id === 'app').files, ['/Applications/NotLogi.app']);
  const win = plan({ kind: 'win', home: 'C:\\Users\\u', ...fsOf(new Set(['C:\\Program Files\\NotLogi\\Uninstall NotLogi.exe'])), userData: 'C:\\Users\\u\\AppData\\Roaming\\LogiMX', uninstaller: 'C:\\Program Files\\NotLogi\\Uninstall NotLogi.exe' });
  assert.deepEqual(ids(win), ['agent', 'login', 'app']);
  assert.deepEqual(win.find(s => s.id === 'app').files, ['C:\\Program Files\\NotLogi\\Uninstall NotLogi.exe']);
});
