import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase} from '../server/database.js';

test('libSQL共通層で初期化・書込・一括処理を行う',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'akatsuki-libsql-'));
 const db=await openDatabase({dataDir});
 try{
  assert.equal((await db.get('SELECT status FROM setup_state WHERE id=1')).status,'available');
  await db.batch([{sql:'INSERT INTO companies VALUES(?,?,?,0)',args:['company','試験会社','{"version":1}']},{sql:"UPDATE setup_state SET status='complete' WHERE id=1"}]);
  assert.equal((await db.get('SELECT name FROM companies WHERE id=?','company')).name,'試験会社');
  assert.equal((await db.get('SELECT status FROM setup_state WHERE id=1')).status,'complete');
 }finally{db.close();await rm(dataDir,{recursive:true,force:true});}
});

test('Turso接続情報の不足と不正なURLを接続前に拒否する',async()=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'akatsuki-turso-config-'));
 try{
  await assert.rejects(openDatabase({dataDir,url:'https://example.test',authToken:'secret'}),/libsql:\/\//);
  await assert.rejects(openDatabase({dataDir,url:'libsql://example.test'}),/TURSO_AUTH_TOKEN/);
 }finally{await rm(dataDir,{recursive:true,force:true});}
});
