/* Local-only file extraction. Returned birthday records never contain birth years. */
(function(g){
  'use strict';
  const root=g.document?new URL('./',g.document.currentScript.src).href:'/kohler-korner/';
  const norm=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const name=s=>{const parts=String(s||'').trim().split(',');return parts.length===2?(parts[1].trim()+' '+parts[0].trim()):String(s||'').trim();};
  const validDate=(m,d)=>Number.isInteger(m)&&Number.isInteger(d)&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(2000,m,0)).getUTCDate();
  function monthDay(value,date1904=false){
    let month,day;
    if(Object.prototype.toString.call(value)==='[object Date]'){month=value.getUTCMonth()+1;day=value.getUTCDate();}
    else if(typeof value==='number'&&Number.isFinite(value)&&value>0&&value<100000){const date=new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+Math.floor(value)*86400000);month=date.getUTCMonth()+1;day=date.getUTCDate();}
    else{const s=String(value||'').trim();let m=s.match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)||s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-]\d{2,4})?$/);if(m){month=Number(m[1]);day=Number(m[2]);}else{m=s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+\d{4})?$/);if(m){month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1].slice(0,3).toLowerCase())+1;day=Number(m[2]);}}}
    return validDate(month,day)?{month,day}:null;
  }
  function table(rows,kind='auto',date1904=false){
    const aliases={name:['name','employeename','fullname','lastnamefirstname'],first:['firstname'],last:['lastname'],birth:['birthdate','birthday','dateofbirth','dob'],month:['birthdaymonth','birthmonth','month'],day:['birthdayday','birthdaydate','day'],years:['yearsofservice','years','serviceyears'],title:['jobtitle','title','position'],department:['department','homedepartmentdesc','departmentdesc'],introduction:['introduction','bio']};
    let columns,header=-1;
    for(let i=0;i<Math.min(rows.length,25);i++){const keys=rows[i].map(norm),map={};Object.entries(aliases).forEach(([k,values])=>map[k]=keys.findIndex(v=>values.includes(v)));if(map.name>=0||map.first>=0&&map.last>=0){columns=map;header=i;break;}}
    if(!columns)throw Error('No employee-name column was found. Use a header such as Employee Name or Last Name First Name.');
    if(kind==='auto')kind=columns.birth>=0||columns.month>=0?'birthdays':columns.years>=0?'anniversaries':'people';
    if(kind==='birthdays'&&columns.birth<0&&(columns.month<0||columns.day<0))throw Error('Add a Birth Date column, or separate Month and Day columns.');
    if(kind==='anniversaries'&&columns.years<0)throw Error('Add a Years of Service column. Service milestones must come from your source.');
    const records=[],warnings=[];
    rows.slice(header+1).forEach((r,i)=>{
      if(r.every(v=>v==null||v===''))return;
      const employee=name(columns.name>=0?r[columns.name]:String(r[columns.first]||'')+' '+String(r[columns.last]||''));
      if(!employee){warnings.push(`Row ${header+i+2}: employee name is missing.`);return;}
      if(kind==='birthdays'){const date=columns.birth>=0?monthDay(r[columns.birth],date1904):{month:Number(r[columns.month]),day:Number(r[columns.day])};if(!date||!validDate(date.month,date.day)){warnings.push(`Row ${header+i+2}: birthday needs a valid month and day.`);return;}records.push({kind,name:employee,...date});}
      else if(kind==='anniversaries'){const years=Number(r[columns.years]);if(r[columns.years]==null||r[columns.years]===''||!Number.isInteger(years)||years<0||years>100){warnings.push(`Row ${header+i+2}: years of service needs review.`);return;}records.push({kind,name:employee,years});}
      else records.push({kind,name:employee,title:String(r[columns.title]||''),department:String(r[columns.department]||''),introduction:String(r[columns.introduction]||'')});
    });
    return {records,warnings,kind};
  }
  function newHire(subject,body){
    subject=String(subject||'').replace(/^(?:(?:fw|fwd|re)\s*:\s*)+/i,'').trim();body=String(body||'');
    const welcome=body.match(/(?:welcoming|welcome)\s+([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,4})\s+to\s+(?:the\s+)?Kohler/iu),parts=subject.split(/\s*\/\s*/);
    const employee=welcome?welcome[1]:parts.length>1?parts[0]:'';
    const role=body.match(/is\s+(?:our|the)\s+(?:newest|new)\s+(.+?)(?:\s+and\s+(?:will|reports)|[.!\r\n])/i);
    const title=role?role[1].trim():parts.length>1?parts.slice(1).join(' / '):'';
    const department=body.match(/^\s*Department\s*:\s*(.+)$/im);
    const lines=body.split(/\r?\n/).map(s=>s.trim()).filter(s=>employee&&s.includes(employee.split(' ')[0])&&(/welcom|newest|new /i.test(s)));
    return {kind:'people',name:employee,title,department:department?department[1].trim():'',introduction:lines.join('\n\n')};
  }
  function key(record){return record.kind+':'+norm(record.name);}
  function clean(record){
    const result={name:String(record.name||'').trim()};
    if(!result.name)throw Error('Enter an employee name for each selected row.');
    if(record.kind==='birthdays'){const month=Number(record.month),day=Number(record.day);if(!validDate(month,day))throw Error('Birthday dates must contain a valid month and day.');return {...result,month,day};}
    if(record.kind==='anniversaries'){const years=Number(record.years);if(record.years===''||!Number.isInteger(years)||years<0||years>100)throw Error('Enter valid years of service for each anniversary.');return {...result,years};}
    return {...result,title:String(record.title||'').trim(),department:String(record.department||'').trim(),introduction:String(record.introduction||'').trim(),photo:null};
  }
  const scripts=new Map();
  function script(file){if(!scripts.has(file))scripts.set(file,new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=root+'vendor/'+file;s.onload=resolve;s.onerror=()=>{scripts.delete(file);s.remove();reject(Error('The file reader could not load. Check your connection and try again.'));};document.head.append(s);}));return scripts.get(file);}
  function ocrRows(words){
    const find=s=>words.find(w=>norm(w.text)===s),department=find('department'),years=find('years'),n=find('name');
    if(!department||!years||!n)throw Error('The image needs readable Name, Department, and Years of Service column headings. You can also paste the table or upload Excel.');
    const boundary=((n.bbox.x0+n.bbox.x1)/2+(department.bbox.x0+department.bbox.x1)/2)/2;
    const lines=[];
    words.filter(w=>w.bbox.y0>Math.max(n.bbox.y1,department.bbox.y1,years.bbox.y1)+3).sort((a,b)=>a.bbox.y0-b.bbox.y0).forEach(w=>{const y=(w.bbox.y0+w.bbox.y1)/2;let line=lines.find(l=>Math.abs(l.y-y)<12);if(!line){line={y,words:[]};lines.push(line);}line.words.push(w);});
    return lines.map(line=>{const ws=line.words.sort((a,b)=>a.bbox.x0-b.bbox.x0),employee=ws.filter(w=>(w.bbox.x0+w.bbox.x1)/2<boundary).map(w=>w.text).join(' '),service=ws.filter(w=>w.bbox.x0>=years.bbox.x0-25).map(w=>w.text).join(' ').trim();return {kind:'anniversaries',name:employee,years:/^\d{1,3}$/.test(service)?Number(service):''};}).filter(r=>r.name);
  }
  async function image(file,progress){
    await script('tesseract-7.0.0.min.js');const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>25000000){bitmap.close();throw Error('Choose an image smaller than 25 megapixels.');}
    const scale=Math.min(2,2400/bitmap.width),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let dark=0;for(let i=0;i<pixels.data.length;i+=4)if((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<128)dark++;const invert=dark>canvas.width*canvas.height/2;for(let i=0;i<pixels.data.length;i+=4){let gray=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3;if(invert)gray=255-gray;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;}const rowCounts=new Uint32Array(canvas.height),columnCounts=new Uint32Array(canvas.width);for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4,v=pixels.data[i]<(invert?100:145)?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;if(!v){rowCounts[y]++;columnCounts[x]++;}}for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(rowCounts[y]>canvas.width*.6||columnCounts[x]>canvas.height*.6){const i=(y*canvas.width+x)*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}ctx.putImageData(pixels,0,0);
    const worker=await g.Tesseract.createWorker('eng',1,{workerPath:root+'vendor/worker.min.js',corePath:root+'vendor',langPath:root+'vendor',workerBlobURL:false,cacheMethod:'none',logger:m=>progress(m.status+(m.progress!=null?' '+Math.round(m.progress*100)+'%':''))});
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});const result=await worker.recognize(canvas,{}, {text:true,blocks:true});const words=(result.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)));return {records:ocrRows(words),warnings:['Image text can contain recognition errors. Verify every name and service milestone against the original image.'],preview:file};}finally{await worker.terminate();}
  }
  async function parseFile(file,progress=()=>{}){
    if(file.size>25*1024*1024)throw Error('Choose a file smaller than 25 MB.');
    const extension=file.name.toLowerCase().split('.').pop();
    if(['xlsx','csv'].includes(extension)){await script('xlsx-0.20.3.min.js');const book=g.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,sheetRows:5001});let records=[],warnings=[];for(const title of book.SheetNames){const rows=g.XLSX.utils.sheet_to_json(book.Sheets[title],{header:1,defval:null,raw:true});try{const parsed=table(rows,'auto',!!(book.Workbook&&book.Workbook.WBProps&&book.Workbook.WBProps.date1904));records.push(...parsed.records);warnings.push(...parsed.warnings.map(w=>title+': '+w));}catch(e){warnings.push(title+': '+e.message);}}if(!records.length)throw Error(warnings.join(' ')||'No employee records were found.');return {records,warnings};}
    if(extension==='msg'){await script('msgreader-1.29.0.min.js');const reader=new g.KdhMsg.MsgReader(await file.arrayBuffer()),data=reader.getFileData();if(data.error)throw Error('This Outlook message could not be read.');const record=newHire(data.subject,data.body);const photos=(data.attachments||[]).filter(a=>/\.(jpe?g|png|webp)$/i.test(a.fileName||a.name||'')).slice(0,12).sort((a,b)=>(b.contentLength||0)-(a.contentLength||0)).map(a=>{const item=reader.getAttachment(a);return {name:a.fileName||a.name,blob:new Blob([item.content],{type:/\.png$/i.test(a.fileName||a.name)?'image/png':/\.webp$/i.test(a.fileName||a.name)?'image/webp':'image/jpeg'})};});return {records:[{...record,photos,photoIndex:photos.length?0:-1}],warnings:['Confirm the employee name, job title, and headshot. Email dates are not treated as hire dates.']};}
    if(['png','jpg','jpeg','webp'].includes(extension))return image(file,progress);
    if(extension==='txt'){const rows=(await file.text()).split(/\r?\n/).map(line=>line.split('\t'));return table(rows);}
    throw Error('Upload an Excel or CSV employee list, an Outlook .msg announcement, or an anniversary table image.');
  }
  g.KornerImport={monthDay,table,newHire,key,clean,ocrRows,parseFile,loadSpreadsheet:()=>script('xlsx-0.20.3.min.js')};
})(typeof window!=='undefined'?window:globalThis);
