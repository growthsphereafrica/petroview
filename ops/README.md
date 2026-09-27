# Production operations

Host-level scripts for the PetroView production deployment. These used to exist
only on the server, which meant a host rebuild lost the monitoring that was added
after a four-day undetected exposure of an unauthenticated API.

| File | Installed to | Purpose |
| --- | --- | --- |
| `petroview-watchdog` | `/usr/local/bin/petroview-watchdog` | 11 checks, every 15 min |
| `petroview-backup` | `/usr/local/bin/petroview-backup` | Verified SQLite snapshot, daily |
| `petroview.cron` | `/etc/cron.d/petroview` | Schedule for both |
| `petroview.logrotate` | `/etc/logrotate.d/petroview` | Weekly rotation, 8 kept |
| `install.sh` | — | Installs the above, idempotent |

## Install

```sh
scp -r ops root@69.62.106.189:/tmp/ops
ssh root@69.62.106.189 '/tmp/ops/install.sh'
```

The installer finishes by running the watchdog once, so a broken install is
visible immediately rather than at the next cron tick.

## Why the watchdog exists

Dokploy records a deployment as "done" when the image builds, not when the
container successfully rolls over. On 2026-09-26 a rollout failed instantly
(`SQLITE_CANTOPEN` — the image runs as uid 1000 and the `petroview-data` volume
was root-owned), Dokploy reported success, and the previous build went on
serving an unauthenticated expense ledger for four days.

Check 4 (running image matches the built tag) and check 5 (volume owned by
uid 1000) are the two that would have caught it. The remaining checks are the
canaries for the exposure itself: the auth guards must return `401`, login
throttling must engage, and the ledger must pass an integrity check.

## Backups

Snapshots use SQLite's online backup API against the live volume, so they stay
consistent while the WAL is being written — a `cp` of a live WAL database can
capture a torn state. Every snapshot is integrity-checked and its row counts
recorded *before* it is kept; a snapshot that fails verification is deleted
rather than retained as a false sense of safety.

Fourteen are retained in `/etc/dokploy/backups/petroview/`. The last line of a
successful run reports the counts, which is the fastest way to notice a cleanup
that removed more than intended:

```
2026-09-27T19:33:26Z OK masterview-20260927T193324Z.sqlite counts=7,8,3,3,5 size=266240
```

Counts are `attendants,supervisors,companies,shifts,station_expenses`.

## Verifying a change did not drift

The repo copies are expected to be byte-identical to what is installed. After
editing anything here, reinstall and confirm:

```sh
diff -u /usr/local/bin/petroview-watchdog ops/petroview-watchdog
```
