// Removing NotLogi from the computer, from the About page: the plan (uninstall-plan.js) is shown
// first, then carried out, and the app ends. Settings go only when asked.
const { app, ipcMain, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const plat = require('../platform');
const { installKind, plan, rootScript } = require('./uninstall-plan');

// from the other parts of the main process, filled in by link()
let APPIMAGE, PACKAGED, SOCKET, rpc;
exports.link = ctx => { ({ APPIMAGE, PACKAGED, SOCKET, rpc } = ctx); };

const run = (cmd, args) => new Promise(resolve => execFile(cmd, args, { timeout: 120000, windowsHide: true }, (err, out, serr) => resolve({ ok: !err, out: String(out || ''), error: String(serr || (err && err.message) || '').trim() })));
const exists = p => { try { fs.accessSync(p); return true; } catch (e) { return false; } };
const list = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const kind = () => installKind({ platform: process.platform, packaged: PACKAGED, appimage: APPIMAGE, appPath: app.getAppPath() });
const bundle = () => { const m = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(process.execPath); return m ? m[1] : null; };

function makePlan(settings) {
  return plan({
    kind: kind(), home: os.homedir(), exists, list, settings: !!settings,
    userData: app.getPath('userData'), socket: plat.IS_WIN ? null : SOCKET, appimage: APPIMAGE || null,
    bundle: bundle(), uninstaller: plat.IS_WIN ? path.join(path.dirname(process.execPath), 'Uninstall NotLogi.exe') : null,
    localAppData: process.env.LOCALAPPDATA,
  });
}

const rmrf = p => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} };

// The agent first, asked nicely, then told: it keeps the devices configured after the window
// closes, and would hold the socket and, on Windows, its own file.
async function stopAgent() {
  // (on Linux the unit is stopped before it is disabled: one with Restart= would start the agent
  // again after a plain kill)
  if (plat.IS_LINUX) { await run('systemctl', ['--user', 'stop', 'logimx.service']); await run('systemctl', ['--user', 'disable', 'logimx.service']); }
  try { await Promise.race([rpc('shutdown', {}), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
  if (plat.IS_WIN) await run('taskkill', ['/im', 'logimx-agent.exe', '/f']);
  else { await run('pkill', ['-x', 'logimx-agent']); await new Promise(r => setTimeout(r, 800)); await run('pkill', ['-9', '-x', 'logimx-agent']); }
}

// Carry the plan out. Resolves with what still needs the person (a password refused, say); the app
// ends on success. The program itself goes last, so this code is still here while the rest runs.
async function remove(settings) {
  const steps = makePlan(settings);
  const problems = [];
  await stopAgent();
  for (const s of steps) {
    if (s.id === 'login') plat.setLoginItem(false);
    if (s.id === 'permissions') { for (const svc of ['Accessibility', 'ListenEvent']) await run('tccutil', ['reset', svc, 'io.github.aabdelghani.logimx']); }
    if (s.root || s.id === 'app' || s.id === 'appimage') continue;   // below, in order
    for (const f of s.files) rmrf(f);
    if (s.id === 'agent' && plat.IS_LINUX) await run('systemctl', ['--user', 'daemon-reload']);
    if (s.id === 'launcher' && plat.IS_LINUX) { const share = path.join(os.homedir(), '.local', 'share'); await run('update-desktop-database', [path.join(share, 'applications')]); await run('gtk-update-icon-cache', ['-q', '-f', '-t', path.join(share, 'icons', 'hicolor')]); }
  }
  const root = steps.filter(s => s.root);
  if (root.length) {
    const r = await run('pkexec', ['sh', '-c', rootScript(steps)]);
    if (!r.ok) problems.push(root.some(s => s.id === 'package') ? 'package' : 'udev');
  }
  const appStep = steps.find(s => s.id === 'app' || s.id === 'appimage');
  if (appStep && appStep.id === 'appimage') for (const f of appStep.files) rmrf(f);
  else if (appStep && plat.IS_MAC && appStep.files[0]) { try { await shell.trashItem(appStep.files[0]); } catch (e) { problems.push('app'); } }
  else if (appStep && plat.IS_WIN && appStep.files[0]) { try { spawn(appStep.files[0], [], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { problems.push('app'); } }
  if (problems.length) return { ok: false, problems };
  app.isQuitting = true;
  setTimeout(() => app.exit(0), 300);
  return { ok: true };
}

ipcMain.handle('uninstall-plan', (_e, settings) => ({ kind: kind(), steps: makePlan(settings).map(s => ({ id: s.id, root: !!s.root, n: s.files.length })) }));
ipcMain.handle('uninstall', (_e, settings) => remove(!!settings));

exports.provide = { uninstallPlan: makePlan, uninstall: remove };
