import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GoogleDriveFiles,safeFileName,DriveConnectionError} from '../server/google-drive.js';
const bytes=new TextEncoder().encode('%PDF-1.7 fictional test file');
const folder={id:'folder',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}};
const payload={folderId:'folder',exportId:'export-1',name:'有給管理.pdf',mimeType:'application/pdf',bytes};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
test('指定フォルダと保存識別子を付けてPDFを送信する',async()=>{
 const calls=[];const drive=new GoogleDriveFiles({getAccessToken:async()=> 'test-access',fetchImpl:async(url,options)=>{calls.push({url,options});if(calls.length===1)return response(folder);if(calls.length===2)return response({files:[]});return response({id:'file123',name:payload.name});}});
 const saved=await drive.saveFile(payload);assert.equal(saved.url,'https://drive.google.com/file/d/file123/view');assert.equal(saved.reused,false);
 const upload=calls[2];assert.equal(upload.options.method,'POST');assert.match(upload.options.headers['content-type'],/^multipart\/related; boundary=/);const body=await upload.options.body.text();const metadata=JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0]);assert.deepEqual(metadata.parents,['folder']);assert.equal(metadata.appProperties.akatsukiExportId,'export-1');assert.equal(metadata.appProperties.sha256,createHash('sha256').update(bytes).digest('hex'));assert.ok(body.includes(new TextDecoder().decode(bytes)));assert.ok(body.endsWith('--\r\n'));
});
test('同じ保存処理の再試行は既存ファイルを再利用する',async()=>{
 let calls=0;const drive=new GoogleDriveFiles({getAccessToken:async()=> 'test-access',fetchImpl:async()=>++calls===1?response(folder):response({files:[{id:'existing',name:payload.name,appProperties:{sha256:createHash('sha256').update(bytes).digest('hex')}}]})});
 assert.equal((await drive.saveFile(payload)).reused,true);assert.equal(calls,2);
});
test('書類管理フォルダを重複させず作成する',async()=>{
 const calls=[];const drive=new GoogleDriveFiles({getAccessToken:async()=> 'test-access',fetchImpl:async(url,options={})=>{calls.push({url,options});if(options.method==='POST')return response({id:'created-folder',name:'暁 書類管理'});return response({files:[]});}});
 const folder=await drive.ensureFolder('暁 書類管理');assert.equal(folder.id,'created-folder');assert.equal(calls.length,2);assert.equal(calls[1].options.method,'POST');assert.match(calls[1].options.body,/google-apps.folder/);
});
test('期限切れトークンは一度だけ更新し、アクセス拒否を隠さない',async()=>{
 const refresh=[];let calls=0;const drive=new GoogleDriveFiles({getAccessToken:async options=>{refresh.push(options.refresh);return 'test-access';},fetchImpl:async()=>++calls===1?response({},401):response({},403)});
 await assert.rejects(()=>drive.checkFolder('folder'),error=>error instanceof DriveConnectionError&&!error.retryable);assert.deepEqual(refresh,[false,true]);
});
test('読取専用フォルダ・不正な識別子・大きすぎるファイルを拒否する',async()=>{
 const drive=new GoogleDriveFiles({getAccessToken:async()=> 'test-access',fetchImpl:async()=>response({...folder,capabilities:{canAddChildren:false}})});
 await assert.rejects(()=>drive.saveFile(payload),/保存できません/);
 await assert.rejects(()=>drive.saveFile({...payload,folderId:"folder' or true"}));
 await assert.rejects(()=>drive.saveFile({...payload,bytes:new Uint8Array(21*1024*1024)}));
 assert.equal(safeFileName('2026/11\\領収書.pdf'),'2026_11_領収書.pdf');
});
