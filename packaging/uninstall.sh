#!/bin/sh
# logimx-uninstall: remove NotLogi from this computer, for when the app itself will not open.
# Removes the agent's service, autostart, launcher and icons for this user, then the package or the
# AppImage. Settings, profiles and backups stay unless --all is given.
#   logimx-uninstall [--all] [path/to/NotLogi.AppImage]
set -u
ALL=no; APPIMAGE=""
for a in "$@"; do case "$a" in --all) ALL=yes ;; -h|--help) sed -n '2,5p' "$0"; exit 0 ;; *) APPIMAGE="$a" ;; esac; done
H="${HOME:?}"; CFG="${XDG_CONFIG_HOME:-$H/.config}"; SHARE="${XDG_DATA_HOME:-$H/.local/share}"

echo "== stopping NotLogi"
# stopped before it is disabled: a unit with Restart= would start the agent again after a plain kill
systemctl --user daemon-reload >/dev/null 2>&1 || true
systemctl --user stop logimx.service openoptions.service >/dev/null 2>&1 || true
systemctl --user disable logimx.service openoptions.service >/dev/null 2>&1 || true
pkill -x logimx 2>/dev/null; pkill -x logimx-agent 2>/dev/null; sleep 1
pkill -9 -x logimx-agent 2>/dev/null || true

echo "== this user's files"
rm -f "$CFG/systemd/user/logimx.service" "$CFG/systemd/user/openoptions.service" \
      "$CFG/autostart/logimx.desktop" "$CFG/autostart/openoptions.desktop" \
      "$SHARE/applications/logimx.desktop" "$H/.local/bin/logimx-agent" "$H/.local/bin/logimxctl" \
      "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/logimx.sock"
find "$SHARE/icons/hicolor" -path '*/apps/*' \( -name 'logimx*.png' -o -name 'notlogi*.png' -o -iname '*logimx*.png' \) -delete 2>/dev/null
systemctl --user daemon-reload >/dev/null 2>&1 || true
update-desktop-database -q "$SHARE/applications" 2>/dev/null || true
gtk-update-icon-cache -q -f -t "$SHARE/icons/hicolor" 2>/dev/null || true
if [ "$ALL" = yes ]; then
  echo "== settings, profiles and backups"
  rm -rf "$CFG/logimx" "${XDG_STATE_HOME:-$H/.local/state}/logimx" "$CFG/LogiMX" "${XDG_CACHE_HOME:-$H/.cache}/LogiMX"
fi

[ -n "$APPIMAGE" ] && [ -f "$APPIMAGE" ] && { echo "== $APPIMAGE"; rm -f "$APPIMAGE"; }

# the package, and what was placed outside home by hand or by the Install rule button
SYS="/etc/udev/rules.d/60-logimx.rules /usr/local/bin/logimx-agent /usr/local/bin/logimxctl /usr/local/lib/systemd/user/logimx.service"
NEED=no; for f in $SYS; do [ -e "$f" ] && NEED=yes; done
dpkg -s logimx >/dev/null 2>&1 && NEED=yes
if [ "$NEED" = yes ]; then
  echo "== system files (asks for your password)"
  if [ "$(id -u)" = 0 ]; then SUDO=""; elif command -v sudo >/dev/null 2>&1 && [ -t 0 ]; then SUDO=sudo; else SUDO=pkexec; fi
  $SUDO sh -c "if dpkg -s logimx >/dev/null 2>&1; then apt-get purge -y logimx 2>/dev/null || dpkg -P logimx; fi; rm -f $SYS; udevadm control --reload 2>/dev/null; update-desktop-database -q /usr/share/applications 2>/dev/null; true"
fi
echo "NotLogi removed.$([ "$ALL" = yes ] || echo ' Settings kept in ~/.config/logimx and ~/.config/LogiMX; add --all to remove them.')"
