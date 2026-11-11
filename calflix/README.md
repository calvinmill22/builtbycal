# CalFlix member portal

**Public URL:** https://builtbycal.com/calflix/

Static, invite-only onboarding page on GitHub Pages. The private Jellyfin service
continues to run behind Tailscale, with no inbound home-network ports opened.
Never publish Jellyfin IPs/URLs, user identities, auth tokens, or session data.

## What is already deployed?

- CalFlix homepage, links from BuiltByCal, member onboarding and help
- Status pill that reads calflix/data/status.json
- Artemis Weekly Dispatch that reads calflix/data/weekly.json
- Safe placeholders until Artemis is actually configured
- Python publisher script at calflix/scripts/publish.py

**Important:** A static website cannot check Tailscale-only Jellyfin directly.
The status badge becomes operational only after the Artemis publisher is installed.
A healthy heartbeat is displayed as Online, a failed check as Offline, and a
missing/stale (more than 50 minutes old) heartbeat as **Status unknown**.
The site never assumes "online" because a file exists.

## Artemis install (Ubuntu VM, user arty)

1. Clone the public repo into Artemis's home directory:

    git clone https://github.com/calvinmill22/builtbycal.git ~/builtbycal-bridge

2. Create a *private* environment file:

    mkdir -p ~/.config/artemis
    nano ~/.config/artemis/calflix-publish.env
    chmod 600 ~/.config/artemis/calflix-publish.env

   Artemis already has working Jellyfin settings in
   ~/.config/artemis/integrations.env, using ARTEMIS_JELLYFIN_BASE_URL and
   ARTEMIS_JELLYFIN_API_KEY. The installer loads that existing private file.
   You only need to provide the GitHub publisher token here:

    CALFLIX_GITHUB_TOKEN=YOUR_FINE_GRAINED_GITHUB_TOKEN
    CALFLIX_OLLAMA_URL=http://127.0.0.1:11434
    CALFLIX_OLLAMA_MODEL=artemis-v2

   If Artemis has no working Jellyfin settings, optionally add CALFLIX_JELLYFIN_URL
   and CALFLIX_JELLYFIN_API_KEY to this file as overrides. For GitHub use a
   **fine-grained personal access token**, repository access **only**
   calvinmill22/builtbycal, permission **Contents: Read and write**.
   Store both on Artemis only. Do NOT paste tokens into a chat, log, public repo,
   or public environment file. Set a suitable token expiry and rotate as needed.

3. Test privately (sources the env in the shell, not in the repository):

    set -a
    source ~/.config/artemis/integrations.env
    source ~/.config/artemis/calflix-publish.env
    set +a
    python3 ~/builtbycal-bridge/calflix/scripts/publish.py health
    python3 ~/builtbycal-bridge/calflix/scripts/publish.py weekly

   If either command errors, check the Jellyfin route and token permissions.
   The second command publishes a digest and saves a PRIVATE markdown report:
   ~/.local/share/artemis/calflix/suggestions-YYYY-MM-DD.md

   Recommendations use a curated multi-genre film list, match it against actual
   library titles, and prioritize genres with fewer existing films. This is a
   starter collection-gap report, not a full genre analytics engine.
   Ollama writes a short editorial line; numerical counts are deterministic.

## Schedule health checks and the weekly report

Create the user unit files, using these exact contents.

~/.config/systemd/user/calflix-health.service:

    [Unit]
    Description=Publish CalFlix status to BuiltByCal
    [Service]
    Type=oneshot
    EnvironmentFile=-%h/.config/artemis/integrations.env
    EnvironmentFile=%h/.config/artemis/calflix-publish.env
    ExecStart=/usr/bin/python3 %h/builtbycal-bridge/calflix/scripts/publish.py health

~/.config/systemd/user/calflix-health.timer:

    [Unit]
    Description=Check private CalFlix every 15 minutes
    [Timer]
    OnBootSec=2min
    OnUnitActiveSec=15min
    Persistent=true
    [Install]
    WantedBy=timers.target

~/.config/systemd/user/calflix-weekly.service:

    [Unit]
    Description=Publish Artemis weekly CalFlix dispatch
    [Service]
    Type=oneshot
    EnvironmentFile=%h/.config/artemis/calflix-publish.env
    ExecStart=/usr/bin/python3 %h/builtbycal-bridge/calflix/scripts/publish.py weekly

~/.config/systemd/user/calflix-weekly.timer:

    [Unit]
    Description=Weekly CalFlix report from Artemis
    [Timer]
    OnCalendar=Sun *-*-* 18:00:00 America/New_York
    Persistent=true
    [Install]
    WantedBy=timers.target

Enable timers with the included setup script (or create the above units yourself):

    bash ~/builtbycal-bridge/calflix/scripts/install-timers.sh

If user services stop when the SSH session ends, configure systemd user lingering
for arty as appropriate. To refresh script changes later, run:

    git -C ~/builtbycal-bridge pull --ff-only

## Operational notes

- Heartbeat commits are written to the public GitHub repo no more often than
  every 15 minutes if the suggested timer is used. GitHub Pages deployment
  takes additional time; this is a **roughly quarter-hour status**, not a
  millisecond-real-time probe.
- An Offline badge means Artemis could not reach authenticated Jellyfin on
  the last check, not necessarily that all members are unable to connect.
- Token errors show Unknown, not Offline.
- The weekly dispatch is public: movie/series/episode counts and recent media
  titles can be seen by anyone. Private film recommendations are **not** uploaded.
- GitHub Pages publishes only committed static assets. For higher-frequency
  health checks, a separate protected ingest endpoint and public read-only API
  (for example, a Cloudflare Worker) would be a better later upgrade.
- Use this only for personally owned or otherwise authorized media access.
