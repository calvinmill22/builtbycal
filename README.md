# Built By Cal — Portfolio website

Personal technical portfolio for Calvin Miller. Responsive static HTML/CSS/JS, no framework or API keys. Built for GitHub Pages at **https://builtbycal.com**.

## Local preview

Open `index.html` in a browser, or run `python -m http.server 8000` in this directory.

## Deployment

Publish this repository from the `main` branch and `/(root)` via **Settings → Pages** in GitHub. The `CNAME` file sets `builtbycal.com` as the intended custom domain. Configure the DNS records at Spaceship; verify the domain in GitHub's user-level Pages settings. Enable HTTPS after a certificate is provisioned.

## Professional email

`site-config.js` intentionally leaves `email` empty until the `calvin@builtbycal.com` mailbox has been purchased (if needed), activated, and successfully tested. Once verified, set `email: 'calvin@builtbycal.com'` and commit/push that one change. Do not put passwords or mail-provider tokens in this file.

## Portfolio integrity

Case studies describe independent projects or validated implementation history. The Watchtower project links to the actual public `calvinmill22/osint` repository. RoadBoxOS's independent origins are distinguished from workplace AtomicOS adaptations. No employer proprietary code, inventory records, home-system credentials, or user data is included.

## Security

The site is public by design. No private authentication, backend services, exposed home ports, API keys, or technical staging/production interfaces are necessary.
