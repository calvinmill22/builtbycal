# Built By Cal — Portfolio website

Personal technical portfolio for Calvin Miller. Responsive static HTML/CSS/JS, no framework or API keys. Built for GitHub Pages at **https://builtbycal.com**.

## Local preview

Open `index.html` in a browser, or run `python -m http.server 8000` in this directory.

## Deployment

Publish this repository from the `main` branch and `/(root)` via **Settings → Pages** in GitHub. The `CNAME` file sets `builtbycal.com` as the intended custom domain. Configure the DNS records at Spaceship; verify the domain in GitHub's user-level Pages settings. Enable HTTPS after a certificate is provisioned.

## Professional email

The public contact address is configured as `calvin@builtbycal.com` in `site-config.js`. Mailbox administration stays with the email provider.

## Projects

The portfolio includes RoadBoxOS / AtomicOS, Artemis, CalFlix, Watchtower, and Pantry Tracker. The recruiter portal at `employers/` includes focused resumes, a complete career history and text downloads. Watchtower links to its own public source repository.

## Deployment model

The site is static and hosted on GitHub Pages. CalFlix service reports are published as read-only JSON files by the private automation bridge.
