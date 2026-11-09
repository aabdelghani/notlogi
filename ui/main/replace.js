// A newer NotLogi replaces an older one by itself, on every system, without being asked: the older
// copy still running is ended and this one starts in its place, an agent of the older version makes
// way for this one's, and on macOS an older copy left in Applications goes to the Trash. Which
// processes and versions that means is decided in replace-plan.js.
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const plat = require('../platform');
const { older, plistVersion, parsePs, staleInstances, bundleProcesses } = require('./replace-plan');

// from the other parts of the main process, filled in by link()
let APPIMAGE, agentCandidates, rpc, startAgent;
exports.link = ctx => { ({ APPIMAGE, agentCandidates, rpc, startAgent } = ctx); };

const wait = ms => new Promise(r => setTimeout(r, ms));
const run = (cmd, args) => new Promise(resolve => execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, out) => resolve({ ok: !err, out: String(out || '') })));

// what this copy says about itself while it runs, for the next copy to find
const RUNNING = () => path.join(app.getPath('userData'), 'running.json');
function noteRunning() {
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(RUNNING(), JSON.stringify({ pid: process.pid, version: app.getVersion(), exe: process.execPath })); } catch (e) {}
}
function forgetRunning() {
  try { if (JSON.parse(fs.readFileSync(RUNNING(), 'utf8')).pid === process.pid) fs.unlinkSync(RUNNING()); } catch (e) {}
}
function readRunning() {
  try { return JSON.parse(fs.readFileSync(RUNNING(), 'utf8')); } catch (e) { return null; }
}

// every process: pid, parent, command (the executable's path on macOS and Windows, its name on Linux)
async function processes() {
  if (plat.IS_WIN) {
    const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.ExecutablePath)" }']);
    return parsePs(r.out);
  }
  const r = await run('ps', ['-eo', 'pid=,ppid=,comm=']);
  return parsePs(r.out);
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// asked to end, then told, then made to
async function end(pids) {
  if (!pids.length) return;
  if (plat.IS_WIN) { for (const pid of pids) await run('taskkill', ['/PID', String(pid), '/T', '/F']); }
  else for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch (e) {} }
  for (let i = 0; i < 20 && pids.some(alive); i++) await wait(250);
  if (!plat.IS_WIN) for (const pid of pids.filter(alive)) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} }
  for (let i = 0; i < 8 && pids.some(alive); i++) await wait(250);
}

// This copy could not take the single-instance lock: another one runs. An older one is ended and
// this copy starts itself again (the lock is free then); true when that happened. The other copy
// stays when it is as new as this one or newer, and the caller quits as before.
let tookOver = false;
async function takeOver() {
  if (tookOver) return true;
  const pids = staleInstances({ procs: await processes(), ownPid: process.pid, running: readRunning(), version: app.getVersion() });
  if (!pids.length) return false;
  tookOver = true;
  await end(pids);
  // not app.relaunch (see main.js): a plain child process, left on its own
  const exe = APPIMAGE || process.execPath;
  spawn(exe, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  app.exit(0);
  return true;
}

// The agent that answered is of an older version than this app: it is asked to stop, then told,
// and this app's own is started. Once per run; nothing when this install has no agent to start.
let agentReplaced = false;
async function replaceAgentIfOlder(agentVersion) {
  if (agentReplaced || !older(agentVersion, app.getVersion()) || !agentCandidates()[0]) return false;
  agentReplaced = true;
  try { await Promise.race([rpc('shutdown', {}), wait(1500)]); } catch (e) {}
  if (plat.IS_WIN) await run('taskkill', ['/IM', plat.AGENT_EXE, '/F']);
  else await run('pkill', ['-x', 'logimx-agent']);
  for (let i = 0; i < 20 && await plat.agentRunning(); i++) await wait(250);
  if (!plat.IS_WIN && await plat.agentRunning()) await run('pkill', ['-9', '-x', 'logimx-agent']);
  await wait(300);
  return startAgent();
}

// macOS: another NotLogi (or LogiMX, the old name) in Applications that is not this bundle and not
// newer than it is ended and moved to the Trash; the login item points at this bundle already
// (ensureAutostart). Someone who dragged the new version next to the old one, or into their own
// Applications folder, ends up with one.
const bundleOf = exe => { const m = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(exe); return m ? m[1] : null; };
async function trashOlderBundles() {
  if (!plat.IS_MAC || !app.isPackaged) return [];
  const ours = bundleOf(process.execPath);
  if (!ours) return [];
  const real = p => { try { return fs.realpathSync(p); } catch (e) { return p; } };
  const dirs = ['/Applications', path.join(os.homedir(), 'Applications')];
  const gone = [];
  let procs = null;
  for (const d of dirs) for (const name of ['NotLogi.app', 'LogiMX.app']) {
    const b = path.join(d, name);
    if (!fs.existsSync(b) || real(b) === real(ours)) continue;
    let v = null; try { v = plistVersion(fs.readFileSync(path.join(b, 'Contents', 'Info.plist'), 'utf8')); } catch (e) {}
    if (v && older(app.getVersion(), v)) continue;   // newer than this one: it stays
    procs = procs || await processes();
    await end(bundleProcesses(procs, b).filter(pid => pid !== process.pid));
    try { await shell.trashItem(b); gone.push(b); } catch (e) {}
  }
  return gone;
}

exports.provide = { noteRunning, forgetRunning, takeOver, replaceAgentIfOlder, trashOlderBundles };
