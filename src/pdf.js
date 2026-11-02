import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
let fontBytes;
export async function downloadReport({title,subtitle,headers,rows,filename,columnWeights}){
 if(!fontBytes){const response=await fetch('/fonts/NotoSansJP-Regular.ttf');if(!response.ok)throw Error('PDF用の文字を読み込めませんでした。再度お試しください。');fontBytes=await response.arrayBuffer();}
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 // Embed the complete static TTF: CJK subsetting in fontkit can drop glyph outlines.
 const font=await doc.embedFont(fontBytes,{subset:false});
 const width=842,height=595,margin=34,tableWidth=width-margin*2,weights=headers.map((_,i)=>columnWeights?.[i]||1),weightTotal=weights.reduce((a,b)=>a+b,0),columns=weights.map(weight=>tableWidth*weight/weightTotal),positions=columns.map((_,i)=>margin+columns.slice(0,i).reduce((a,b)=>a+b,0));
 let page,y,pageNumber=0;
 function text(value,x,y,size=10){page.drawText(String(value),{x,y,size,font,color:rgb(.12,.18,.28)});}
 function lines(value,maxWidth,size=9){const result=[];let current='';for(const char of String(value??'')){if(char==='\n'||(current&&font.widthOfTextAtSize(current+char,size)>maxWidth)){result.push(current);current='';}if(char!=='\n')current+=char;}result.push(current);return result;}
 function newPage(){page=doc.addPage([width,height]);pageNumber++;text(title,margin,height-44,18);text(subtitle,margin,height-66,9);text('日付は日本時間',margin,20,8);text(String(pageNumber),width-45,20,8);y=height-100;page.drawRectangle({x:margin,y:y-9,width:tableWidth,height:27,color:rgb(.9,.93,.97)});headers.forEach((h,i)=>text(h,positions[i]+3,y,headers.length>12?8:10));y-=35;}
 newPage();
 for(const row of rows){const cells=row.map((cell,i)=>lines(cell,columns[i]-6,headers.length>12?8:9));const rowHeight=Math.max(...cells.map(c=>c.length))*13+14;if(y-rowHeight<40)newPage();cells.forEach((cell,i)=>cell.forEach((line,j)=>text(line,positions[i]+3,y-j*13,headers.length>12?8:9)));y-=rowHeight;page.drawLine({start:{x:margin,y:y+8},end:{x:width-margin,y:y+8},thickness:.4,color:rgb(.82,.86,.91)});}
 if(!rows.length)text('該当する記録はありません。',margin,y);
 const bytes=await doc.save();const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {bytes,filename};
}
