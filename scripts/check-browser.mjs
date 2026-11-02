import {mkdir,readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
await mkdir('/tmp/akatsuki-browser-check',{recursive:true});
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5173/?demo=1');await page.getByRole('heading',{name:'ホーム',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
 const today=await page.evaluate(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date()));const month=today.slice(0,7);
 await page.screenshot({path:'/tmp/akatsuki-browser-check/home-navy.png',fullPage:true});
 await page.locator('nav [data-nav="calendar"]').click();
 await page.locator('.heading [data-new-event]').click();
 await page.getByLabel('件名',{exact:true}).fill('点検の準備（操作確認）');
 await page.locator('#modal select[name=kind]').selectOption('タスク');
 await page.locator('#modal select[name=member]').selectOption('a');
 await page.getByRole('button',{name:'保存する',exact:true}).click();
 assert.equal(await page.locator('.day-agenda').getByRole('heading',{name:'点検の準備（操作確認）'}).count(),1);
 await page.locator('.day-agenda').getByRole('button',{name:'点検の準備（操作確認）を編集'}).click();
 await page.getByLabel('完了にする').check();await page.getByRole('button',{name:'保存する',exact:true}).click();
 assert.equal(await page.locator('.day-agenda .completed').count(),1);
 await page.screenshot({path:'/tmp/akatsuki-browser-check/calendar-navy.png',fullPage:true});
 assert.ok(await page.locator('.calendar-panel').evaluate(element=>element.getBoundingClientRect().top<280),'calendar should start within the upper 280px on desktop');
 await page.locator('#actor').selectOption('a');await page.locator('nav [data-nav="shifts"]').click();
 assert.equal(await page.locator('.shift-table tbody tr').first().locator('button:disabled').count(),new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate());
 await page.locator(`[data-shift="${today}"]`).filter({visible:true}).nth(1).click();
 await page.getByLabel('勤務区分').selectOption('am');await page.getByRole('button',{name:'登録・申請する'}).click();
 await page.locator('nav [data-nav="leave"]').click();assert.match(await page.locator('.leave-cards').innerText(),/9.5/);
 assert.equal(await page.locator('[data-review]').count(),0);
 await page.locator('#actor').selectOption('owner');
 await page.getByRole('button',{name:'承認',exact:true}).click();
 await page.locator('#leave-member').selectOption('a');
 assert.match(await page.locator('.leave-cards').innerText(),/9.5/);assert.match(await page.locator('tbody').first().innerText(),/承認済み/);
 await page.screenshot({path:'/tmp/akatsuki-browser-check/leave-navy.png',fullPage:true});
 const leaveDownload=page.waitForEvent('download',{timeout:30000}).catch(async e=>{console.log('PDF status',await page.locator('#page-message').innerText());throw e;});await page.locator('#download-leave').click();await (await leaveDownload).saveAs('/tmp/akatsuki-leave.pdf');console.log('Leave PDF downloaded');
 await page.locator('nav [data-nav="shifts"]').click();
 const shiftDownload=page.waitForEvent('download',{timeout:60000});await page.locator('#download-shifts').click();await (await shiftDownload).saveAs('/tmp/akatsuki-shifts.pdf');assert.equal((await PDFDocument.load(await readFile('/tmp/akatsuki-shifts.pdf'))).getPageCount(),1);
 await page.reload();await page.locator('nav [data-nav="calendar"]').click();assert.match(await page.locator('.day-agenda').innerText(),/点検の準備（操作確認）/);
 await page.locator('nav [data-nav="equipment"]').click();await page.getByRole('button',{name:'＋ 設備を追加'}).click();
 await page.getByLabel('備品名',{exact:true}).fill('照明（回帰確認）');await page.getByLabel('階',{exact:true}).last().fill('5階');await page.getByRole('button',{name:'設備を追加',exact:true}).click();assert.match(await page.locator('tbody').innerText(),/照明（回帰確認）/);
 for(const width of [320,375,390,540,768,1024,1440,1920]){
 await page.setViewportSize({width,height:900});
 for(const view of ['home','calendar','shifts','leave','equipment']){
 await page.locator(`nav [data-nav="${view}"]`).click();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(overflow,false,`page overflow at ${width}px / ${view}`);
 }
 }
 await page.setViewportSize({width:390,height:844});await page.locator('nav [data-nav="home"]').click();await page.screenshot({path:'/tmp/akatsuki-browser-check/home-mobile.png',fullPage:true});
 await page.locator('nav [data-nav="calendar"]').click();await page.screenshot({path:'/tmp/akatsuki-browser-check/calendar-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: event create/complete/persist; own shift editing; half-day application/approval; two PDF downloads; existing equipment add; 8 widths x 5 pages without page overflow; no browser errors');
}finally{await browser.close();}
