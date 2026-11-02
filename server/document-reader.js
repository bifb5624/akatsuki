import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {safeFileName} from './google-drive.js';

const datePatterns=[/(20\d{2})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})日?/g,/令和\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/g];
const iso=(year,month,day)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
export async function readPdf(bytes){
 const pdf=await getDocument({data:bytes,disableWorker:true,useSystemFonts:true}).promise,pages=[];
 for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),content=await page.getTextContent(),text=content.items.map(item=>item.str).join(' ').replace(/\s+/g,' ').trim();pages.push({page:number,text});}
 return pages;
}
export function extractDocument(pages,category,originalName){
 const hits=[],dates=[],amounts=[];for(const page of pages){for(const pattern of datePatterns){pattern.lastIndex=0;for(const match of page.text.matchAll(pattern)){const year=pattern===datePatterns[1]?2018+Number(match[1]):Number(match[1]),date=iso(year,Number(match[2]),Number(match[3]));dates.push({value:date,page:page.page,source:match[0]});hits.push({field:'date',...dates.at(-1)});}}for(const match of page.text.matchAll(/[¥￥]\s*([\d,]+)|([\d,]+)\s*円/g)){const amount=Number((match[1]||match[2]).replaceAll(',',''));if(Number.isFinite(amount)){amounts.push({value:amount,page:page.page,source:match[0]});hits.push({field:'amount',...amounts.at(-1)});}}}
 const allText=pages.map(page=>page.text).join(' '),date=dates.at(-1)?.value||'',amount=amounts.at(-1)?.value||null;
 const detectedCategory=/領収書|レシート|請求書|合計|税込/.test(allText)?'領収書':/交換|取替|設置|更新/.test(allText)?'交換記録':'点検・メンテナンス';
 const keywords=['交換','修理','点検','メンテナンス','水栓','照明','エアコン','メーター','給湯','領収書','請求書'];const subject=keywords.find(word=>allText.includes(word))||detectedCategory;category=category==='自動分類'?detectedCategory:category;
 const stem=[date||'日付不明',category,subject,amount?`${amount}円`:null].filter(Boolean).join('_');
 return {category,pages:pages.map(page=>({page:page.page,text:page.text.slice(0,2000)})),extracted:{date,amount,subject,category,hits,confidence:pages.some(page=>page.text.length>30)?'medium':'low'},name:safeFileName(`${stem}.pdf`),hasText:pages.some(page=>page.text.trim())};
}
