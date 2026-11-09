// The Model's other half: the connection to the agent (JSON-RPC over its socket), the devices and
// settings it reports, its events passed on to the windows; and starting or building the agent.
const net = require('net');
const { Notification, ipcMain } = require('electron');
const path = require('path');
const plat = require('../platform');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const state = require('./state');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder
const t = (s, v) => (state.I18n ? state.I18n.t(s, v) : s);

// from the other parts of the main process, filled in by link()
let PACKAGED, SOCKET, alerted, checkBattery, moveRing, notify, releaseRing, replaceAgentIfOlder, resPath, run, showEmoji, showOsd, showRing, updateTray;
exports.link = ctx => { ({ PACKAGED, SOCKET, alerted, checkBattery, moveRing, notify, releaseRing, replaceAgentIfOlder, resPath, run, showEmoji, showOsd, showRing, updateTray } = ctx); };

let sock = null;
let buffer = '';
let nextId = 1;
const pending = new Map();
                 // last known device summaries
                 // agent general settings (notifications, overlays)

function send(obj) {
  if (!sock || !state.connected) return false;
  sock.write(JSON.stringify(obj) + '\n');
  return true;
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!state.connected) return reject(new Error(t('agent not connected')));
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ id, method, params: params || {} });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(t('timeout'))); }
    }, 8000);
  });
}

async function refreshDevices() {
  try {
    const st = await rpc('status');
    state.general = st.general || {};
    state.paused = !!st.paused;
    state.currentApp = st.app || state.currentApp;
    // an agent of the version this app replaced (started by the older app, or left by an install
    // that could not stop it) makes way for this app's own
    if (st.version) replaceAgentIfOlder(st.version).catch(() => {});
    state.devices = await rpc('devices');
    state.devices.forEach(checkBattery);
  } catch (e) { state.devices = []; }
  updateTray();
}
async function refreshGeneral() { try { const st = await rpc('status'); state.general = st.general || {}; state.paused = !!st.paused; } catch (e) {} }

function mergeDevice(summary) {
  const i = state.devices.findIndex(d => d.id === summary.id);
  if (i >= 0) state.devices[i] = summary; else state.devices.push(summary);
  checkBattery(summary);
  updateTray();
}

// ------------------------------------------------------------------- socket
let autoRestarts = 0;
let restartAgent = null;      // set once the app is ready (see startAgent below)
// smooth scrolling plays one step a frame of the main display: the agent is told its refresh rate
function tellDisplay() {
  const { screen } = require('electron');
  try { rpc('set_display', { hz: screen.getPrimaryDisplay().displayFrequency || 60 }).catch(() => {}); } catch (e) {}
}
let displayWatched = false;
function connect() {
  if (!displayWatched) { displayWatched = true; const { screen } = require('electron'); for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(ev, () => { if (state.connected) tellDisplay(); }); }
  if (sock) return;
  sock = net.createConnection(SOCKET);
  sock.setEncoding('utf8');
  sock.on('connect', () => {
    state.connected = true;
    autoRestarts = 0;
    notify('agent-status', { connected: true });
    refreshDevices();
    tellDisplay();
  });
  sock.on('data', chunk => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.event) {
        handleEvent(msg.event, msg.data);
        if (msg.event !== 'ring_move') notify('agent-event', msg);   // the ring's movement stream is for the overlay only
        continue;
      }
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
      }
    }
  });
  const drop = () => {
    state.connected = false;
    sock = null;
    buffer = '';
    for (const [, p] of pending) p.reject(new Error(t('agent disconnected')));
    pending.clear();
    state.devices = [];
    updateTray();
    notify('agent-status', { connected: false });
    setTimeout(connect, 1500);
    // the agent went away while we were running: bring it back, but do not fight a crash loop
    if (restartAgent && autoRestarts < 3) { autoRestarts++; setTimeout(() => { if (!state.connected && restartAgent) restartAgent().catch(() => {}); }, 3000); }
  };
  sock.on('error', drop);
  sock.on('close', drop);
}

