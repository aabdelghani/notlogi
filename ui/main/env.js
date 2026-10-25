// Where NotLogi runs from: the platform, the app's own folder, how it is launched, the agent's socket.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const plat = require('../platform');
const ROOT = require('path').join(__dirname, '..');   // the app's own folder

exports.link = () => {};

const PACKAGED = app.isPackaged;
const APPIMAGE = process.env.APPIMAGE || '';
// the window's class on X11: the app's name in lower case (Electron 38 and later lower-case it, "notlogi"); every
// desktop entry names it as StartupWMClass, which GNOME matches exactly to show the logo instead of a cog
const WM_CLASS = 'notlogi';
// files shipped next to the app: repo root in development, resources/ in a package
const resPath = (...p) => PACKAGED ? path.join(process.resourcesPath, ...p) : path.join(ROOT, '..', ...p);
// The .deb's app, when it is installed: an AppImage or a checkout started beside it leaves the
// launcher and autostart to the package, or the app grid shows two NotLogi and the wrong one
// starts at login (one install at a time; the package wins).
const DEB_APP = '/opt/logimx/logimx';
const debInstalled = () => process.execPath !== DEB_APP && fs.existsSync(DEB_APP) && fs.existsSync('/usr/share/applications/logimx.desktop');
// how to launch this very app again (autostart, desktop entry)
const launchCmd = () => debInstalled() ? DEB_APP : APPIMAGE ? `"${APPIMAGE}"` : PACKAGED ? process.execPath : `${process.execPath} ${ROOT} --no-sandbox --class=${WM_CLASS}`;

const SOCKET = plat.agentEndpoint();

exports.provide = { PACKAGED, APPIMAGE, WM_CLASS, resPath, launchCmd, debInstalled, SOCKET };
