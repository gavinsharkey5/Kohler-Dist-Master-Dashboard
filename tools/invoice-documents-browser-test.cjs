/* Synthetic fixtures only. Run: node tools/invoice-documents-browser-test.cjs */
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), out=path.resolve(root,'../invoice-document-shots');
fs.mkdirSync(out,{recursive:true});
const account={id:'a1',year:2026,account:'Test marketing account',supplier:'Test Supplier',brand_manager:'Manager One',code:'123',description:'Test allocation',budget_amount:5000,active:true,billback_rule:'split'};
const baseExpense={account_id:'a1',expense_date:'2026-02-02',year:2026,vendor:'Test Vendor',items_purchased:'Test samples',total_amount:100,billback_amount:50,kohler_spend:50,billback_received:false,source:'import_2026',created_at:'2026-10-16T10:00:00Z'};
const expenses=[{...baseExpense,id:'10000000-0000-0000-0000-000000000001',invoice:'1234567'},{...baseExpense,id:'10000000-0000-0000-0000-000000000002',invoice:'7654321'},{...baseExpense,id:'10000000-0000-0000-0000-000000000003',invoice:'7654321',year:2025,expense_date:'2025-02-02'},{...baseExpense,id:'10000000-0000-0000-0000-000000000004',invoice:'Samples'}];
let documents=[],objects=new Map(),editor=true,metadataDown=false,dropCommit=false,failUpload=false,uploads=0,signs=0;
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://local').pathname;
 if(p==='/shared/auth-config.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end('window.KDH_AUTH={url:location.origin+"/mock",key:"test"}');}
 if(p==='/shared/kdh-user.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end('window.kdhUser=()=>({name:"Manager One",role:"manager"});window.kdhMatchName=(n,ns)=>ns.includes(n);');}
 const file=path.join(root,decodeURIComponent(p));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const f=p.endsWith('/')?path.join(file,'index.html'):file;
 try{res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html'});res.end(fs.readFileSync(f));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,channel:process.env.KDH_BROWSER_CHANNEL || 'chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'kdh_at',value:'test-session',url:origin}]);
 await context.route('**/mock/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;const send=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
  if(p.includes('/rpc/kdh_budget_me'))return send({editor,admin:false,manager:true});
  if(p.includes('/budget_accounts'))return send([account]);
  if(p.includes('/supplier_expenses'))return send(expenses);
  if(p.includes('/budget_vendors')||p.includes('/budget_settings'))return send([]);
  if(p.includes('/supplier_invoice_documents')){
   if(metadataDown)return send({message:'Unavailable'},503);
   if(req.method()==='POST'){
    const d={...req.postDataJSON(),uploaded_name:'Editor One',created_at:'2026-10-16T10:00:00Z'};documents.push(d);
    if(dropCommit){dropCommit=false;return route.abort('failed');}return send([d]);
   }
   const eid=u.searchParams.get('expense_id')?.replace('eq.',''),hash=u.searchParams.get('sha256')?.replace('eq.','');
   return send(documents.filter(d=>(!eid||d.expense_id===eid)&&(!hash||d.sha256===hash)));
  }
  if(p.includes('/object/sign/')){if(req.method()==='POST'){signs++;assert.equal(req.postDataJSON().expiresIn,60);return send({signedURL:'/object/sign/supplier-invoices/test.pdf?token=synthetic'});}return route.fulfill({status:200,contentType:'text/html',body:'Test PDF viewer'});}
  if(p.includes('/storage/v1/object/supplier-invoices/')){
   if(failUpload){failUpload=false;return send({message:'Temporary network failure'},503);}
   if(objects.has(p))return send({statusCode:'409',error:'Duplicate'},400);
   uploads++;objects.set(p,req.postDataBuffer());return send({Key:p});
  }
  return send({});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let checks=0;
 async function check(name,fn){await fn();checks++;console.log('PASS',name);}
 const file=(name,content='%PDF-1.4\nsynthetic test\n%%EOF')=>({name,mimeType:'application/pdf',buffer:Buffer.from(content)});
 const dialog=()=>page.getByRole('dialog'),save=()=>dialog().getByRole('button',{name:'Upload Reviewed PDFs'}),close=()=>dialog().getByRole('button',{name:'Close',exact:true}).click();
 await page.goto(origin+'/supplier-budget/');await page.locator('.led').waitFor();
 await check('missing PDF and explicit Encompass source link',async()=>{const row=page.locator('tr.r').first();assert.equal(await row.getByText('Missing PDF',{exact:true}).count(),1);const href=await row.getByRole('link',{name:'Open in Encompass'}).getAttribute('href');assert.ok(href.includes('KeyValue=1234567'));assert.ok(href.includes('V%3A1234567'));});
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();
 await dialog().locator('input[type=file]').setInputFiles([file('1234567 Test.pdf'),file('7654321 duplicate-number.pdf'),file('unknown.pdf')]);
 await check('unique filename matched; repeated invoice and unknown need a choice',async()=>{const picks=dialog().locator('select');assert.equal(await picks.nth(0).inputValue(),expenses[0].id);assert.equal(await picks.nth(1).inputValue(),'');assert.equal(await picks.nth(2).inputValue(),'');});
 await save().click();await dialog().getByText('Attached',{exact:true}).waitFor();
 await check('unmatched files skipped; matched PDF stored once',async()=>{assert.equal(documents.length,1);assert.equal(uploads,1);assert.equal(documents[0].expense_id,expenses[0].id);});
 await close();await check('row shows View PDF after upload without changing expense amounts',async()=>{assert.equal(await page.locator('tr.r').first().getByRole('button',{name:'View PDF',exact:true}).count(),1);assert.equal(expenses[0].total_amount,100);});
 await page.screenshot({path:path.join(out,'ledger-desktop.png'),fullPage:true});
 await page.reload();await page.locator('.led').waitFor();
 await check('attachment survives reload',async()=>assert.equal(await page.locator('tr.r').first().getByRole('button',{name:'View PDF',exact:true}).count(),1));
 await check('View PDF uses a fresh private signed URL',async()=>{await page.locator('tr.r').first().getByRole('button',{name:'View PDF',exact:true}).click();await page.waitForTimeout(100);assert.equal(signs,1);});
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();await dialog().locator('input[type=file]').setInputFiles([file('1234567 Test.pdf')]);await save().click();await dialog().getByText('Already attached — skipped duplicate').waitFor();
 await check('duplicate bytes do not upload again',async()=>{assert.equal(documents.length,1);assert.equal(uploads,1);});await close();
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();await dialog().locator('input[type=file]').setInputFiles([file('7654321 correction.pdf','%PDF-1.4\nnew correction')]);
 await dialog().locator('select').selectOption(expenses[1].id);dropCommit=true;await save().click();await dialog().getByText('Attached',{exact:true}).waitFor();
 await check('lost metadata response reconciles committed attachment',async()=>{assert.equal(documents.length,2);assert.equal(uploads,2);});await close();
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();await dialog().locator('input[type=file]').setInputFiles([file('unmatched.pdf','%PDF-1.4\nmanual')]);await dialog().locator('[data-find]').fill('1234567');await dialog().locator('select').selectOption(expenses[0].id);failUpload=true;await save().click();await dialog().getByText(/Failed: Temporary network failure/).waitFor();await save().click();await dialog().getByText('Attached',{exact:true}).waitFor();
 await check('manual matching and retry work without duplicating successful files',async()=>assert.equal(documents.length,3));await close();
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();await dialog().locator('input[type=file]').setInputFiles([file('1234567 fake.pdf','not a PDF')]);await save().click();await dialog().getByText('Failed: This file is not a PDF.').waitFor();await check('renamed non-PDF refused',async()=>assert.equal(documents.length,3));await close();
 await page.goto(origin+'/supplier-budget/#edit='+expenses[0].id);await page.locator('#fNotes').fill('Unsaved note stays');await page.locator('#sbInvoiceDocs').getByRole('button',{name:'Attach PDF'}).click();await close();
 await check('opening attachment dialog preserves unsaved form edits',async()=>assert.equal(await page.locator('#fNotes').inputValue(),'Unsaved note stays'));
 await page.goto(origin+'/supplier-budget/');await page.setViewportSize({width:390,height:844});await page.locator('.cards').waitFor();await page.screenshot({path:path.join(out,'ledger-phone.png'),fullPage:true});
 await check('phone has document controls and no horizontal overflow',async()=>{assert.ok(await page.locator('.cards [data-pdf]').count());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);});
 await page.getByRole('button',{name:'Bulk Upload PDFs'}).click();await dialog().locator('input[type=file]').setInputFiles([file('7654321 next.pdf','%PDF-1.4\nnext')]);await page.screenshot({path:path.join(out,'bulk-phone.png'),fullPage:true});await close();
 editor=false;await page.reload();await page.locator('.cards').waitFor();
 await check('read-only manager can view but cannot upload',async()=>{assert.equal(await page.getByRole('button',{name:'Bulk Upload PDFs'}).count(),0);assert.equal(await page.locator('[data-attach-pdf]').count(),0);assert.ok(await page.locator('[data-pdf]').count());});
 metadataDown=true;await page.reload();await page.locator('.cards').waitFor();
 await check('unavailable metadata is never reported as missing PDF',async()=>{assert.ok(await page.getByText('PDF status unavailable',{exact:true}).count());assert.equal(await page.getByText('Missing PDF',{exact:true}).count(),0);});
 metadataDown=false;await page.getByRole('button',{name:'Retry PDFs'}).click();await page.locator('.cards [data-pdf]').first().waitFor();
 await check('status retry restores document links',async()=>assert.ok(await page.locator('[data-pdf]').count()));
 for(const width of [390,820,1366]) for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await check(width+' '+theme+' fits viewport',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));
  await page.screenshot({path:path.join(out,'ledger-'+width+'-'+theme+'.png'),fullPage:true});
 }
 await check('no browser JavaScript errors',async()=>assert.deepEqual(errors,[]));
 console.log(checks+' invoice document browser checks passed');await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
