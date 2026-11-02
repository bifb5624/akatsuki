import {createHash,randomBytes} from 'node:crypto';

const ROOT='https://www.googleapis.com';
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(value);
const mimeTypes=new Set(['application/pdf','image/jpeg','image/png']);
export class DriveConnectionError extends Error {
 constructor(message,{retryable=false,needsReconnect=false}={}){super(message);this.retryable=retryable;this.needsReconnect=needsReconnect;}
}
export function safeFileName(value){
 const name=String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f/\\]/g,'_').trim();
 if(!name||name==='.'||name==='..'||name.length>180)throw new Error('保存するファイル名を確認してください。');return name;
}
/** Server-side provider only. Connection authorization and encrypted token storage
 * must be implemented before exposing this through an application endpoint.
 * drive.file access supports app-created/explicitly selected files. It does NOT
 * grant automatic access to every receipt in an arbitrary existing folder.
 */
export class GoogleDriveFiles {
 constructor({getAccessToken,fetchImpl=fetch}){if(typeof getAccessToken!=='function')throw Error('A server-side token provider is required.');this.tokenProvider=getAccessToken;this.fetch=fetchImpl;}
 async request(url,options={},responseType='json'){
  for(let attempt=0;attempt<2;attempt++){
   const token=await this.tokenProvider({refresh:attempt===1});
   if(typeof token!=='string'||!token)throw new DriveConnectionError('Googleドライブに接続してください。',{needsReconnect:true});
   let response;
   try{response=await this.fetch(url,{...options,headers:{...options.headers,authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30_000)});}catch{throw new DriveConnectionError('Googleドライブに接続できませんでした。時間をおいてお試しください。',{retryable:true});}
   if(response.status===401&&attempt===0)continue;
   if(response.status===401)throw new DriveConnectionError('Googleドライブへの接続が切れました。接続し直してください。',{needsReconnect:true});
   if(response.status===403)throw new DriveConnectionError('保存先のアクセス権、空き容量、Google側の利用制限を確認してください。');
   if(response.status===404)throw new DriveConnectionError('保存先が見つかりません。フォルダを選び直してください。');
   if(response.status===429||response.status>=500)throw new DriveConnectionError('Googleドライブが混み合っています。時間をおいて再度お試しください。',{retryable:true});
   if(!response.ok)throw new DriveConnectionError('Googleドライブへの保存に失敗しました。');
   if(responseType==='bytes')return new Uint8Array(await response.arrayBuffer());
   const data=await response.json().catch(()=>{throw new DriveConnectionError('Googleドライブからの応答を確認できませんでした。',{retryable:true});});return data;
  }
 }
 async checkFolder(folderId){
  if(!identifier(folderId))throw Error('保存先フォルダを確認してください。');
  const data=await this.request(`${ROOT}/drive/v3/files/${folderId}?fields=id,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
  if(data.trashed||data.mimeType!=='application/vnd.google-apps.folder'||!data.capabilities?.canAddChildren)throw new DriveConnectionError('このフォルダには保存できません。保存先を選び直してください。');return data;
 }
 async ensureFolder(name,parentId='root'){
  const folderName=safeFileName(name);if(parentId!=='root'&&!identifier(parentId))throw Error('親フォルダを確認してください。');
  const quoted=folderName.replace(/'/g,"\\'");const query=new URLSearchParams({q:`'${parentId}' in parents and name = '${quoted}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,fields:'files(id,name)',pageSize:'2',spaces:'drive'});
  const found=await this.request(`${ROOT}/drive/v3/files?${query}`);if(found.files?.length)return found.files[0];
  return this.request(`${ROOT}/drive/v3/files?fields=id,name`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:folderName,parents:[parentId],mimeType:'application/vnd.google-apps.folder'})});
 }
 async ensureWorkflowFolders(){
  const root=await this.ensureFolder('暁 書類管理'),folders={};
  for(const stage of ['00_未処理','10_自動読取済み_要確認','20_目視確認済み','90_読取エラー'])folders[stage]=(await this.ensureFolder(stage,root.id)).id;
  const exports=await this.ensureFolder('アプリ作成PDF',root.id);return {root,folders,exports};
 }
 async listFiles(folderId){
  if(!identifier(folderId))throw Error('読取元フォルダを確認してください。');const query=new URLSearchParams({q:`'${folderId}' in parents and trashed = false`,fields:'files(id,name,mimeType,size,modifiedTime)',pageSize:'100',orderBy:'createdTime',spaces:'drive'});const result=await this.request(`${ROOT}/drive/v3/files?${query}`);return result.files||[];
 }
 async downloadFile(fileId){if(!identifier(fileId))throw Error('読取ファイルを確認してください。');return this.request(`${ROOT}/drive/v3/files/${fileId}?alt=media`,{},'bytes');}
 async moveFile({fileId,name,fromFolder,toFolder}){
  if(![fileId,fromFolder,toFolder].every(identifier))throw Error('移動するファイルとフォルダを確認してください。');const query=new URLSearchParams({addParents:toFolder,removeParents:fromFolder,fields:'id,name,parents'});return this.request(`${ROOT}/drive/v3/files/${fileId}?${query}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({name:safeFileName(name)})});
 }
 async saveFile({folderId,exportId,name,mimeType,bytes}){
  if(!identifier(folderId)||!identifier(exportId))throw Error('保存先と保存処理の識別子を確認してください。');
  if(!mimeTypes.has(mimeType))throw Error('保存できる形式はPDF・JPEG・PNGです。');
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>20*1024*1024)throw Error('ファイルは20MB以下で指定してください。');
  const filename=safeFileName(name),checksum=createHash('sha256').update(bytes).digest('hex');
  await this.checkFolder(folderId);
  const query=new URLSearchParams({q:`'${folderId}' in parents and trashed = false and appProperties has { key='akatsukiExportId' and value='${exportId}' }`,fields:'files(id,name,appProperties)',pageSize:'2',includeItemsFromAllDrives:'true',supportsAllDrives:'true'});
  const existing=await this.request(`${ROOT}/drive/v3/files?${query}`);
  if(existing.files?.length){
   if(existing.files.length!==1||existing.files[0].appProperties?.sha256!==checksum)throw new DriveConnectionError('同じ保存処理に異なるファイルが見つかりました。保存履歴を確認してください。');
   return this.result(existing.files[0],true);
  }
  const metadata={name:filename,parents:[folderId],mimeType,appProperties:{akatsukiExportId:exportId,sha256:checksum}};
  const boundary=`akatsuki_${randomBytes(24).toString('hex')}`;
  const contentType=`multipart/related; boundary=${boundary}`;
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,bytes,`\r\n--${boundary}--\r\n`],{type:contentType});
  const saved=await this.request(`${ROOT}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`,{method:'POST',headers:{'content-type':contentType},body});
  return this.result(saved,false);
 }
 result(file,reused){if(!identifier(file.id))throw new DriveConnectionError('保存結果を確認できませんでした。',{retryable:true});return {id:file.id,name:file.name,url:`https://drive.google.com/file/d/${file.id}/view`,reused};}
}
