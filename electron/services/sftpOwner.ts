/**
 * SFTP hands back numeric uid/gid, but readdir also carries `longname` — the server's own
 * `ls -l` line, which already has the names resolved against its passwd database. We have no
 * other way to turn uid 0 into "root" for a remote host, so parse it and fall back to the
 * number when the server's format isn't the familiar Unix one (Windows SFTP servers, SFTP v4+).
 *
 *   -rw-r--r--   1 root  wheel   4096 Jul  9 12:00 notes.md
 *                  ^owner ^group
 */
export function ownerFromLongname(
  longname: string | undefined,
  fallback: { owner: string; group: string }
): { owner: string; group: string } {
  const f = longname?.trim().split(/\s+/) ?? []
  // fields: perms, nlink, owner, group, size, … — perms is the 10-char "drwxr-xr-x".
  if (f.length < 5 || f[0].length !== 10 || !/^\d+$/.test(f[1])) return fallback
  return { owner: f[2], group: f[3] }
}