function handleEvent(event, data) {
  if (event === 'device' || event === 'device_added') {
    const isNew = event === 'device_added' && !state.devices.some(d => d.id === data.id);
    mergeDevice(data);
    if (isNew && state.general.notify_connect && Notification.isSupported()) new Notification({ title: t('{name} connected', { name: data.name }), body: state.Battery.known(data.battery) ? t('Battery {pct}%', { pct: data.battery.percent }) : '', icon: path.join(ROOT, 'assets', 'icon.png') }).show();
  }
  else if (event === 'device_removed') {
    const d = state.devices.find(x => x.id === data.id);
    state.devices = state.devices.filter(x => x.id !== data.id); alerted.delete(data.id); updateTray();
    if (d && state.general.notify_connect && Notification.isSupported()) new Notification({ title: t('{name} disconnected', { name: d.name }), icon: path.join(ROOT, 'assets', 'icon.png') }).show();
  }
  else if (event === 'action') { if (data.kind === 'emoji') showEmoji(t('{device} · Emoji key', { device: data.device || t('Keyboard') })); else if (data.kind === 'ring') showRing(data.id, !!data.raw); else if (data.kind === 'ring_release') releaseRing(); else showOsd(data); }
  else if (event === 'ring_move') moveRing(data.dx, data.dy);
  else if (event === 'app') state.currentApp = data.app || '';
  else if (event === 'paused') { state.paused = !!data.paused; updateTray(); }
  else if (event === 'battery') {
    const d = state.devices.find(x => x.id === data.id);
    if (d) { d.battery = data.battery; checkBattery(d); updateTray(); }
  } else if (event === 'profile') {
    const d = state.devices.find(x => x.id === data.id);
    if (d) { d.profile = data.profile; updateTray(); }
  }
}
ipcMain.handle('general-changed', async () => { await refreshGeneral(); updateTray(); });

ipcMain.handle('rpc', (_e, method, params) => rpc(method, params));
ipcMain.handle('agent-connected', () => state.connected);
ipcMain.handle('stop-tool', async (_e, name) => {
  if (!plat.IS_LINUX) return plat.stopTool(name);
  if (name === 'solaar') return run('pkill', ['-x', 'solaar']).then(r => ({ ok: true }));
  if (name === 'logid') { const r = await run('pkexec', ['systemctl', 'stop', 'logid']); return r.ok ? { ok: true } : { ok: false, error: r.error || t('cancelled') }; }
  return { ok: false, error: t('unknown tool') };
});
ipcMain.handle('install-udev', async () => {
  if (!plat.IS_LINUX) return { ok: false, error: t('not needed on this system') };
  const rule = resPath('udev', '60-logimx.rules');
  if (!fs.existsSync(rule)) return { ok: false, error: t('rule file missing') };
  const script = `cp '${rule}' /etc/udev/rules.d/60-logimx.rules && udevadm control --reload && udevadm trigger`;
  const r = await run('pkexec', ['sh', '-c', script]);
  return r.ok ? { ok: true } : { ok: false, error: r.error || t('cancelled') };
});
// The agent is what actually talks to the devices. Start it ourselves so the app works on a
// fresh machine without anyone having to run something in a terminal first.
const AGENT_UNITS = [
  path.join(os.homedir(), '.config', 'systemd', 'user', 'logimx.service'),
  '/usr/lib/systemd/user/logimx.service',
  '/usr/local/lib/systemd/user/logimx.service',
];
function agentCandidates() {
  const c = [];
  if (PACKAGED) c.push(resPath('agent', plat.AGENT_EXE));
  if (!plat.IS_LINUX) {
    // a checkout: single-config builds put the exe in build/, Visual Studio's in build/Release/
    c.push(path.join(ROOT, '..', 'agent', 'build', plat.AGENT_EXE), path.join(ROOT, '..', 'agent', 'build', 'Release', plat.AGENT_EXE));
    return c.filter(p => fs.existsSync(p));
  }
  c.push('/usr/bin/logimx-agent',
         '/usr/local/bin/logimx-agent',
         path.join(os.homedir(), '.local', 'bin', 'logimx-agent'),
         path.join(ROOT, '..', 'agent', 'build', 'logimx-agent'));   // running from a checkout
  return c.filter(p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { return false; } });
}
const agentRunning = plat.agentRunning;

