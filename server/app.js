import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import Database from 'better-sqlite3';
import {betterAuth} from 'better-auth';
import {admin} from 'better-auth/plugins';
import {getMigrations} from 'better-auth/db/migration';
import {toNodeHandler,fromNodeHeaders} from 'better-auth/node';
import {z} from 'zod';
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,chmod} from 'node:fs/promises';
import path from 'node:path';
import {setShift,reviewShift,setGrant,leaveUnits} from '../src/team.js';
import {addMonths,japanToday} from '../src/schedule.js';
import {syncManifest,resolveSyncFile} from './obsidian-sync.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
const text=(max=100)=>z.string().trim().min(1).max(max);
const date=z.string().refine(v=>!!addMonths(v,0),'日付を確認してください');
const email=z.email().max(254).transform(v=>v.toLowerCase());
const password=z.string().min(12).max(128);
const accountInput=z.object({name:text(80),email,password}).strict();
const eventInput=z.object({id:z.string().optional(),title:text(),date,time:z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),kind:z.enum(['予定','タスク']),category:z.enum(['来客対応','ビル点検','メーター検査','その他']),building:text(80),member:text(),note:z.string().max(1000),done:z.boolean()}).strict();
const assetInput=z.object({name:text(),building:text(80),floor:text(30),category:text(40),installed:z.union([z.literal(''),date]),months:z.number().int().min(0).max(1200),note:z.string().max(500)}).strict();
class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
const deny=(message='この操作は許可されていません。')=>{throw new AppError(403,message);};
export async function createApplication({dataDir,origin,secret,setupToken,serveFiles=true,trustProxyHops=0}){
 if(!secret||secret.length<32||!setupToken||setupToken.length<32)throw Error('Authentication secrets must contain at least 32 characters.');
 const publicOrigin=new URL(origin).origin;
 if(process.env.NODE_ENV==='production'&&!publicOrigin.startsWith('https://'))throw Error('Production requires an HTTPS APP_ORIGIN.');
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const db=new Database(path.join(dataDir,'akatsuki.sqlite'));await chmod(path.join(dataDir,'akatsuki.sqlite'),0o600);
 db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');db.pragma('busy_timeout = 5000');
 const authOptions={database:db,secret,baseURL:publicOrigin,trustedOrigins:[publicOrigin],emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12,maxPasswordLength:128},plugins:[admin()],session:{expiresIn:60*60*12,updateAge:60*30,cookieCache:{enabled:false}},advanced:{useSecureCookies:publicOrigin.startsWith('https://')},rateLimit:{enabled:true,storage:'database',window:60,max:30},logger:{level:'error'}};
 await (await getMigrations(authOptions)).runMigrations();
 const auth=betterAuth(authOptions);
 const authContext=await auth.$context;
 await authContext.checkSchema?.();
 db.exec(`CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS memberships(user_id TEXT PRIMARY KEY REFERENCES user(id),company_id TEXT NOT NULL REFERENCES companies(id),role TEXT NOT NULL CHECK(role IN ('admin','staff')),active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS invitations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,status TEXT NOT NULL,expires INTEGER NOT NULL,created_by TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS obsidian_devices(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT);
 CREATE TABLE IF NOT EXISTS setup_state(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL);
 INSERT OR IGNORE INTO setup_state VALUES(1,'available');`);
 if(![0,1].includes(trustProxyHops))throw Error('Invalid proxy configuration');
 const app=express();app.disable('x-powered-by');
 if(trustProxyHops)app.set('trust proxy',trustProxyHops);
 app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],fontSrc:["'self'"],imgSrc:["'self'",'data:'],connectSrc:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:publicOrigin.startsWith('https://')?[]:null}},referrerPolicy:{policy:'no-referrer'}}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const limiter=limit=>rateLimit({windowMs:60_000,limit,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'操作が続いています。少し待ってからお試しください。'}});
 const authLimit=limiter(20),actionLimit=limiter(40),obsidianLimit=limiter(120);
 // Only the authentication endpoints used by this app are reachable over HTTP.
 app.use('/api/auth',authLimit,(req,res,next)=>{const allowed=['/sign-in/email','/sign-out','/get-session','/change-password'];if(!allowed.includes(req.path))return res.status(404).json({error:'利用できない操作です。'});next();});
 app.all('/api/auth/{*path}',toNodeHandler(auth));
 app.use(express.json({limit:'256kb'}));
 app.use('/api',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&(req.get('origin')!==publicOrigin||req.get('x-akatsuki-request')!=='1'))return res.status(403).json({error:'画面を開き直してお試しください。'});next();});
 const log=(company,actor,action,details={})=>db.prepare('INSERT INTO activity VALUES(?,?,?,?,?,?)').run(randomUUID(),company,actor,action,JSON.stringify(details),new Date().toISOString());
 const directory=company=>db.prepare('SELECT u.id,u.name,u.email,m.role,m.active FROM memberships m JOIN user u ON u.id=m.user_id WHERE m.company_id=? ORDER BY u.createdAt,u.id').all(company);
 const companyState=company=>{const row=db.prepare('SELECT * FROM companies WHERE id=?').get(company);return {...row,state:JSON.parse(row.state)};};
 const sessionMember=async req=>{const session=await auth.api.getSession({headers:fromNodeHeaders(req.headers)});if(!session)throw new AppError(401,'ログインしてください。');const member=db.prepare('SELECT * FROM memberships WHERE user_id=? AND active=1').get(session.user.id);if(!member)throw new AppError(401,'このアカウントは利用できません。');return {...member,name:session.user.name};};
 const requireAdmin=m=>{if(m.role!=='admin')deny();};
 const docsRoot=path.resolve('docs');
 const obsidianDevice=req=>{
  const match=req.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/);
  if(!match)throw new AppError(401,'Obsidianの接続コードを確認してください。');
  const device=db.prepare('SELECT d.* FROM obsidian_devices d JOIN memberships m ON m.company_id=d.company_id WHERE d.token_hash=? AND d.active=1 AND m.active=1 AND m.role=? LIMIT 1').get(digest(match[1]),'admin');
  if(!device)throw new AppError(401,'Obsidianの接続コードが無効です。管理者が再発行してください。');
  db.prepare('UPDATE obsidian_devices SET last_used_at=? WHERE id=?').run(new Date().toISOString(),device.id);
  return device;
 };
 const snapshot=m=>{const company=companyState(m.company_id);const all=directory(m.company_id);return {actor:m.user_id,company:company.name,revision:company.revision,members:all.map(user=>m.role==='admin'||user.id===m.user_id?user:(({email,...rest})=>rest)(user)),state:{...company.state,grants:company.state.grants.filter(g=>m.role==='admin'||g.member===m.user_id),audit:[]}};};
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/status',(_req,res)=>res.json({initialized:db.prepare('SELECT status FROM setup_state WHERE id=1').get().status!=='available',emailDelivery:false}));
 app.post('/api/setup',actionLimit,async(req,res)=>{
 const input=accountInput.extend({company:text(),token:text(256)}).parse(req.body);
 if(!timingSafeEqual(Buffer.from(digest(input.token)),Buffer.from(digest(setupToken))))deny('初期設定用の確認コードが一致しません。');
 if(!db.prepare("UPDATE setup_state SET status='processing' WHERE id=1 AND status='available'").run().changes)throw new AppError(409,'初期設定は完了済み、または実行中です。');
 try{const {user}=await auth.api.createUser({body:{name:input.name,email:input.email,password:input.password,role:'user'}});
 const company=randomUUID();db.transaction(()=>{db.prepare('INSERT INTO companies VALUES(?,?,?,0)').run(company,input.company,JSON.stringify({version:1,events:[],shifts:[],grants:[],assets:[],audit:[]}));db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').run(user.id,company,'admin');db.prepare("UPDATE setup_state SET status='complete' WHERE id=1").run();log(company,user.id,'company_created');})();res.status(201).json({ok:true});
 }catch(error){db.prepare("UPDATE setup_state SET status='available' WHERE id=1 AND status='processing'").run();throw error;}
 });
 app.get('/api/workspace',async(req,res)=>res.json(snapshot(await sessionMember(req))));
 app.post('/api/commands',async(req,res)=>{
 const m=await sessionMember(req);const {revision,operation,payload}=z.object({revision:z.number().int().min(0),operation:text(),payload:z.unknown()}).strict().parse(req.body);
 db.transaction(()=>{
 const company=companyState(m.company_id);if(company.revision!==revision)throw new AppError(409,'他の人が更新しました。入力内容を控え、最新の情報を読み込んでから登録してください。');
 let next=company.state;const all=directory(m.company_id);const active=id=>all.some(u=>u.id===id&&u.active);let detail={};
 switch(operation){
 case 'event.save':{const item=eventInput.parse(payload);if(!active(item.member))throw new AppError(400,'担当者を選び直してください。');if(item.id&&!next.events.some(e=>e.id===item.id))throw new AppError(404,'予定が見つかりません。');const entry={...item,id:item.id||randomUUID()};next={...next,events:[...next.events.filter(e=>e.id!==entry.id),entry]};detail={id:entry.id};break;}
 case 'event.delete':{const {id}=z.object({id:text()}).strict().parse(payload);if(!next.events.some(e=>e.id===id))throw new AppError(404,'予定が見つかりません。');next={...next,events:next.events.filter(e=>e.id!==id)};detail={id};break;}
 case 'shift.save':{const item=z.object({member:text(),date,type:z.enum(['work','off','paid','am','pm'])}).strict().parse(payload);next=setShift(next,m.user_id,item);detail=item;break;}
 case 'shift.cancel':{const {id}=z.object({id:text()}).strict().parse(payload);const existing=next.shifts.find(s=>s.id===id);if(!existing||existing.member!==m.user_id)deny();next={...next,shifts:next.shifts.filter(s=>s.id!==id)};detail={before:existing};break;}
 case 'shift.review':{requireAdmin(m);const item=z.object({id:text(),status:z.enum(['approved','rejected'])}).strict().parse(payload);next=reviewShift(next,m.user_id,item.id,item.status,all);detail=item;break;}
 case 'grant.save':{requireAdmin(m);const item=z.object({member:text(),start:date,end:date,days:z.number()}).strict().parse(payload);if(!active(item.member))throw new AppError(400,'利用中の社員を選んでください。');next=setGrant(next,m.user_id,item,all);detail=item;break;}
 case 'asset.create':{const item=assetInput.parse(payload);if(item.installed>japanToday())throw new AppError(400,'設置日を確認してください。');const asset={...item,id:randomUUID(),history:[]};next={...next,assets:[...next.assets,asset]};detail={id:asset.id};break;}
 case 'asset.record':{const item=z.object({id:text(),date,worker:text(80),witness:z.string().max(80)}).strict().parse(payload);if(item.date>japanToday())throw new AppError(400,'交換日を確認してください。');if(!next.assets.some(a=>a.id===item.id))throw new AppError(404,'設備が見つかりません。');next={...next,assets:next.assets.map(a=>a.id===item.id?{...a,history:[...a.history,{date:item.date,worker:item.worker,witness:item.witness,recordedBy:m.user_id,recordedAt:new Date().toISOString()}]}:a)};detail=item;break;}
 case 'asset.cycle':{const item=z.object({id:text(),months:z.number().int().min(1).max(1200),note:text(500)}).strict().parse(payload);if(!next.assets.some(a=>a.id===item.id))throw new AppError(404,'設備が見つかりません。');next={...next,assets:next.assets.map(a=>a.id===item.id?{...a,months:item.months,note:item.note}:a)};detail=item;break;}
 default:throw new AppError(400,'利用できない操作です。');
 }
 next.audit=[];db.prepare('UPDATE companies SET state=?,revision=revision+1 WHERE id=?').run(JSON.stringify(next),m.company_id);log(m.company_id,m.user_id,operation,detail);
 })();res.json(snapshot(m));
 });
 app.get('/api/invitations',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);res.json(db.prepare('SELECT id,name,email,role,status,expires FROM invitations WHERE company_id=? ORDER BY expires DESC').all(m.company_id));});
 app.post('/api/invitations',actionLimit,async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);const input=z.object({name:text(80),email,role:z.enum(['admin','staff'])}).strict().parse(req.body);if(db.prepare('SELECT id FROM user WHERE email=?').get(input.email))throw new AppError(409,'このメールアドレスは登録済みです。');const token=randomBytes(32).toString('base64url'),id=randomUUID(),expires=Date.now()+48*3600_000;
 db.transaction(()=>{db.prepare("UPDATE invitations SET status='revoked' WHERE company_id=? AND email=? AND status='pending'").run(m.company_id,input.email);db.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?,?,?,?)').run(id,m.company_id,input.name,input.email,input.role,digest(token),'pending',expires,m.user_id);log(m.company_id,m.user_id,'invitation_created',{id,email:input.email});})();res.status(201).json({id,url:`${publicOrigin}/#invite=${token}`,expires,emailDelivery:false});});
 app.post('/api/invitations/revoke',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);const {id}=z.object({id:text()}).strict().parse(req.body);if(!db.prepare("UPDATE invitations SET status='revoked' WHERE id=? AND company_id=? AND status='pending'").run(id,m.company_id).changes)throw new AppError(404,'招待が見つかりません。');log(m.company_id,m.user_id,'invitation_revoked',{id});res.json({ok:true});});
 app.post('/api/invitations/accept',actionLimit,async(req,res)=>{
 const {token,password:pw}=z.object({token:text(256),password}).strict().parse(req.body);const invitation=db.prepare("SELECT * FROM invitations WHERE token_hash=? AND status='pending' AND expires>?").get(digest(token),Date.now());
 if(!invitation)throw new AppError(400,'招待の期限が切れているか、使用済みです。管理者に再発行を依頼してください。');
 if(!db.prepare("UPDATE invitations SET status='processing' WHERE id=? AND status='pending'").run(invitation.id).changes)throw new AppError(409,'この招待は処理中です。');
 try{const {user}=await auth.api.createUser({body:{name:invitation.name,email:invitation.email,password:pw,role:'user'}});
 db.transaction(()=>{db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').run(user.id,invitation.company_id,invitation.role);db.prepare("UPDATE invitations SET status='accepted' WHERE id=?").run(invitation.id);log(invitation.company_id,user.id,'invitation_accepted',{id:invitation.id});})();res.status(201).json({ok:true,email:invitation.email});
 }catch(error){db.prepare("UPDATE invitations SET status='pending' WHERE id=? AND status='processing'").run(invitation.id);throw error;}
 });
 app.post('/api/members/disable',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);const {id}=z.object({id:text()}).strict().parse(req.body);const target=db.prepare('SELECT * FROM memberships WHERE user_id=? AND company_id=? AND active=1').get(id,m.company_id);if(!target)throw new AppError(404,'社員が見つかりません。');if(id===m.user_id)deny('自分のアカウントは停止できません。');
 db.transaction(()=>{const current=db.prepare('SELECT active FROM memberships WHERE user_id=?').get(m.user_id);if(!current?.active)deny();if(target.role==='admin'&&db.prepare("SELECT count(*) n FROM memberships WHERE company_id=? AND role='admin' AND active=1").get(m.company_id).n<=1)deny('最後の管理者は停止できません。');db.prepare('UPDATE memberships SET active=0 WHERE user_id=?').run(id);db.prepare('UPDATE user SET banned=1,banReason=? WHERE id=?').run('Account disabled by company administrator',id);db.prepare('DELETE FROM session WHERE userId=?').run(id);db.prepare('UPDATE companies SET revision=revision+1 WHERE id=?').run(m.company_id);log(m.company_id,m.user_id,'member_disabled',{id});})();res.json(snapshot(m));});
 app.get('/api/activity',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);res.json(db.prepare('SELECT actor,action,created_at FROM activity WHERE company_id=? ORDER BY created_at DESC LIMIT 100').all(m.company_id));});
 app.get('/api/obsidian/devices',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);res.json(db.prepare('SELECT id,name,active,created_at,last_used_at FROM obsidian_devices WHERE company_id=? ORDER BY created_at DESC').all(m.company_id));});
 app.post('/api/obsidian/devices',actionLimit,async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);const {name}=z.object({name:text(80)}).strict().parse(req.body);const token=randomBytes(32).toString('base64url'),id=randomUUID(),createdAt=new Date().toISOString();db.prepare('INSERT INTO obsidian_devices(id,company_id,name,token_hash,active,created_by,created_at,last_used_at) VALUES(?,?,?,?,1,?,?,NULL)').run(id,m.company_id,name,digest(token),m.user_id,createdAt);log(m.company_id,m.user_id,'obsidian_device_created',{id,name});res.status(201).json({id,token});});
 app.post('/api/obsidian/devices/revoke',async(req,res)=>{const m=await sessionMember(req);requireAdmin(m);const {id}=z.object({id:text()}).strict().parse(req.body);if(!db.prepare('UPDATE obsidian_devices SET active=0 WHERE id=? AND company_id=? AND active=1').run(id,m.company_id).changes)throw new AppError(404,'Obsidian接続が見つかりません。');log(m.company_id,m.user_id,'obsidian_device_revoked',{id});res.json({ok:true});});
 app.get('/api/obsidian/sync/index',obsidianLimit,async(req,res)=>{const device=obsidianDevice(req);res.json({version:1,companyId:device.company_id,files:await syncManifest(docsRoot)});});
 app.get('/api/obsidian/sync/file',obsidianLimit,async(req,res)=>{obsidianDevice(req);const file=await resolveSyncFile(docsRoot,req.query.path);if(!file)throw new AppError(404,'同期ファイルが見つかりません。');const extension=path.extname(req.query.path).toLowerCase();const types={'.md':'text/markdown; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.pdf':'application/pdf'};res.type(types[extension]||'application/octet-stream');res.set('ETag',`"${file.hash}"`);res.send(file.bytes);});
 app.use('/api',(_req,res)=>res.status(404).json({error:'利用できない操作です。'}));
 if(serveFiles){app.use(express.static(path.resolve('dist'),{index:false}));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
 app.use((error,_req,res,_next)=>{if(error instanceof z.ZodError)return res.status(400).json({error:'入力内容を確認してください。パスワードは12文字以上、必須項目も確認してください。'});const status=error.status&&Number.isInteger(error.status)?error.status:error.statusCode&&Number.isInteger(error.statusCode)?error.statusCode:400;res.status(status>=400&&status<600?status:400).json({error:error instanceof AppError||(!error.status&&!error.statusCode&&error.message?.match(/有給|日付|管理者|申請|シフト|期間|操作|日数/))?error.message:'処理できませんでした。入力内容を確認して再度お試しください。'});});
 return {app,db,auth,close:()=>db.close()};
}
