// The pointer's exact position, asked of the compositor. Electron under XWayland
// inherits X's view of the pointer, which KDE stops refreshing as soon as no X11
// surface has it (a stale-looking but valid point), and Electron under native
// Wayland cannot read it at all. JuhRadial MX solved this by asking the
// compositor itself: a one-shot KWin script reads workspace.cursorPos and calls
// the result back over D-Bus (their daemon/src/compositor.rs and cursor.rs);
// Hyprland answers over its IPC socket. This module brings that to the main
// process, in the compositor's logical pixels plus the logical monitor layout,
// which shared/cursor-map.mjs maps into Electron's screen space.

const { writeFile, unlink, mkdtemp } = require('fs/promises');
const { tmpdir } = require('os');
const path = require('path');

const BUS_NAME = 'org.logimx.ui';           // what the KWin script calls back into
const OBJ_PATH = '/org/logimx/ui';
const KWIN = 'org.kde.KWin';

// KWin reports workspace.cursorPos in logical pixels (JuhRadial passes it
// through unchanged; a devicePixelRatio correction overshot in both directions
// on fractional scales). The monitor layout rides along in the same call so
// cursor and screens are one atomic snapshot.
const KWIN_SCRIPT = `
var pos = workspace.cursorPos;
var mons = [];
try {
  var screens = workspace.screens;
  for (var i = 0; i < screens.length; i++) {
    var s = screens[i], g = s.geometry;
    mons.push({ name: s.name, x: g.x, y: g.y, w: g.width, h: g.height });
  }
} catch (e) {}
callDBus('${BUS_NAME}', '${OBJ_PATH}', '${BUS_NAME}', 'CursorPos',
         Math.round(pos.x), Math.round(pos.y), JSON.stringify(mons));
`;

let bus = null, busReady = null, seq = 0, waiters = [];
const debug = (...a) => { if (process.env.LOGIMX_CURSOR_DEBUG) console.error('[cursor]', ...a); };

// the session bus with our name owned and the CursorPos callback listened for,
// made once and kept for the life of the process. Low-level messages only:
// dbus-next's high-level interfaces need decorator transpilation.
async function sessionBus(dbus) {
  if (bus) return bus;
  if (!busReady) {
    busReady = (async () => {
      const b = dbus.sessionBus();
      b.on('message', msg => {
        debug('msg', msg.type, msg.path, msg.member);
        if (msg.type !== dbus.MessageType.METHOD_CALL) return;
        if (msg.path !== OBJ_PATH || msg.member !== 'CursorPos' || !Array.isArray(msg.body)) return;
        let mons = [];
        try { mons = JSON.parse(msg.body[2]) || []; } catch (e) {}
        const hit = { x: msg.body[0], y: msg.body[1], monitors: Array.isArray(mons) ? mons : [] };
        waiters.splice(0).forEach(fn => { try { fn(hit); } catch (e) {} });
        try {
          b.send(new dbus.Message({
            type: dbus.MessageType.METHOD_RETURN, replySerial: msg.serial,
            destination: msg.sender, signature: '',
          }));
        } catch (e) { debug('reply failed', e.message); }
      });
      await b.requestName(BUS_NAME);
      return b;
    })().catch(e => { busReady = null; throw e; });
  }
  return busReady;
}

async function kwinCursor(dbus, timeoutMs) {
  const b = await sessionBus(dbus);
  const plugin = `logimx-cursor-${process.pid}-${seq++}`;
  const dir = await mkdtemp(path.join(tmpdir(), 'logimx-cursor-'));
  const file = path.join(dir, 'cursor.js');
  await writeFile(file, KWIN_SCRIPT);
  // raw messages, not proxy interfaces: KWin overloads loadScript (1- and
  // 2-argument) and the auto-generated proxy keeps only one of them
  const call = (mPath, iface, member, signature, body) => b.call(new dbus.Message({
    destination: KWIN, path: mPath, interface: iface, member, signature, body,
  }));
  try {
    const id = (await call('/Scripting', 'org.kde.kwin.Scripting', 'loadScript', 'ss', [file, plugin])).body[0];
    debug('loadScript id', id);
    if (typeof id !== 'number' || id < 0) return null;
    const got = new Promise(resolve => {
      waiters.push(resolve);
      setTimeout(() => {
        const i = waiters.indexOf(resolve);
        if (i >= 0) { waiters.splice(i, 1); resolve(null); }
      }, timeoutMs);
    });
    // a failed run() may still have dispatched the callback (JuhRadial's
    // Unconfirmed rule): only the timeout decides
    try { await call(`/Scripting/Script${id}`, 'org.kde.kwin.Script', 'run', '', []); } catch (e) { debug('run error', e.message); }
    const hit = await got;
    debug('callback', hit ? `(${hit.x},${hit.y}) mons=${hit.monitors.length}` : 'timeout');
    try { await call('/Scripting', 'org.kde.kwin.Scripting', 'unloadScript', 's', [plugin]); } catch (e) {}
    return hit;
  } finally {
    unlink(file, () => {});
    require('fs').rmdir(dir, () => {});
  }
}

// Hyprland: the IPC socket answers "x, y" in compositor-logical pixels
function hyprlandCursor(net, timeoutMs) {
  return new Promise(resolve => {
    const sig = process.env.HYPRLAND_INSTANCE_SIGNATURE;
    const runtime = process.env.XDG_RUNTIME_DIR;
    if (!sig || !runtime) return resolve(null);
    const sock = net.connect(path.join(runtime, 'hypr', sig, '.socket.sock'));
    const done = r => { sock.destroy(); resolve(r); };
    const timer = setTimeout(() => done(null), timeoutMs);
    sock.on('error', () => { clearTimeout(timer); done(null); });
    sock.on('connect', () => sock.write('cursorpos'));
    let buf = '';
    sock.on('data', d => {
      buf += d.toString();
      const m = buf.match(/(-?\d+)\s*,\s*(-?\d+)/);
      if (!m) return;
      clearTimeout(timer);
      done({ x: parseInt(m[1], 10), y: parseInt(m[2], 10), monitors: [] });
    });
  });
}

// whether the compositor is KWin at all: the bus name, not the desktop
// environment string, which a systemd cold start has not set (JuhRadial #32)
async function ownsKWin(dbus) {
  const b = await sessionBus(dbus);
  try {
    const dbusDaemon = await b.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
      .then(o => o.getInterface('org.freedesktop.DBus'));
    return !!(await dbusDaemon.NameHasOwner(KWIN));
  } catch (e) { return false; }
}

// the cursor as the compositor sees it ({x, y} in logical pixels plus the
// logical monitor layout when the compositor volunteered it), or null when the
// session is X11 or no compositor answered in time
async function queryCursorPos(timeoutMs = 250) {
  if (process.platform !== 'linux') return null;
  if ((process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'x11') return null;   // X11 itself knows the pointer
  try {
    const dbus = require('dbus-next');
    if (await ownsKWin(dbus)) return await kwinCursor(dbus, timeoutMs);
  } catch (e) { /* dbus-next missing or no bus: fall through */ }
  try {
    if (process.env.HYPRLAND_INSTANCE_SIGNATURE) {
      return await hyprlandCursor(require('net'), timeoutMs);
    }
  } catch (e) { /* ignore */ }
  return null;
}

exports.queryCursorPos = queryCursorPos;
