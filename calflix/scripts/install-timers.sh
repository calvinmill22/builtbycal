#!/usr/bin/env bash
# Install user-level CalFlix publisher timers for Artemis (Ubuntu).
set -euo pipefail
DIR="$HOME/.config/systemd/user"
ENV="$HOME/.config/artemis/calflix-publish.env"
SCRIPT="$HOME/builtbycal-bridge/calflix/scripts/publish.py"
if [[ ! -f "$ENV" ]]; then
  echo "Missing private env file: $ENV"
  echo "Follow calflix/README.md to add your Jellyfin URL, key, and GitHub token."
  exit 1
fi
if [[ ! -f "$SCRIPT" ]]; then
  echo "Missing publisher: $SCRIPT"
  echo "Clone the builtbycal repository into ~/builtbycal-bridge first."
  exit 1
fi
chmod 600 "$ENV"
mkdir -p "$DIR"
cat >"$DIR/calflix-health.service" <<'EOF'
[Unit]
Description=Publish CalFlix availability heartbeat
[Service]
Type=oneshot
EnvironmentFile=%h/.config/artemis/calflix-publish.env
ExecStart=/usr/bin/python3 %h/builtbycal-bridge/calflix/scripts/publish.py health
EOF
cat >"$DIR/calflix-health.timer" <<'EOF'
[Unit]
Description=CalFlix private service check every 15 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Persistent=true
[Install]
WantedBy=timers.target
EOF
cat >"$DIR/calflix-weekly.service" <<'EOF'
[Unit]
Description=Publish CalFlix weekly dispatch from Artemis
[Service]
Type=oneshot
EnvironmentFile=%h/.config/artemis/calflix-publish.env
ExecStart=/usr/bin/python3 %h/builtbycal-bridge/calflix/scripts/publish.py weekly
EOF
cat >"$DIR/calflix-weekly.timer" <<'EOF'
[Unit]
Description=Publish Artemis CalFlix report every Sunday evening
[Timer]
OnCalendar=Sun *-*-* 18:00:00 America/New_York
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now calflix-health.timer calflix-weekly.timer
echo "CalFlix timers installed. Current schedule:"
systemctl --user list-timers --all | grep calflix || true
echo "To publish immediately, run:"
echo "  systemctl --user start calflix-health.service"
echo "  systemctl --user start calflix-weekly.service"
