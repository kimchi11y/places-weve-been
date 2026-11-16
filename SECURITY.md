# Security

This site holds families' private photos, so a way for a stranger to see them, or to edit trips without being listed in `EDITORS`, is the most serious kind of bug it can have. So is a photo that keeps its GPS location.

## Reporting a problem

Please don't open a public issue. Use **Report a vulnerability** on this repository's **Security** tab instead, which only the maintainer can see. Include what you did and what you could see or change.

You'll get a reply within a week. Once it's fixed, the fix and a short note go out together, with credit to you if you'd like it.

## What counts

- Seeing a trip or photo without passing Cloudflare Access (or whichever sign-in a deployment uses)
- Using `/admin` or its API without being listed in `EDITORS`
- A photo reaching storage or the site with its location or other camera details still in it
- Anything that lets one person's site read another's data

Problems in Cloudflare itself go to [Cloudflare](https://www.cloudflare.com/disclosure/).
