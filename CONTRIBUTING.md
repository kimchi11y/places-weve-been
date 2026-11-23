# Contributing

Thank you for helping. This site is for sharing trips privately with family and friends, so ideas that keep it private and simple fit best. Want something different, like a public site? Fork it and make it yours.

Found a way past the sign-in, or a photo that keeps its location? Please follow [`SECURITY.md`](SECURITY.md) instead of opening an issue.

## Making a change

1. Fork the repository and branch from **`develop`**. `main` is what people's sites update from, so it only gets finished work.
2. Set up: `npm install`, `npm run seed`, `npm run dev` (no Cloudflare account needed).
3. Make the change, with a test that fails without it.
4. Check it: `npm run check`, `npm test` and `npm run build`. If you changed how it runs in Docker, also `docker build -t places-weve-been .` and `scripts/check-docker-image.sh places-weve-been`.
5. Open a pull request **into `develop`**. For anything big, open an issue first so nobody's time is wasted.

Commits say what kind of change they are: `fix:`, `feat:`, `perf:`, `refactor:`, `test:`, `docs:` or `ci:`, with a `!` (`feat!:`) if people have to do something when they update.

## Other people's trips

Everyone who runs this has trips and photos that only exist on their site, and updates change their database by themselves. So:

- **Only ever add tables and columns.** Dropping or renaming one can delete people's trips.
- **Never edit a migration that's been released.** After changing `src/schema/tables.ts`, run `npm run db:generate <name>` to add one.
- Backups made by older versions must still restore.
- Keep both ways of running it working: Cloudflare and Docker.
- If sign-in isn't set up, everything stays closed.

## Releasing (for maintainers)

1. On `develop`, set the new version with `npm version <patch|minor|major> --no-git-tag-version` and commit it. Fixes are a patch, new features a minor, and anything people must act on a major (before 1.0, a minor).
2. Open a pull request from `develop` into `main`. Try it on a real site, starting from a backup made by the last release.
3. Merge it with a **merge commit**, so `develop` and `main` don't drift apart.
4. Create a GitHub release tagged `v<version>` on `main`. Say what changed, and put anything people must do first.
