// A newer NotLogi replaces an older one by itself: which processes are the older copy's, whether a
// version is older, what another bundle says it is. No Electron here, so it can be tested on its own
// (test/replace.test.mjs); replace.js does the ending, trashing and starting.
const path = require('path');

// true when version a is older than b ('0.15.3' < '0.15.4'); anything that is not a version is not older
function older(a, b) {
  const num = v => String(v || '').trim().replace(/^v/, '').split('.').map(x => (/^\d+$/.test(x) ? Number(x) : NaN));
  const x = num(a), y = num(b);
  if (!x.length || !y.length || x.some(Number.isNaN) || y.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d < 0;
  }
  return false;
}

// the version a macOS bundle's Info.plist states
function plistVersion(text) {
  const m = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(String(text || ''));
  return m ? m[1].trim() : null;
}

// `ps -eo pid=,ppid=,comm=` (or the same three columns from Windows): [{pid, ppid, comm}]; the command
// may hold spaces (a macOS path), so it is the rest of the line
function parsePs(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/.exec(line);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), comm: m[3] });
  }
  return out;
}

// a process and everything under it
function subtree(procs, pid) {
  const mine = new Set([pid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) if (mine.has(p.ppid) && !mine.has(p.pid)) { mine.add(p.pid); grew = true; }
  }
  return mine;
}

// the app's executable, under any of its names, on any system
const APP_NAMES = new Set(['logimx', 'notlogi']);
const isApp = comm => APP_NAMES.has(path.basename(String(comm).replace(/\\/g, '/')).replace(/\.exe$/i, '').toLowerCase());

// The processes of another copy of the app that this one may end, because it is newer:
//   procs    the system's processes
//   ownPid   this process
//   running  what the running copy wrote about itself ({pid, version}), if anything: copies from
//            0.15.4 on say who they are; an older one says nothing and is known by its name
//   version  this copy's version
// Nothing when the other copy is as new as this one, or newer: that one stays.
function staleInstances({ procs, ownPid, running, version }) {
  const mine = subtree(procs, ownPid);
  const alive = running && Number.isInteger(running.pid) && procs.some(p => p.pid === running.pid) && !mine.has(running.pid);
  if (alive) return older(running.version, version) ? [...subtree(procs, running.pid)] : [];
  return procs.filter(p => isApp(p.comm) && !mine.has(p.pid)).map(p => p.pid);
}

// the processes started from a bundle (macOS lists the executable's full path)
function bundleProcesses(procs, bundle) {
  const prefix = String(bundle).replace(/\/+$/, '') + '/';
  return procs.filter(p => p.comm.startsWith(prefix)).map(p => p.pid);
}

module.exports = { older, plistVersion, parsePs, subtree, isApp, staleInstances, bundleProcesses };