let starting = null;
function startAgent() {
  if (state.connected) return Promise.resolve({ ok: true });
  if (starting) return starting;
  starting = (async () => {
    if (await agentRunning()) return { ok: true, already: true };
    notify('agent-status', { connected: false, starting: true });
    if (plat.IS_LINUX && AGENT_UNITS.some(u => { try { return fs.existsSync(u); } catch (e) { return false; } })) {
      const viaUnit = await new Promise(res =>
        execFile('systemctl', ['--user', 'start', 'logimx'], { timeout: 8000 }, e => res(!e)));
      if (viaUnit) return { ok: true, unit: true };
    }
    const bin = agentCandidates()[0];
    if (!bin) return { ok: false, error: PACKAGED ? t('agent binary missing from this install') : t('agent is not built yet') };
    try {
      // detached on purpose: the agent is a daemon and keeps the devices configured
      // after this window is closed
      plat.spawnAgent(bin);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    for (let i = 0; i < 24 && !state.connected; i++) await new Promise(r => setTimeout(r, 250));
    return state.connected || (await agentRunning()) ? { ok: true } : { ok: false, error: t('the agent exited on startup') };
  })();
  starting.finally(() => { starting = null; });
  return starting;
}
restartAgent = startAgent;
ipcMain.handle('start-agent', () => startAgent());

// Building from a source checkout, so the app can compile the agent instead of telling
// someone to open a terminal.
const sourceRoot = () => path.join(ROOT, '..');
function canBuildAgent() {
  if (PACKAGED || !plat.IS_LINUX) return false;
  try { fs.accessSync(path.join(sourceRoot(), 'agent', 'CMakeLists.txt'), fs.constants.R_OK); return true; }
  catch (e) { return false; }
}
ipcMain.handle('agent-info', () => ({
  binary: agentCandidates()[0] || null,
  canBuild: canBuildAgent(),
  unit: AGENT_UNITS.some(u => { try { return fs.existsSync(u); } catch (e) { return false; } }),
}));

const haveCmd = c => new Promise(r => execFile('sh', ['-c', 'command -v ' + c], e => r(!e)));
function buildProblem(out) {
  const line = String(out).split('\n').find(l => /Could NOT find|No such file or directory|error:|fatal error/i.test(l));
  return line ? line.trim().slice(0, 160) : '';
}
let building = null;
function buildAgent() {
  if (building) return building;
  building = (async () => {
    if (!canBuildAgent()) return { ok: false, error: t('no source checkout to build from') };
    for (const [cmd, hint] of [['cmake', 'cmake'], ['c++', 'g++']]) {
      if (!(await haveCmd(cmd))) return { ok: false, error: t('{cmd} is not installed (sudo apt install cmake ninja-build g++ libx11-dev)', { cmd: hint }) };
    }
    const root = sourceRoot(), src = path.join(root, 'agent'), out = path.join(root, 'agent', 'build');
    const run = (cmd, args) => new Promise(res => execFile(cmd, args, { cwd: root, timeout: 420000, maxBuffer: 8 << 20 },
      (err, so, se) => res({ ok: !err, out: String(so || '') + String(se || '') })));
    const gen = (await haveCmd('ninja')) ? ['-G', 'Ninja'] : [];
    notify('agent-build', { step: t('Configuring the build…') });
    let r = await run('cmake', ['-B', out, '-S', src, ...gen, '-DCMAKE_BUILD_TYPE=Release']);
    if (!r.ok) return { ok: false, error: buildProblem(r.out) || t('cmake could not configure the build') };
    notify('agent-build', { step: t('Compiling the agent…') });
    r = await run('cmake', ['--build', out, '-j', String(Math.max(2, os.cpus().length))]);
    if (!r.ok) return { ok: false, error: buildProblem(r.out) || t('the build failed') };
    return { ok: true };
  })();
  building.finally(() => { building = null; });
  return building;
}
ipcMain.handle('build-agent', async () => {
  const b = await buildAgent();
  if (!b.ok) return b;
  notify('agent-build', { step: t('Starting the agent…') });
  return startAgent();
});

exports.provide = { pending, send, rpc, refreshDevices, refreshGeneral, mergeDevice, connect, handleEvent, AGENT_UNITS, agentCandidates, agentRunning, startAgent, sourceRoot, canBuildAgent, haveCmd, buildProblem, buildAgent };
