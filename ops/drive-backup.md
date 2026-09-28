Offsite backup to Google Drive
==============================

Why this exists
---------------
The nightly snapshots are written to /etc/dokploy/backups/petroview on the
same VPS that runs the application. That protects the database from corruption,
a bad migration, or an accidental wipe. It does not protect against losing the
host, losing the disk, or anything that encrypts the volume, because the backup
and the thing being backed up disappear together.

One verified copy on another provider is the difference between an outage and
losing the ledger.

How it behaves
--------------
petroview-backup still writes and verifies the local snapshot first, exactly as
before. After that it replicates to Drive, but only if OFFSITE_REMOTE is set:

  * not set   -> logs "OFFSITE SKIPPED" and exits 0. Local backups are
                 unaffected. This is the state right now.
  * set       -> copies the snapshot, re-reads the uploaded object, and compares
                 its size against the local file. A mismatch is a failure.
                 Retention on the Drive folder is applied too.

Once a remote is configured, a replication failure exits non-zero on purpose. A
backup that quietly stops reaching offsite is worse than a loud one, because
the local copy still looks perfectly healthy.

Set up (one time, about two minutes)
------------------------------------
Do this on your own Windows machine, not the server.

1. Install rclone. In PowerShell:

     winget install Rclone.Rclone

   If winget is unavailable, download the zip from
   https://downloads.rclone.org/ and put rclone.exe somewhere on your PATH.

2. Authorise against your Google account. A browser window will open:

     rclone config

   Answer:
     n            (new remote)
     name:        gdrive
     Storage:     drive          <- the big one, not "drive (other)")
     (client_id)  Enter your own client ID -> leave blank, press Enter
     (client_secret)             -> leave blank, press Enter
     scope:       1              (full access, required for unattended use)
     root_folder_id:             -> leave blank
     service_account_file:       -> leave blank
     Edit advanced config?      -> n
     Use auto config?            -> y
     (choose "y" for headless if asked, or 1 to use the browser)
     Shared Drive:               -> n
     Finish and keep rclone.conf as is.

   Leave the client ID blank on purpose. rclone ships a shared client ID that
   is sufficient here, and that avoids you having to create a Google Cloud
   project for a single backup.

3. Check it worked:

     rclone lsd gdrive:

   You should see your Drive folders listed. If this errors, the authorisation
   did not complete; rerun step 2.

4. Create the folder the snapshots will live in, so they are not scattered
   across your Drive root:

     rclone mkdir gdrive:petroview-backups

5. Send the config to the server. This is the only step that touches secrets, so
   read what you are about to run:

     scp $env:APPDATA\rclone\rclone.conf root@69.62.106.189:/root/.config/rclone/rclone.conf

   The file contains a refresh token. Anyone holding it can read and write your
   entire Drive. It is stored on the server at /root/.config/rclone/rclone.conf
   with 600 permissions, readable only by root.

6. Back on the server, set the remote and test it:

     echo 'OFFSITE_REMOTE=gdrive:petroview-backups' >> /etc/default/petroview-backup
     chmod 600 /etc/default/petroview-backup
     /usr/local/bin/petroview-backup

   Look for this line in the output:

     ... OFFSITE OK gdrive:petroview-backups/masterview-....sqlite size=266240

7. Confirm the copy is really there:

     rclone ls gdrive:petroview-backups

What you get
------------
Nightly verified snapshots in your Drive, retained 30 days there and 14 days
locally. The backup log distinguishes OK, SKIPPED, and FAILED, so a broken
offsite copy is visible without checking Drive by hand.

Scope
-----
This replicates the SQLite ledger, which includes attendant accounts and PIN
hashes. It is not encrypted at rest beyond what Google applies to your Drive.
Keep the rclone.conf token private for that reason.
