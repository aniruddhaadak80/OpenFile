#!/usr/bin/env bash
# Installs what tests/apps/linux-launch.sh needs on Ubuntu, Debian, Fedora or Arch (runner or container):
# an X server (Xvfb), a headless Wayland compositor (cage) with a screenshot tool (grim), D-Bus, Mesa, fonts,
# Python with Pillow for the blank-window check. Usage: tests/apps/linux-deps.sh
set -euo pipefail
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
. /etc/os-release
echo "Installing launch test tools on $PRETTY_NAME"
case "$ID" in
  ubuntu|debian)
    export DEBIAN_FRONTEND=noninteractive
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq --no-install-recommends \
      xvfb x11-utils imagemagick cage grim dbus dbus-daemon procps curl ca-certificates file python3 python3-pil \
      libegl1 libgl1 libgles2 libgbm1 libgl1-mesa-dri fonts-dejavu-core libgtk-3-0 >/dev/null || \
    $SUDO apt-get install -y -qq --no-install-recommends \
      xvfb x11-utils imagemagick cage grim dbus procps curl ca-certificates file python3 python3-pil \
      libegl1 libgl1 libgles2 libgbm1 libgl1-mesa-dri fonts-dejavu-core libgtk-3-0 >/dev/null
    ;;
  fedora)
    $SUDO dnf -y -q install xorg-x11-server-Xvfb xwininfo ImageMagick cage grim dbus-daemon dbus-tools procps-ng curl file findutils \
      python3 python3-pillow mesa-dri-drivers mesa-libEGL mesa-libgbm mesa-libGL gtk3 dejavu-sans-fonts >/dev/null
    ;;
  arch)
    pacman -Syu --noconfirm --needed xorg-server-xvfb xorg-xwininfo imagemagick cage grim dbus procps-ng curl file \
      python python-pillow mesa gtk3 ttf-dejavu >/dev/null
    ;;
  *) echo "::error::unsupported distribution $ID"; exit 1 ;;
esac
echo "cage: $(command -v cage || echo missing)  grim: $(command -v grim || echo missing)  Xvfb: $(command -v Xvfb || echo missing)"
