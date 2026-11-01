import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeConfig} from '../server/config.js';
test('本番はHTTPS公開先とTursoが必要',()=>{
 assert.throws(()=>runtimeConfig({NODE_ENV:'production'}));
 assert.throws(()=>runtimeConfig({NODE_ENV:'production',APP_ORIGIN:'http://example.com'}));
 for(const APP_ORIGIN of ['https://user:secret@example.com','https://example.com/path','https://example.com?token=x','https://example.com/#token'])assert.throws(()=>runtimeConfig({APP_ORIGIN}));
 const turso={TURSO_DATABASE_URL:'libsql://example.turso.io',TURSO_AUTH_TOKEN:'secret'};
 assert.equal(runtimeConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.com/',PORT:'8080',...turso}).port,8080);
 assert.equal(runtimeConfig({NODE_ENV:'production',RENDER_EXTERNAL_URL:'https://akatsuki.example/',...turso}).origin,'https://akatsuki.example');
 assert.throws(()=>runtimeConfig({NODE_ENV:'production',APP_ORIGIN:'https://example.com'}),/Turso/);
 assert.throws(()=>runtimeConfig({TURSO_DATABASE_URL:turso.TURSO_DATABASE_URL}),/together/);
});
test('転送ヘッダーの信頼は明示した1段だけ',()=>{
 assert.equal(runtimeConfig({}).trustProxyHops,0);
 assert.equal(runtimeConfig({APP_TRUST_PROXY_HOPS:'1'}).trustProxyHops,1);
 for(const APP_TRUST_PROXY_HOPS of ['true','2','-1'])assert.throws(()=>runtimeConfig({APP_TRUST_PROXY_HOPS}));
 for(const PORT of ['-1','0','70000','abc'])assert.throws(()=>runtimeConfig({PORT}));
});
