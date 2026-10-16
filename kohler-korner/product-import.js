/* A whitelist of newsletter fields: sales columns never enter draft records. */
(function(g){
  'use strict';
  const norm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
  const text=v=>String(v??'').replace(/<[^>]*>/g,'').trim();
  const aliases={productId:['productid','productnum','sku'],name:['productname','name'],brand:['brand'],package:['package'],status:['status'],imageUrl:['retailunitimage','imageurl','productimage','photo'],description:['shortdescription','description','tastingnotes'],brandFamily:['brandfamily'],supplier:['supplier'],productType:['producttype']};
  function parseRows(rows,catalog){
    let columns,header=-1;
    for(let i=0;i<Math.min(rows.length,25);i++){const h=rows[i].map(norm),c={};for(const [key,keys] of Object.entries(aliases))c[key]=h.findIndex(v=>keys.includes(v));if(c.name>=0||c.brand>=0&&c.package>=0){columns=c;header=i;break;}}
    if(!columns)throw Error('Use Product ID and Product Name, or Brand and Package column headings.');
    const records=[],warnings=[],seen=new Set();
    for(let i=header+1;i<rows.length;i++){
      const row=rows[i];if(row.every(v=>v==null||v===''))continue;
      const raw={};for(const key of Object.keys(aliases))raw[key]=columns[key]>=0?text(row[columns[key]]):'';
      if(!raw.name&&!raw.brand)continue;
      let matches=raw.productId?[catalog.get(raw.productId)].filter(Boolean):catalog.records.filter(p=>norm(p.brand)===norm(raw.brand)&&norm(p.package)===norm(raw.package));
      const match=matches.length===1?matches[0]:null;
      const record={...Object.fromEntries(['productId','name','brand','package','status','brandFamily','supplier','productType'].map(k=>[k,raw[k]||(match&&match[k])||''])),description:raw.description,date:'',photo:null,logo:null};
      if(!record.name)record.name=record.brand;
      const identity=record.productId?'id:'+record.productId:'manual:'+norm(record.brand)+'|'+norm(record.name)+'|'+norm(record.package);
      if(seen.has(identity)){warnings.push('Duplicate row skipped: '+record.name);continue;}seen.add(identity);
      if(matches.length>1)warnings.push(record.name+': multiple catalog matches. Review the product; no Product ID was assigned.');
      if(raw.productId&&match&&raw.name&&norm(raw.name)!==norm(match.name))warnings.push(record.name+': name differs from the catalog for ID '+raw.productId+'. Review before adding.');
      if(record.description.length>180)warnings.push(record.name+': shorten the description to 180 characters.');
      records.push({record,imageUrl:raw.imageUrl,include:false,importImage:!!raw.imageUrl,sourceRow:i+1});
    }
    return {records,warnings};
  }
  async function parseFile(file,catalog){
    if(!/\.(xlsx|csv)$/i.test(file.name))throw Error('Choose an Excel .xlsx or CSV file.');
    if(file.size>15*1024*1024)throw Error('Choose a spreadsheet smaller than 15 MB.');
    await g.KornerImport.loadSpreadsheet();
    const book=g.XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:5002}),records=[],warnings=[];
    for(const title of book.SheetNames){if(norm(title)==='details')continue;try{const rows=g.XLSX.utils.sheet_to_json(book.Sheets[title],{header:1,raw:true,defval:null});if(rows.length>5000)throw Error('Split worksheets larger than 5,000 rows.');const parsed=parseRows(rows,catalog);records.push(...parsed.records);warnings.push(...parsed.warnings);}catch(e){warnings.push(title+': '+e.message);}}
    if(!records.length)throw Error(warnings.join(' ')||'No products found.');return {records,warnings};
  }
  function identity(p){return p.productId?'id:'+p.productId:'manual:'+norm(p.brand)+'|'+norm(p.name)+'|'+norm(p.package);}
  g.KornerProductImport={parseRows,parseFile,identity};
})(typeof window!=='undefined'?window:globalThis);
