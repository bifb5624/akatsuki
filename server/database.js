import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';

export const user=sqliteTable('user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),emailVerified:integer('emailVerified',{mode:'boolean'}).notNull(),image:text('image'),createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),role:text('role'),banned:integer('banned',{mode:'boolean'}),banReason:text('banReason'),banExpires:integer('banExpires',{mode:'timestamp_ms'}),
});
export const session=sqliteTable('session',{
 id:text('id').primaryKey(),expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(),token:text('token').notNull().unique(),createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),ipAddress:text('ipAddress'),userAgent:text('userAgent'),userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),impersonatedBy:text('impersonatedBy'),
});
export const account=sqliteTable('account',{
 id:text('id').primaryKey(),accountId:text('accountId').notNull(),providerId:text('providerId').notNull(),userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),accessToken:text('accessToken'),refreshToken:text('refreshToken'),idToken:text('idToken'),accessTokenExpiresAt:integer('accessTokenExpiresAt',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refreshTokenExpiresAt',{mode:'timestamp_ms'}),scope:text('scope'),password:text('password'),createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const verification=sqliteTable('verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(),createdAt:integer('createdAt',{mode:'timestamp_ms'}),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}),
});
export const rateLimit=sqliteTable('rateLimit',{
 id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('lastRequest',{mode:'number'}).notNull(),
});
export const authSchema={user,session,account,verification,rateLimit};

const schemaStatements=[
 `CREATE TABLE IF NOT EXISTS user(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,emailVerified INTEGER NOT NULL,image TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,role TEXT,banned INTEGER,banReason TEXT,banExpires INTEGER)`,
 `CREATE TABLE IF NOT EXISTS session(id TEXT PRIMARY KEY,expiresAt INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,ipAddress TEXT,userAgent TEXT,userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,impersonatedBy TEXT)`,
 `CREATE TABLE IF NOT EXISTS account(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,providerId TEXT NOT NULL,userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,accessToken TEXT,refreshToken TEXT,idToken TEXT,accessTokenExpiresAt INTEGER,refreshTokenExpiresAt INTEGER,scope TEXT,password TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS verification(id TEXT PRIMARY KEY,identifier TEXT NOT NULL,value TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER,updatedAt INTEGER)`,
 `CREATE TABLE IF NOT EXISTS rateLimit(id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,count INTEGER NOT NULL,lastRequest INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)`,
 `CREATE TABLE IF NOT EXISTS memberships(user_id TEXT PRIMARY KEY REFERENCES user(id),company_id TEXT NOT NULL REFERENCES companies(id),role TEXT NOT NULL CHECK(role IN ('admin','staff')),active INTEGER NOT NULL DEFAULT 1)`,
 `CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL,expires INTEGER NOT NULL,created_by TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS obsidian_devices(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT)`,
 `CREATE TABLE IF NOT EXISTS google_connections(company_id TEXT PRIMARY KEY REFERENCES companies(id),email TEXT NOT NULL,folder_id TEXT,encrypted_tokens TEXT NOT NULL,connected_by TEXT NOT NULL,connected_at TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS google_oauth_states(state_hash TEXT PRIMARY KEY,company_id TEXT NOT NULL,user_id TEXT NOT NULL,expires INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS google_files(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),export_id TEXT NOT NULL,drive_file_id TEXT NOT NULL,name TEXT NOT NULL,mime_type TEXT NOT NULL,sha256 TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(company_id,export_id))`,
 `CREATE TABLE IF NOT EXISTS setup_state(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL)`,
 `INSERT OR IGNORE INTO setup_state VALUES(1,'available')`,
];

export async function openDatabase({dataDir,url,authToken}){
 const localUrl=`file:${dataDir}/akatsuki.sqlite`;
 const remote=Boolean(url);
 if(remote&&!/^libsql:\/\//.test(url))throw Error('TURSO_DATABASE_URL must start with libsql://.');
 if(remote&&!authToken)throw Error('TURSO_AUTH_TOKEN is required when TURSO_DATABASE_URL is set.');
 const client=createClient({url:url||localUrl,authToken:remote?authToken:undefined});
 await client.batch(schemaStatements.map(sql=>({sql,args:[]})),'write');
 const store={
  remote,
  drizzle:drizzle(client,{schema:authSchema}),
  run:async(sql,...args)=>{const result=await client.execute({sql,args});return {changes:result.rowsAffected,lastInsertRowid:result.lastInsertRowid};},
  get:async(sql,...args)=>{const result=await client.execute({sql,args});return result.rows[0]||undefined;},
  all:async(sql,...args)=>(await client.execute({sql,args})).rows,
  batch:async(statements)=>client.batch(statements.map(item=>({sql:item.sql,args:item.args||[]})),'write'),
  close:()=>client.close(),
 };
 return store;
}
