// Where operator backups are kept (TS-112): `BACKUP_URL`, a `file:` directory (development and drills) or
// `s3://bucket/prefix` off-site, with credentials from the `S3_*` environment (Bun). Each backup is one object,
// named for when it was taken: `tonaris-20261030T040000Z.dump.age`.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BackupStorage = {
  put(name: string, bytes: Uint8Array): Promise<void>;
  get(name: string): Promise<Uint8Array>;
  /** The backups' names, oldest first. */
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
};

const pattern = /^tonaris-(\d{8}T\d{6}Z)\.dump\.age$/;

/** A backup's name for when it was taken. */
export function backupName(at: Date): string {
  const stamp = at
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `tonaris-${stamp}.dump.age`;
}

/** When the backup `name` was taken, or undefined for a name that isn't a backup's. */
export function takenAt(name: string): Date | undefined {
  const stamp = pattern.exec(path.basename(name))?.[1];
  if (!stamp) return undefined;
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  return new Date(iso);
}

export function backupStorage(url: string): BackupStorage {
  const parsed = new URL(url);
  if (parsed.protocol === "file:") return directory(fileURLToPath(parsed));
  if (parsed.protocol === "s3:") {
    const prefix = parsed.pathname.replace(/^\/+|\/+$/g, "");
    return bucket(new Bun.S3Client({ bucket: parsed.hostname }), prefix);
  }
  throw new Error(`BACKUP_URL must be a file: or s3: URL, not ${parsed.protocol}`);
}

function directory(dir: string): BackupStorage {
  return {
    async put(name, bytes) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), bytes);
    },
    async get(name) {
      return new Uint8Array(await readFile(path.join(dir, name)));
    },
    async list() {
      const names = await readdir(dir).catch(() => []);
      return names.filter((name) => pattern.test(name)).toSorted();
    },
    async remove(name) {
      await rm(path.join(dir, name), { force: true });
    },
  };
}

function bucket(client: Bun.S3Client, prefix: string): BackupStorage {
  const keyOf = (name: string) => (prefix ? `${prefix}/${name}` : name);
  return {
    async put(name, bytes) {
      await client.write(keyOf(name), bytes, { type: "application/octet-stream" });
    },
    async get(name) {
      return new Uint8Array(await client.file(keyOf(name)).arrayBuffer());
    },
    async list() {
      const names: string[] = [];
      let startAfter: string | undefined;
      for (;;) {
        // oxlint-disable-next-line no-await-in-loop -- each page starts after the last
        const page = await client.list({ prefix: prefix ? `${prefix}/` : undefined, startAfter });
        const keys = (page.contents ?? []).map((object) => object.key);
        names.push(...keys.map((key) => path.basename(key)).filter((name) => pattern.test(name)));
        if (!page.isTruncated || keys.length === 0) break;
        startAfter = keys.at(-1);
      }
      return names.toSorted();
    },
    async remove(name) {
      await client.delete(keyOf(name));
    },
  };
}
