import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const DOCUMENTS = [
  '引き継ぎ.md',
  'requirements.md',
  'development-log.md',
  '公開と保存の方針.md',
  'アカウント移行.md',
  'Macの暁Vaultへの入れ方.md',
  'Obsidian自動同期.md',
  'TursoとGoogleドライブ.md',
  '無料公開の手順.md',
  'はじめに.md',
];
const DIRECTORIES = ['images', 'examples'];
const ALLOWED_EXTENSIONS = new Set(['.md', '.png', '.jpg', '.jpeg', '.pdf']);

export function validSyncPath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\')) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized);
}

async function walk(directory, prefix) {
  const {readdir} = await import('node:fs/promises');
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, relative));
    else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(relative);
  }
  return files;
}

export async function syncPaths(docsRoot) {
  const files = [];
  for (const name of DOCUMENTS) {
    try {
      if ((await stat(path.join(docsRoot, name))).isFile()) files.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const name of DIRECTORIES) {
    try {
      files.push(...await walk(path.join(docsRoot, name), name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}

export async function resolveSyncFile(docsRoot, relative) {
  if (!validSyncPath(relative) || !ALLOWED_EXTENSIONS.has(path.extname(relative).toLowerCase())) return null;
  const allowed = await syncPaths(docsRoot);
  if (!allowed.includes(relative)) return null;
  const absolute = path.resolve(docsRoot, relative);
  if (!absolute.startsWith(`${path.resolve(docsRoot)}${path.sep}`)) return null;
  const bytes = await readFile(absolute);
  return {
    absolute,
    bytes,
    hash: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
}

export async function syncManifest(docsRoot) {
  const result = [];
  for (const relative of await syncPaths(docsRoot)) {
    const file = await resolveSyncFile(docsRoot, relative);
    result.push({path: relative, hash: file.hash, size: file.size});
  }
  return result;
}
