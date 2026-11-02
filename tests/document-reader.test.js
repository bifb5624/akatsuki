import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {readPdf,extractDocument} from '../server/document-reader.js';

test('PDFをページ別に読み、日付と出典ページを保持する',async()=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.addPage().drawText('Inspection report',{font});pdf.addPage().drawText('Replacement date 2026/11/02',{font});
 const pages=await readPdf(new Uint8Array(await pdf.save())),document=extractDocument(pages,'交換記録','report.pdf');
 assert.equal(pages.length,2);assert.equal(document.extracted.date,'2026-11-02');assert.equal(document.extracted.hits[0].page,2);assert.match(document.name,/2026-11-02/);
});

test('文字のないPDFを自動確定しない',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage();const pages=await readPdf(new Uint8Array(await pdf.save())),document=extractDocument(pages,'点検・メンテナンス','scan.pdf');assert.equal(document.hasText,false);
});

test('一つの未処理フォルダから書類種別を自動分類する',()=>{
 const receipt=extractDocument([{page:1,text:'領収書 合計 12,000円 2026/11/02'}],'自動分類','a.pdf');
 const replacement=extractDocument([{page:1,text:'給湯室の水栓を交換 2026/11/02'}],'自動分類','b.pdf');
 assert.equal(receipt.category,'領収書');assert.equal(receipt.extracted.amount,12000);assert.equal(replacement.category,'交換記録');
});
