import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GoogleOAuth,encryptTokens,decryptTokens} from '../server/google-oauth.js';

test('Googleトークンを認証付き暗号で保存し、改ざんを拒否する',()=>{
 const dataKey='k'.repeat(48),tokens={access_token:'access',refresh_token:'refresh',expires_at:123};
 const encrypted=encryptTokens(tokens,dataKey);assert.ok(!encrypted.includes('access'));assert.deepEqual(decryptTokens(encrypted,dataKey),tokens);
 const parts=encrypted.split('.');parts[2]=`${parts[2][0]==='A'?'B':'A'}${parts[2].slice(1)}`;assert.throws(()=>decryptTokens(parts.join('.'),dataKey),/復号/);assert.throws(()=>decryptTokens(encrypted,'x'.repeat(48)),/復号/);
});

test('Google OAuthはDrive投入ファイルの移動権限を要求し、コード交換とメール確認を行う',async()=>{
 const calls=[];const oauth=new GoogleOAuth({clientId:'client',clientSecret:'secret',redirectUri:'https://app.example/api/google/callback',fetchImpl:async(url,options)=>{calls.push({url,options});if(url.includes('/token'))return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_in:3600}),{status:200});return new Response(JSON.stringify({email:'owner@example.test',email_verified:true}),{status:200});}});
 const url=new URL(oauth.authorizationUrl('state-value'));assert.equal(url.searchParams.get('state'),'state-value');assert.match(url.searchParams.get('scope'),/auth\/drive(?:\s|$)/);assert.doesNotMatch(url.searchParams.get('scope'),/drive\.file/);assert.equal(url.searchParams.get('access_type'),'offline');
 const tokens=await oauth.exchange('authorization-code');assert.equal(tokens.refresh_token,'refresh');assert.ok(tokens.expires_at>Date.now());assert.equal(await oauth.email(tokens.access_token),'owner@example.test');
 assert.equal(new URLSearchParams(calls[0].options.body).get('client_secret'),'secret');
});

test('短い確認コード、不完全な暗号鍵、Googleエラーを拒否する',async()=>{
 assert.throws(()=>encryptTokens({access_token:'x'},'short'),/32/);
 const oauth=new GoogleOAuth({clientId:'client',clientSecret:'secret',redirectUri:'https://app.example/callback',fetchImpl:async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400})});
 await assert.rejects(()=>oauth.exchange('short'),/確認コード/);await assert.rejects(()=>oauth.exchange('long-enough-code'),/完了できません/);
});

test('Google側の接続許可を取り消す',async()=>{
 let requested='';const oauth=new GoogleOAuth({clientId:'client',clientSecret:'secret',redirectUri:'https://app.example/callback',fetchImpl:async url=>{requested=String(url);return new Response('',{status:200});}});
 assert.equal(await oauth.revoke('refresh-token'),true);assert.match(requested,/\/revoke\?token=refresh-token/);assert.equal(await oauth.revoke(''),false);
});
