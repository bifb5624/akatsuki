import Database from 'better-sqlite3';
import {mkdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openDatabase} from '../server/database.js';

process.umask(0o077);
const dataDir=path.resolve(process.env.APP_DATA_DIR||'.local');
const sourcePath=path.join(dataDir,'akatsuki.sqlite');
const url=process.env.TURSO_DATABASE_URL;
const authToken=process.env.TURSO_AUTH_TOKEN;
if(!url||!authToken)throw Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be configured securely before migration.');

const source=new Database(sourcePath,{fileMustExist:true,readonly:true});
const check=source.pragma('integrity_check',{simple:true});
if(check!=='ok')throw Error('The local SQLite integrity check failed. Migration stopped.');
const backupDir=path.join(dataDir,'backups');
await mkdir(backupDir,{recursive:true,mode:0o700});
const backupPath=path.join(backupDir,`before-turso-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
await source.backup(backupPath);await chmod(backupPath,0o600);

const target=await openDatabase({dataDir,url,authToken});
const tables=['user','companies','account','session','verification','rateLimit','memberships','invitations','activity','obsidian_devices','google_connections','setup_state'];
const normalize=value=>typeof value==='bigint'?value.toString():value;
const normalizedRows=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,normalize(value)])));
const hash=rows=>createHash('sha256').update(JSON.stringify(normalizedRows(rows))).digest('hex');
const quote=name=>`"${name.replaceAll('"','""')}"`;

try{
 const existingUsers=Number((await target.get('SELECT count(*) n FROM user')).n);
 const existingCompanies=Number((await target.get('SELECT count(*) n FROM companies')).n);
 if(existingUsers||existingCompanies)throw Error('Turso already contains users or companies. Migration stopped without overwriting data.');
 await target.run('DELETE FROM setup_state');
 const report=[];
 for(const table of tables){
  const rows=source.prepare(`SELECT * FROM ${quote(table)} ORDER BY rowid`).all();
  if(rows.length){
   const columns=Object.keys(rows[0]);
   const sql=`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;
   await target.batch(rows.map(row=>({sql,args:columns.map(column=>row[column])})));
  }
  const remoteRows=await target.all(`SELECT * FROM ${quote(table)} ORDER BY rowid`);
  if(remoteRows.length!==rows.length||hash(remoteRows)!==hash(rows))throw Error(`Verification failed for table ${table}.`);
  report.push(`${table}: ${rows.length}`);
 }
 console.log('Turso migration completed and verified. The local SQLite database was retained.');
 console.log(report.join('\n'));
 console.log(`Pre-migration backup: ${backupPath}`);
}finally{
 target.close();source.close();
}
