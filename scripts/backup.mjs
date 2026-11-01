import Database from 'better-sqlite3';
import {mkdir,chmod} from 'node:fs/promises';
import path from 'node:path';
process.umask(0o077);
if(process.env.TURSO_DATABASE_URL)throw Error('Remote Turso backup/export must be configured and verified separately; the local SQLite backup command was not run.');
const dir=path.resolve(process.env.APP_DATA_DIR||'.local');
const db=new Database(path.join(dir,'akatsuki.sqlite'),{fileMustExist:true});
const backupDir=path.join(dir,'backups');await mkdir(backupDir,{recursive:true,mode:0o700});
const file=path.join(backupDir,`${new Date().toISOString().replaceAll(':','-')}.sqlite`);
try{await db.backup(file);await chmod(file,0o600);const check=new Database(file,{readonly:true});if(check.pragma('integrity_check',{simple:true})!=='ok')throw Error('Backup verification failed');check.close();console.log('Database backup created and verified in the configured private data directory.');}finally{db.close();}
