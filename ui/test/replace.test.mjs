// A newer NotLogi replacing an older one: which processes are the older copy's, which versions are
// older, what a bundle says it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
const { older, plistVersion, parsePs, subtree, isApp, staleInstances, bundleProcesses } = createRequire(import.meta.url)('../main/replace-plan.js');

test('older: numbers, not strings', () => {
  assert.equal(older('0.15.3', '0.15.4'), true);
  assert.equal(older('0.15.4', '0.15.3'), false);
  assert.equal(older('0.15.3', '0.15.3'), false);
  assert.equal(older('0.9.9', '0.15.0'), true);
  assert.equal(older('v0.15.3', '0.16'), true);
  assert.equal(older('0.15', '0.15.0'), false);
  assert.equal(older('', '0.15.4'), false);
  assert.equal(older('not running', '0.15.4'), false);
  assert.equal(older(undefined, '0.15.4'), false);
});

test('the version in a bundle Info.plist', () => {
  assert.equal(plistVersion('<plist><dict>\n\t<key>CFBundleShortVersionString</key>\n\t<string>0.15.3</string>\n</dict></plist>'), '0.15.3');
  assert.equal(plistVersion('<plist><dict><key>CFBundleVersion</key><string>12</string></dict></plist>'), null);
  assert.equal(plistVersion(''), null);
});

const PS = `
    1     0 /sbin/launchd
  400     1 /Applications/NotLogi.app/Contents/MacOS/NotLogi
  401   400 /Applications/NotLogi.app/Contents/Frameworks/NotLogi Helper (GPU).app/Contents/MacOS/NotLogi Helper (GPU)
  402   400 /Applications/NotLogi.app/Contents/Frameworks/NotLogi Helper (Renderer).app/Contents/MacOS/NotLogi Helper (Renderer)
  410     1 /Applications/NotLogi.app/Contents/Resources/agent/logimx-agent
  500     1 /Users/u/Applications/LogiMX.app/Contents/MacOS/LogiMX
  501   500 /Users/u/Applications/LogiMX.app/Contents/Frameworks/LogiMX Helper.app/Contents/MacOS/LogiMX Helper
  900     1 /Volumes/NotLogi 0.15.4/NotLogi.app/Contents/MacOS/NotLogi
  901   900 /Volumes/NotLogi 0.15.4/NotLogi.app/Contents/Frameworks/NotLogi Helper (GPU).app/Contents/MacOS/NotLogi Helper (GPU)
  950     1 /usr/bin/ps
`;

test('ps lines: pid, parent, the command with its spaces', () => {
  const p = parsePs(PS);
  assert.equal(p.length, 10);
  assert.deepEqual(p[1], { pid: 400, ppid: 1, comm: '/Applications/NotLogi.app/Contents/MacOS/NotLogi' });
  assert.equal(p[2].comm, '/Applications/NotLogi.app/Contents/Frameworks/NotLogi Helper (GPU).app/Contents/MacOS/NotLogi Helper (GPU)');
  assert.deepEqual([...subtree(p, 400)].sort(), [400, 401, 402]);
});

test('the app under its names, on every system', () => {
  for (const c of ['logimx', 'notlogi', '/opt/logimx/logimx', '/Applications/NotLogi.app/Contents/MacOS/NotLogi', 'C:\\Users\\u\\AppData\\Local\\Programs\\NotLogi\\NotLogi.exe', 'LogiMX.exe']) assert.ok(isApp(c), c);
  for (const c of ['logimx-agent', 'electron', '/usr/bin/ps', 'NotLogi Helper (GPU)', 'chrome']) assert.ok(!isApp(c), c);
});

test('an older copy that says who it is: that copy and its helpers, nothing else', () => {
  const procs = parsePs(PS);
  const pids = staleInstances({ procs, ownPid: 900, running: { pid: 400, version: '0.15.3' }, version: '0.15.4' });
  assert.deepEqual(pids.sort(), [400, 401, 402]);
});

test('a copy as new as this one, or newer, stays', () => {
  const procs = parsePs(PS);
  assert.deepEqual(staleInstances({ procs, ownPid: 900, running: { pid: 400, version: '0.15.4' }, version: '0.15.4' }), []);
  assert.deepEqual(staleInstances({ procs, ownPid: 900, running: { pid: 400, version: '0.16.0' }, version: '0.15.4' }), []);
});

test('an older copy that said nothing (before 0.15.4) is known by its name; this copy is spared', () => {
  const procs = parsePs(PS);
  const pids = staleInstances({ procs, ownPid: 900, running: null, version: '0.15.4' });
  assert.deepEqual(pids.sort(), [400, 500]);   // the main processes under both names; helpers end with them, the agent is replaced apart
  // a note left by a copy that has since ended means nothing
  assert.deepEqual(staleInstances({ procs, ownPid: 900, running: { pid: 7777, version: '0.15.3' }, version: '0.15.4' }).sort(), [400, 500]);
});

test('Linux names: the package and an AppImage, not a checkout', () => {
  const procs = parsePs('1 0 systemd\n300 1 logimx\n301 300 logimx\n302 301 logimx\n310 1 logimx-agent\n400 1 electron\n401 400 electron\n900 1 logimx\n');
  assert.deepEqual(staleInstances({ procs, ownPid: 900, running: null, version: '0.15.4' }).sort(), [300, 301, 302]);
  assert.deepEqual(staleInstances({ procs, ownPid: 400, running: null, version: '0.15.4' }).sort(), [300, 301, 302, 900]);
});

test('the processes of one bundle', () => {
  const procs = parsePs(PS);
  assert.deepEqual(bundleProcesses(procs, '/Applications/NotLogi.app').sort(), [400, 401, 402, 410]);
  assert.deepEqual(bundleProcesses(procs, '/Users/u/Applications/LogiMX.app/').sort(), [500, 501]);
  assert.deepEqual(bundleProcesses(procs, '/Applications/Other.app'), []);
});
