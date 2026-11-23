# Self-hosting with Docker and Tailscale

Run the site on a home server or VPS, where only people on your [Tailscale](https://tailscale.com) network can reach it. It's never on the public internet, and no ports are opened. Cloudflare is easier for most families ([README](../README.md#deploying)): here, everyone needs the Tailscale app, and looking after the server and its backups is up to you.

You need a Linux server (or a Mac with Docker, to try it) with Docker Compose, about 1 GB of free disk plus your photos, and a Tailscale account.

## Set it up

1. In the Tailscale admin console, open **DNS** and turn on **MagicDNS** and **HTTPS Certificates**.
2. Under **Settings → Keys**, generate an auth key. Leave *Reusable* and *Ephemeral* off; a week is plenty of time to use it.
3. On the server, get the code and your settings file:

   ```sh
   git clone https://github.com/kimchi11y/places-weve-been.git
   cd places-weve-been
   cp .env.example .env
   ```

4. Fill in `.env`. `EDITORS` is who may use `/admin`: the logins as Tailscale shows them under **Users** (people who sign in with GitHub look like `ana@github`). The site's name ends up in a public list of certificates, so keep personal names out of `TS_HOSTNAME`.
5. Start it:

   ```sh
   docker compose up -d --build
   docker compose ps      # both "Up", and the site "healthy" after a moment
   ```

6. On a device with Tailscale on, open `https://<TS_HOSTNAME>.<your tailnet>.ts.net`. The first visit can take a moment while the certificate arrives. Then open `/admin`.

Afterwards, clear `TS_AUTHKEY` in `.env` (it's only needed once), and in the admin console choose **Disable key expiry** for the site's machine. Otherwise it drops off your network when its login expires.

## Check that it's closed

The site learns who's visiting from Tailscale Serve, so nobody may be able to reach it any other way. From another device on your network, with your own login and the machine's `100.x.y.z` address:

```sh
curl -m 8 -i -H "Tailscale-User-Login: you@example.com" http://100.x.y.z:4321/admin
```

This **must fail to connect**. Then ask for the editor while claiming to be someone else:

```sh
curl -m 8 -i -H "Tailscale-User-Login: nobody@example.com" https://<your site>/admin
```

It must never act on that name: an editor gets the editor, and anyone else a refusal naming **their own** login.

Repeat both after moving servers or changing `compose.yaml`. Never add `ports:` to it, and keep `TS_USERSPACE` at `"false"`. The site refuses everyone if it's set to listen beyond its own container, but it can't notice every way of opening it up. Anyone who controls the server itself can read everything on it.

## Let family in

Invite them to your tailnet, or share just this machine with them (**Machines → … → Share**), then have them install Tailscale and open the address. Everyone who can reach the site can see its published trips, so use Tailscale's access rules if only some of your tailnet should. To let someone edit, add their login to `EDITORS` and run `docker compose up -d`.

Devices with a tag belong to nobody in particular, so they're refused.

## Backups

Your trips and photos live in a Docker volume on this server and nowhere else.

```sh
docker/backup.sh                           # into ./backups; the site can stay up
docker/restore.sh 2026-11-06-143000-000    # REPLACES everything, after asking you to type "replace"
```

Copy `backups` to another computer or drive: on the same disk it won't survive the disk. It holds everything, drafts included, and isn't encrypted. Each run adds a dated folder with `backup.json` and `atlas.db` (readable by any SQLite tool); the `photos` folder is shared between them. Back up before you restore.

`docker compose down` keeps your trips. **`docker compose down -v` deletes them for good.**

## Update

```sh
docker/backup.sh
git pull
docker compose pull tailscale
docker compose up -d --build
```

The database is brought up to date when the site starts.

## Move to or from Cloudflare

Backups have the same format. Restore a Docker one with `npm run restore -- backups/<folder>` and look at it with `npm run dev`; adding `--remote` **replaces your live Cloudflare site**. For a backup made with `npm run backup`, copy its dated folder and the `photos` folder into `backups` on the server, then run `docker/restore.sh <folder>`.

## When something's wrong

| What you see | What to check |
|---|---|
| "isn't set up for signing in yet" | `AUTH` and `HOST` in `compose.yaml` were changed |
| "Please sign in" | The device has a tag, or the visit didn't come through Tailscale Serve |
| "can see the site but not edit it" | The login shown isn't in `EDITORS`, or the site wasn't restarted since |
| The address doesn't open | Tailscale is off on this device, or HTTPS certificates aren't turned on |
| Anything else | `docker compose logs --tail 50`. Look for keys before sharing it |
