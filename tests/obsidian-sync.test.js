import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {syncManifest, resolveSyncFile, validSyncPath} from '../server/obsidian-sync.js';

test('許可したノートと添付だけを同期対象にする', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'akatsuki-obsidian-'));
  await mkdir(path.join(root, 'images'));
  await writeFile(path.join(root, '引き継ぎ.md'), '# 引き継ぎ');
  await writeFile(path.join(root, 'secret.txt'), 'secret');
  await writeFile(path.join(root, 'images', 'screen.png'), 'png');
  const manifest = await syncManifest(root);
  assert.deepEqual(manifest.map(item => item.path), ['引き継ぎ.md', 'images/screen.png']);
  assert.equal((await resolveSyncFile(root, '引き継ぎ.md')).bytes.toString(), '# 引き継ぎ');
  assert.equal(await resolveSyncFile(root, 'secret.txt'), null);
});

test('パストラバーサルと絶対パスを拒否する', () => {
  for (const value of ['../secret.md', '/etc/passwd', 'images/../../secret.md', 'images\\screen.png', '']) {
    assert.equal(validSyncPath(value), false, value);
  }
  assert.equal(validSyncPath('images/screen.png'), true);
});
