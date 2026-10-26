<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png">
    <img src="docs/logo.png" alt="NotLogi" width="220">
  </picture>
</p>

<p align="center"><b>Unofficial mouse &amp; keyboard tools for Linux</b> (formerly LogiMX)</p>

[![New in 0.13.0: PRO X3 SUPERSTRIKE](https://img.shields.io/badge/NEW%20in%200.13.0-PRO%20X3%20SUPERSTRIKE-ff4d4d.svg?style=for-the-badge)](#pro-x3-superstrike)

[![Release build](https://github.com/aabdelghani/notlogi/actions/workflows/release.yml/badge.svg)](https://github.com/aabdelghani/notlogi/actions/workflows/release.yml)
[![Tests](https://github.com/aabdelghani/notlogi/actions/workflows/test.yml/badge.svg)](https://github.com/aabdelghani/notlogi/actions/workflows/test.yml)
[![Latest release](https://img.shields.io/github/v/release/aabdelghani/notlogi?color=2dd4bf&label=release)](https://github.com/aabdelghani/notlogi/releases/latest)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-2dd4bf.svg)](LICENSE)
[![Platforms: Linux, Windows, macOS](https://img.shields.io/badge/platforms-Linux%20%C2%B7%20Windows%20beta%20%C2%B7%20macOS%20beta-2dd4bf.svg)](#install)
[![Devices: MX Master 4 and 3S, MX Keys family, PRO X3 SUPERSTRIKE](https://img.shields.io/badge/devices-MX%20Master%204%20%2F%203S%20%C2%B7%20MX%20Keys%20family%20%C2%B7%20PRO%20X3%20SUPERSTRIKE-2dd4bf.svg)](#supported-devices)
[![Action ring](https://img.shields.io/badge/action%20ring-yes-2dd4bf.svg)](#action-ring)
[![Flow](https://img.shields.io/badge/flow-several%20computers-2dd4bf.svg)](#flow)

# NotLogi

NotLogi sets up MX mice and keyboards on Linux, with Windows and macOS in beta. Choose what every
button and key does, open an **action ring** of your favourite actions around the pointer, and use
one mouse and keyboard across several computers with **Flow**.

> [!IMPORTANT]
> ### 🎯 New in 0.13.0: the PRO X3 SUPERSTRIKE on Linux
> **Everything G HUB offers for this mouse, now on Linux**, without Wine, a VM or an account
> (only G HUB's online parts are left out). It works through the LIGHTSPEED receiver or the cable.
>
> - **HITS analog buttons**: actuation point, rapid trigger and click haptics for each button, HITS codes that work with G HUB's, and the latency test with the switch travel shown live
> - **Sensitivity**: G HUB's presets, five DPI slots with DPI shift, X/Y split, lift-off distance, up to 8000 Hz
> - **G-Shift layer, macros**, and DPI actions on any button
> - **Onboard memory**: write your settings to the mouse so they go with it to any PC
>
> [See all of it below](#pro-x3-superstrike)

NotLogi is an independent project. It is not affiliated with, endorsed by, or supported by the
manufacturer of these devices.

| Action ring | The ring on the desktop |
|---|---|
| ![Action ring](screenshots/action-ring.png) | ![Action ring overlay](screenshots/action-ring-overlay.png) |

## Install

Download from the [latest release](https://github.com/aabdelghani/notlogi/releases/latest).

- **Ubuntu / Debian**: `sudo apt install ./logimx_0.13.0_amd64.deb`, then open NotLogi from the app grid.
- **Any Linux**: make the AppImage executable and run it.
- **Windows 10 and 11** (beta): run the setup. If SmartScreen asks, choose **More info**, then
  **Run anyway**.
- **macOS 12 or newer** (beta): open the .dmg and drag NotLogi to Applications (signed and
  notarized, so it opens like any app), then allow **Accessibility** and **Input Monitoring** when asked.

Quit Logi Options+, Solaar or logiops while NotLogi runs: they drive the same buttons.

To remove NotLogi: **About → Remove NotLogi** in the app lists what goes and takes it away (settings
stay unless you say so). On Linux, `logimx-uninstall [--all]` does the same from a terminal (installed
by the .deb, and in the repository at `packaging/uninstall.sh`).

## Supported devices

| Device | State |
|---|---|
| **PRO X3 SUPERSTRIKE** 🆕 | **Tested on its LIGHTSPEED receiver, new in 0.13.0** |
| MX Master 4 | Tested |
| MX Master 3S | Tested |
| MX Keys S | Tested |
| MX Keys, MX Keys for Mac, MX Keys for Business | Working, reported by users |
| MX Anywhere 3S | Included, not yet tested |
| MX Keys Mini, Mini for Mac, Mini for Business | Included, not yet tested |

Through a Bolt, Unifying or LIGHTSPEED receiver, or over Bluetooth.

## Features

### PRO X3 SUPERSTRIKE

**New in 0.13.0.** What G HUB offers for the mouse, without its online parts:

- Sensitivity: G HUB's presets and your own, five DPI slots with the default and DPI shift slots, X and Y apart, lift-off distance, report rate, HERO sensor calibration and a Sensitivity tool
- HITS: actuation point, rapid trigger and click haptics for each main button, presets, the HITS code, and the latency test with the button's travel shown live
- Assignments: G HUB's System actions, a G-Shift layer, and macros
- Gaming surface mode, the onboard memory (use it, or write your settings into a profile), BHOP, time left from the mouse's power model
- A sensitivity of its own for each app profile

| Sensitivity | HITS |
|---|---|
| ![PRO X3 sensitivity](screenshots/x3-sensitivity.png) | ![PRO X3 HITS](screenshots/x3-hits.png) |

| Assignments | Settings |
|---|---|
| ![PRO X3 assignments](screenshots/x3-assignments.png) | ![PRO X3 settings](screenshots/x3-settings.png) |

### Flow

One mouse and keyboard for several computers (Linux and macOS; Windows untested). Move the pointer
off the edge of the screen and it carries on on the next computer, with the keyboard and the
clipboard.

- Set up in three steps: install NotLogi on both, pair the mouse on another channel, same network
- Drag the computers' screens to where they sit
- Switch at the edge, or only while holding Ctrl

| Flow | Flow settings |
|---|---|
| ![Flow](screenshots/flow.png) | ![Flow settings](screenshots/flow-settings.png) |

![Setting up Flow](screenshots/flow-setup.png)

### Action ring

Hold a button, flick toward an action, let go. Up to eight actions around the pointer.

- Click a slot to pick its action, or drag one onto it
- **Folders**: put more actions behind one slot; they open on a second circle around the ring
- Several ring profiles, and a different ring per application
- Volume and brightness: hold and drag to set the level
- Small, medium or large

| A folder in the settings | The folder on the ring |
|---|---|
| ![Ring folder in the settings](screenshots/ring-folder.png) | ![Ring folder on the desktop](screenshots/ring-folder-overlay.png) |

![Button actions with the action ring](screenshots/mouse-button-panel.png)

![Volume bar while dragging](screenshots/ring-volume-bar.png)

### MX Master 4

- Haptic feedback with its strength, felt as the action ring moves
- The haptic panel as a button of its own (it opens the action ring out of the box)
- How hard the panel has to be pressed, and the wheel's ratchet force
- Easy-Switch on a photo of its underside

| Buttons and the haptic panel | Easy-Switch |
|---|---|
| ![MX Master 4 buttons](screenshots/mx4-buttons.png) | ![MX Master 4 Easy-Switch](screenshots/mx4-easy-switch.png) |

### Home

Your devices with their battery level.

![Welcome](screenshots/home.png)

### Mouse buttons

Click a button on the photo and choose what it does: suggestions, shortcuts, commands, apps, media,
the action ring or gestures.

![Mouse buttons](screenshots/mouse-buttons.png)

### Application profiles

Give an application its own buttons and keys. The profile follows the window in front.

![LibreOffice Writer profile: Back is Undo](screenshots/app-profile.png)

### Point and scroll

Pointer speed, SmartShift, smooth scrolling and scroll direction. The thumb wheel can scroll, zoom,
or change volume, tabs or workspaces.

![Point and scroll](screenshots/mouse-point-scroll.png)

### Gestures

Hold a button and swipe up, down, left or right to run an action.

### Keyboard keys

Click a key on the photo of your keyboard and choose what it does.

| Keyboard | Key actions |
|---|---|
| ![Keys](screenshots/keyboard-keys.png) | ![Key actions](screenshots/action-picker.png) |

### Backlight

On or off, automatic or a fixed level, and how long it stays on.

![Backlight](screenshots/keyboard-backlight.png)

### Device settings

F keys as standard keys or media keys, lock keys on or off, and the battery over the last week.

![Device settings](screenshots/device-settings.png)

### Emoji picker

The Emoji key opens a searchable picker at the pointer.

![Emoji picker](screenshots/emoji-picker.png)

### Overlays, tray and notifications

On-screen notices when you mute the mic or switch computers, battery levels in the tray, and a
warning when the battery runs low.

| Notifications | Tray |
|---|---|
| ![Notifications](screenshots/notifications.png) | ![Tray panel](screenshots/tray-panel.png) |

### Themes

Light, Dark, Ubuntu and Ubuntu dark.

| Dark | GNOME |
|---|---|
| ![Dark](screenshots/dark-theme.png) | ![GNOME](screenshots/light-theme.png) |

### Bluetooth

Put a mouse or keyboard in pairing mode and NotLogi offers to connect it.

| Pairing pop-up | Add device over Bluetooth |
|---|---|
| ![Pairing pop-up](screenshots/bluetooth-popup.png) | ![Add device over Bluetooth](screenshots/bluetooth-pairing.png) |

### More

- Pair with a Bolt receiver
- Back up, restore, export and import your settings
- Start at login, or hidden in the tray
- A first-run wizard that sets everything up

![First run](screenshots/first-run.png)

## Wishes and problems

**Make a wish** or **Report an issue** from the home screen. A report fills in what is needed and
leaves out personal details; it is filed from your own GitHub account.

| Make a wish | Report a problem |
|---|---|
| ![Make a wish](screenshots/make-a-wish.png) | ![Report a problem](screenshots/report-problem.png) |

## How it works

A small background agent talks to the devices; the app is its settings window.

![Architecture](docs/architecture.png)

Building from source, the command line and the technical details are in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Related projects

- [Solaar](https://github.com/pwr-Solaar/Solaar): device manager for Unifying and Bolt receivers
- [logiops](https://github.com/PixlOne/logiops): daemon with gestures and SmartShift
- [libratbag](https://github.com/libratbag/libratbag) and Piper: DPI and buttons for gaming mice
