#!/bin/sh
# Installs the PetroView production watchdog, backup job, schedule and log
# rotation onto the host.
#
# These files used to exist only on the server, which meant a host rebuild lost
# the monitoring that had been added after a four-day undetected exposure. They
# live in the repository so they can be restored and reviewed like anything else.
#
# Idempotent: safe to re-run after a change.
#
#   scp -r ops root@69.62.106.189:/tmp/ops && ssh root@69.62.106.189 '/tmp/ops/install.sh'
#
set -eu

SRC=$(cd "$(dirname "$0")" && pwd)
LOGDIR=/var/log/petroview

if [ "$(id -u)" != "0" ]; then
  echo "must run as root" >&2
  exit 1
fi

install -m 0755 "$SRC/petroview-watchdog" /usr/local/bin/petroview-watchdog
install -m 0755 "$SRC/petroview-backup"  /usr/local/bin/petroview-backup
install -m 0644 "$SRC/petroview.cron"    /etc/cron.d/petroview
install -m 0644 "$SRC/petroview.logrotate" /etc/logrotate.d/petroview

mkdir -p "$LOGDIR" /etc/dokploy/backups/petroview
chmod 700 /etc/dokploy/backups/petroview

# cron needs the trailing newline and correct ownership to pick the file up.
chown root:root /etc/cron.d/petroview
chmod 0644 /etc/cron.d/petroview

echo "installed. running the watchdog once to confirm:"
/usr/local/bin/petroview-watchdog || echo "WARNING: watchdog reported failures; see output above"
