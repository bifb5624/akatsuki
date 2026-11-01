import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import Database from 'better-sqlite3';
import {createApplication} from '../server/app.js';

test('実認証・招待・権限・共有保存・同時編集・退職・復元の統合検証',async t=>{
 const dataDir=await mkdtemp(path.join(tmpdir(),'akatsuki-auth-test-'));
 const origin='http://localhost:5173',secret=randomBytes(40).toString('hex'),setupToken=randomBytes(40).toString('hex'),password=randomBytes(20).toString('base64url');
 const googleFetch=async url=>{if(String(url).includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'google-access',refresh_token:'google-refresh',expires_in:3600}),{status:200});if(String(url).includes('openidconnect.googleapis.com'))return new Response(JSON.stringify({email:'drive-owner@example.test',email_verified:true}),{status:200});return new Response(JSON.stringify({id:'folder',mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{canAddChildren:true}}),{status:200});};
 const service=await createApplication({dataDir,origin,secret,setupToken,serveFiles:false,googleClientId:'google-client',googleClientSecret:'google-secret',dataKey:'d'.repeat(48),googleFetch});
 const server=service.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const client=()=>({cookie:''});const owner=client(),employee=client(),stranger=client();
 async function call(user,url,body,overrides={}){const response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json','origin':origin,'x-akatsuki-request':'1'}),...(user.cookie?{cookie:user.cookie}:{}),...overrides},body:body===undefined?undefined:JSON.stringify(body)});const cookies=response.headers.getSetCookie();if(cookies.length)user.cookie=cookies.map(c=>c.split(';')[0]).join('; ');return {status:response.status,data:await response.json()};}
 const signIn=(c,email)=>call(c,'/api/auth/sign-in/email',{email,password});
 let ownerId,employeeId;
 try{
 await t.test('未ログインと外部サイトからの操作を拒否、公開の新規登録を禁止',async()=>{
 assert.equal((await call(owner,'/api/workspace')).status,401);
 assert.equal((await call(owner,'/api/setup',{name:'管理者',email:'owner@example.test',password,company:'試験会社',token:setupToken},{origin:'https://evil.invalid'})).status,403);
 assert.equal((await call(owner,'/api/auth/sign-up/email',{name:'侵入者',email:'other@example.test',password})).status,404);
 assert.equal((await call(owner,'/api/auth/admin/create-user',{name:'侵入者',email:'other@example.test',password})).status,404);
 });
 await t.test('一度だけ初期登録し、パスワードをハッシュ化してログイン',async()=>{
 const result=await call(owner,'/api/setup',{name:'管理者',email:'owner@example.test',password,company:'試験会社',token:setupToken});assert.equal(result.status,201,JSON.stringify(result.data));
 assert.equal((await call(owner,'/api/setup',{name:'管理者',email:'owner@example.test',password,company:'試験会社',token:setupToken})).status,409);
 assert.equal((await signIn(owner,'owner@example.test')).status,200);
 const current=await call(owner,'/api/workspace');assert.equal(current.status,200);ownerId=current.data.actor;
 const account=service.db.prepare("SELECT password FROM account WHERE userId=? AND providerId='credential'").get(ownerId);assert.notEqual(account.password,password);assert.ok(account.password.length>40);
 assert.match(owner.cookie,/session_token/);
 });
 await t.test('招待から本人が登録、使用済み・期限切れ・取消リンクを拒否',async()=>{
 const invite=await call(owner,'/api/invitations',{name:'社員A',email:'employee@example.test',role:'staff'});assert.equal(invite.status,201);
 const token=new URLSearchParams(new URL(invite.data.url).hash.slice(1)).get('invite');
 assert.ok(!JSON.stringify(service.db.prepare('SELECT * FROM invitations').all()).includes(token));
 assert.equal((await call(employee,'/api/invitations/accept',{token,password})).status,201);
 assert.equal((await call(employee,'/api/invitations/accept',{token,password})).status,400);
 assert.equal((await signIn(employee,'employee@example.test')).status,200);
 employeeId=(await call(employee,'/api/workspace')).data.actor;
 for(const mode of ['expired','revoked']){const next=await call(owner,'/api/invitations',{name:'試験',email:`${mode}@example.test`,role:'staff'});const nextToken=new URLSearchParams(new URL(next.data.url).hash.slice(1)).get('invite');if(mode==='expired')service.db.prepare('UPDATE invitations SET expires=0 WHERE id=?').run(next.data.id);else await call(owner,'/api/invitations/revoke',{id:next.data.id});assert.equal((await call(stranger,'/api/invitations/accept',{token:nextToken,password})).status,400);}
 });
 await t.test('Obsidianの読み取り専用コードを発行・同期・停止',async()=>{
 const created=await call(owner,'/api/obsidian/devices',{name:'Mac 暁'});assert.equal(created.status,201);assert.ok(created.data.token.length>=32);
 const index=await fetch(`${base}/api/obsidian/sync/index`,{headers:{authorization:`Bearer ${created.data.token}`}});assert.equal(index.status,200);const manifest=await index.json();assert.ok(manifest.files.some(file=>file.path==='引き継ぎ.md'));
 const note=await fetch(`${base}/api/obsidian/sync/file?path=${encodeURIComponent('引き継ぎ.md')}`,{headers:{authorization:`Bearer ${created.data.token}`}});assert.equal(note.status,200);assert.match(await note.text(),/次の作業はここから/);
 assert.equal((await fetch(`${base}/api/obsidian/sync/file?path=${encodeURIComponent('../package.json')}`,{headers:{authorization:`Bearer ${created.data.token}`}})).status,404);
 assert.equal((await call(employee,'/api/obsidian/devices',{name:'禁止'})).status,403);
 assert.equal((await call(owner,'/api/obsidian/devices/revoke',{id:created.data.id})).status,200);
 assert.equal((await fetch(`${base}/api/obsidian/sync/index`,{headers:{authorization:`Bearer ${created.data.token}`}})).status,401);
 });
 await t.test('管理者だけがGoogleドライブを接続・保存先設定・解除できる',async()=>{
  const initial=await call(owner,'/api/google/status');assert.equal(initial.status,200);assert.equal(initial.data.configured,true);assert.equal(initial.data.connected,false);
  assert.equal((await call(employee,'/api/google/connect',{})).status,403);
  const connect=await call(owner,'/api/google/connect',{});assert.equal(connect.status,200);const authorization=new URL(connect.data.url);const state=authorization.searchParams.get('state');assert.match(authorization.searchParams.get('scope'),/drive\.file/);
  const callback=await fetch(`${base}/api/google/callback?code=authorization-code&state=${encodeURIComponent(state)}`,{headers:{cookie:owner.cookie},redirect:'manual'});assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),' /#google=connected'.trim());
  const connected=await call(owner,'/api/google/status');assert.equal(connected.data.email,'drive-owner@example.test');assert.equal(connected.data.connected,true);
  const encrypted=service.db.prepare('SELECT encrypted_tokens FROM google_connections').get().encrypted_tokens;assert.ok(!encrypted.includes('google-access'));assert.ok(!encrypted.includes('google-refresh'));
  assert.equal((await call(owner,'/api/google/folder',{folderId:'folder'})).status,200);assert.equal((await call(owner,'/api/google/status')).data.folderId,'folder');
  assert.equal((await call(owner,'/api/google/disconnect',{})).status,200);assert.equal((await call(owner,'/api/google/status')).data.connected,false);
 });
 await t.test('共有予定が別の社員にも見え、古い版による上書きを拒否',async()=>{
 const current=(await call(owner,'/api/workspace')).data;
 const payload={title:'共有する点検',date:'2026-11-10',time:'10:00',kind:'予定',category:'ビル点検',building:'渋谷',member:employeeId,note:'',done:false};
 const results=await Promise.all([call(owner,'/api/commands',{revision:current.revision,operation:'event.save',payload}),call(employee,'/api/commands',{revision:current.revision,operation:'event.save',payload:{...payload,title:'同時編集'}})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const staff=(await call(employee,'/api/workspace')).data;assert.equal(staff.state.events.length,1);
 assert.equal((await call(employee,'/api/commands',{revision:staff.revision,operation:'event.save',payload:{...payload,member:'unknown'}})).status,400);
 });
 await t.test('社員の管理者操作と他人のシフト変更をサーバーで拒否、半休を承認',async()=>{
 let current=(await call(owner,'/api/workspace')).data;
 assert.equal((await call(employee,'/api/invitations',{name:'別人',email:'bad@example.test',role:'admin'})).status,403);
 assert.equal((await call(employee,'/api/commands',{revision:current.revision,operation:'grant.save',payload:{member:employeeId,start:'2026-01-01',end:'2026-12-31',days:10}})).status,403);
 let result=await call(owner,'/api/commands',{revision:current.revision,operation:'grant.save',payload:{member:employeeId,start:'2026-01-01',end:'2026-12-31',days:.5}});assert.equal(result.status,200);current=result.data;
 assert.equal((await call(employee,'/api/commands',{revision:current.revision,operation:'shift.save',payload:{member:ownerId,date:'2026-11-10',type:'paid'}})).status,400);
 assert.equal((await call(employee,'/api/commands',{revision:current.revision,operation:'shift.save',payload:{member:employeeId,date:'2026-11-10',type:'paid'}})).status,400);
 result=await call(employee,'/api/commands',{revision:current.revision,operation:'shift.save',payload:{member:employeeId,date:'2026-11-10',type:'am'}});assert.equal(result.status,200);current=result.data;const id=current.state.shifts[0].id;
 assert.equal((await call(employee,'/api/commands',{revision:current.revision,operation:'shift.review',payload:{id,status:'approved'}})).status,403);
 result=await call(owner,'/api/commands',{revision:current.revision,operation:'shift.review',payload:{id,status:'approved'}});assert.equal(result.status,200);assert.equal(result.data.state.shifts[0].status,'approved');
 });
 await t.test('別会社の予定や社員へアクセスできない',async()=>{
 const {user}=await service.auth.api.createUser({body:{name:'別会社',email:'outsider@example.test',password,role:'user'}});
 service.db.prepare('INSERT INTO companies VALUES(?,?,?,0)').run('other-company','別会社',JSON.stringify({version:1,events:[],shifts:[],grants:[],assets:[],audit:[]}));service.db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').run(user.id,'other-company','admin');
 assert.equal((await signIn(stranger,'outsider@example.test')).status,200);
 const foreign=(await call(stranger,'/api/workspace')).data;assert.equal(foreign.state.events.length,0);assert.equal(foreign.members.length,1);
 assert.equal((await call(stranger,'/api/members/disable',{id:employeeId})).status,404);
 const event=(await call(owner,'/api/workspace')).data.state.events[0];assert.equal((await call(stranger,'/api/commands',{revision:0,operation:'event.delete',payload:{id:event.id}})).status,404);
 });
 await t.test('退職者の既存セッションと再ログインを停止し、履歴の名前を保持',async()=>{
 assert.equal((await call(owner,'/api/members/disable',{id:ownerId})).status,403);
 assert.equal((await call(owner,'/api/members/disable',{id:employeeId})).status,200);
 assert.equal((await call(employee,'/api/workspace')).status,401);
 assert.ok((await signIn(employee,'employee@example.test')).status>=400);
 const data=(await call(owner,'/api/workspace')).data;assert.equal(data.members.find(m=>m.id===employeeId).name,'社員A');assert.equal(data.state.shifts.length,1);
 assert.equal(service.db.prepare('SELECT count(*) n FROM session WHERE userId=?').get(employeeId).n,0);
 });
 await t.test('オンラインバックアップを復元し、共有データと監査記録を確認',async()=>{
 const copy=path.join(dataDir,'backup.sqlite');await service.db.backup(copy);const restored=new Database(copy);assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');assert.ok(restored.prepare('SELECT count(*) n FROM activity').get().n>=6);assert.equal(JSON.parse(restored.prepare('SELECT state FROM companies WHERE id<>?').get('other-company').state).shifts.length,1);restored.close();
 const restoreDir=path.join(dataDir,'restored');await mkdir(restoreDir);const {copyFile}=await import('node:fs/promises');await copyFile(copy,path.join(restoreDir,'akatsuki.sqlite'));const restoredApp=await createApplication({dataDir:restoreDir,origin,secret,setupToken,serveFiles:false});assert.equal(restoredApp.db.prepare('SELECT count(*) n FROM memberships').get().n,3);restoredApp.close();
 });
 }finally{await new Promise(resolve=>server.close(resolve));service.close();await rm(dataDir,{recursive:true,force:true});}
});
