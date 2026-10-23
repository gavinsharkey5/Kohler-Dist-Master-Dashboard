/* Isolated local server, real middleware and tracker files. Notes are labelled
   test fixtures in memory; no production API calls or database writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.env.KDH_TEST_ROOT?path.resolve(process.env.KDH_TEST_ROOT):path.resolve(__dirname,'..'),shots=path.join(root,'shots/incentive-details');fs.mkdirSync(shots,{recursive:true});
const mw=vm.createContext({Request,Response,URL,console});vm.runInContext(fs.readFileSync(path.join(root,'middleware.js'),'utf8').replace(/^import .*$/mg,'').replace(/export default /g,'').replace(/export /g,''),mw);const route=vm.runInContext('route',mw);
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const hasBefore=fs.existsSync(path.join(shots,'before/hub/hub.js'))&&fs.existsSync(path.join(shots,'before/hub/hub.css'));
const book=JSON.parse(fs.readFileSync(path.join(root,'accounts/data/reps/chris-payton.json'),'utf8')),account=book.accounts[0];
let origin,checks=0,browser;const errors=[],requests=[];const check=(v,m)=>{assert.ok(v,m);checks++;};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin),cookie=req.headers.cookie||'',m=cookie.match(/(?:^|;\s*)kdh_user=([^;]+)/),u=m?JSON.parse(decodeURIComponent(m[1])):{role:'manager',name:'Local Manager'};
 if(url.pathname==='/shared/auth-config.js'){res.setHeader('content-type','application/javascript');return res.end('window.KDH_AUTH={url:'+JSON.stringify(origin) +',key:"local-test"};');}
 if(url.pathname.startsWith('/rest/v1/')){
  const table=url.pathname.slice('/rest/v1/'.length);res.setHeader('content-type','application/json');
  if(table==='rep_actions')return res.end(JSON.stringify([
   {id:'sample-own',rep_name:u.role==='rep'?u.name:'Chris Payton',program_id:'note:sample-own',account_num:String(account.n),account_name:account.name,status:'note',note:'SAMPLE: Follow up about seasonal placement.',updated_at:'2026-10-23T10:00:00Z'},
   {id:'sample-other',rep_name:'Chris Payton',program_id:'note:sample-other',account_num:'not-assigned',account_name:'OTHER ROUTE SECRET',status:'note',note:'NOT ACCESSIBLE',updated_at:'2026-10-23T11:00:00Z'},
   {id:'sample-mark',rep_name:'Chris Payton',program_id:'inc:four_loko',account_num:String(account.n),status:'done',note:'NOT A NOTE',updated_at:'2026-10-23T12:00:00Z'}]));
  if(table==='rpc/kdh_program_scope')return res.end(JSON.stringify({manager:u.role==='manager',admin:true,team:null,brands:null}));
  return res.end('[]');
 }
 const publicAsset=/^\/(assets\/|manifest|favicon|login\/)/.test(url.pathname),v=publicAsset?new Response(null):route(new Request(url,{headers:{cookie,accept:req.headers.accept||'*/*'}}),url,{ok:true,...u});
 if(v.status!==200){res.writeHead(v.status,Object.fromEntries(v.headers));return res.end(await v.text());}
 const target=v.headers.get('x-middleware-rewrite'),served=target?new URL(target).pathname:url.pathname;
 requests.push({role:u.role,name:u.name,asked:url.pathname,served});
 const file=path.resolve(root,'.'+served+(served.endsWith('/')?'index.html':''));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');let body=fs.readFileSync(file);const rel=path.relative(root,file).replace(/\\/g,'/');if(hasBefore&&cookie.includes('detail_before=1')&&['hub/hub.js','hub/hub.css'].includes(rel))body=fs.readFileSync(path.join(shots,'before',rel));if(rel==='hub/hub.js')body=String(body).replace('window.KohlerHub = {','window.KohlerHub = {test:{incentiveAccountEvidence:typeof incentiveAccountEvidence==="function"?incentiveAccountEvidence:null,screenPrograms,screenProgram},');res.end(body);
}catch(e){if(e.code!=='ENOENT')errors.push(String(e));res.writeHead(404);res.end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const programs=['famosa_oct','mabi_single_serve','sam_adams_cold_snap'];
 const model=page=>page.evaluate(()=>KohlerHub.programs().filter(p=>p.type==='Incentive').map(p=>({id:p.id,rule:p.rules,period:p.period,rep:KohlerHub.roster.map(rep=>({rep,result:p.forRep(rep),facts:p.forRep(rep)?KohlerHub.progFacts(p,p.forRep(rep),rep):null}))})));
 const context=await browser.newContext({viewport:{width:1366,height:1000}});
 await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name:'Chris Payton',role:'rep'})),url:origin},{name:'detail_before',value:'1',url:origin}]);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-23T16:00:00Z'));
 await page.goto(origin+'/hub/#view=rep&rep=Chris%20Payton&cat=inc&only=inc');await page.waitForSelector('.inc-progress');
 const before=await model(page),snapshot=await page.locator('.hsups').count()?await page.locator('.hsups').innerHTML():await page.locator('.iview').innerHTML();
 // Capture the actual previous detail layout, not a reconstructed mockup.
 for(const theme of (hasBefore?['light','dark']:[]))for(const width of [390,1366])for(const key of programs){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>localStorage.setItem('kdh_theme',t),theme);
  await page.goto(origin+'/hub/#view=detail&rep=Chris%20Payton&prog=inc:'+key+'&cat=inc&only=inc');await page.reload();await page.waitForSelector('.px-name');
  await page.screenshot({path:path.join(shots,'before-'+key+'-'+width+'-'+theme+'.png')});
 }
 await context.clearCookies();await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name:'Chris Payton',role:'rep'})),url:origin}]);
 await page.goto(origin+'/hub/#view=rep&rep=Chris%20Payton&cat=inc&only=inc');await page.reload();await page.waitForSelector('.inc-progress');
 if(hasBefore){assert.deepEqual(await model(page),before);checks++;check(true,'All program numbers, rules and goals unchanged');}
 const afterSnapshot=await page.locator('.hsups').count()?await page.locator('.hsups').innerHTML():await page.locator('.iview').innerHTML();
 fs.writeFileSync(path.join(shots,'snapshot-before.html'),snapshot);fs.writeFileSync(path.join(shots,'snapshot-after.html'),afterSnapshot);if(hasBefore)check(afterSnapshot.replace(/ style="[^"]*"/g,'')===snapshot.replace(/ style="[^"]*"/g,''),'Rep card snapshots unchanged (ignoring asynchronous shared type-lift styles)');
 const evidence=await page.evaluate(()=>{
  const H=KohlerHub,rep='Chris Payton',get=k=>{const p=H.programs().find(x=>x.id==='inc:'+k);return H.test.incentiveAccountEvidence(p,rep);};
  return {famosa:get('famosa_oct'),mabi:get('mabi_single_serve'),boston:get('sam_adams_cold_snap')};
 });
 check(evidence.famosa.rows.length===4,'Famosa has four current buyers, not six mixed-year accounts');
 check(evidence.famosa.rows.some(x=>x.what==='15 Cases · 0 Last Year'),'Famosa displays source quantities');
 check(!evidence.famosa.rows.some(x=>/Figlar|Paramus Food/.test(x.name)),'Prior-year-only buyers excluded from current case sales');
 check(evidence.mabi.rows.length===141,'All 141 source MABI placements exposed');
 check(evidence.mabi.rows.some(x=>x.name==='Wineland'&&x.what.includes('19.2')),'MABI account and product details');
 check(evidence.boston.rows.length===0&&evidence.boston.note.includes('not supplied'),'No completed Boston conversion accounts invented');
 // The same summary and source counts at every required device size/theme.
 for(const theme of ['light','dark'])for(const width of [390,820,1366])for(const key of programs){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>localStorage.setItem('kdh_theme',t),theme);
  await page.goto(origin+'/hub/#view=detail&rep=Chris%20Payton&prog=inc:'+key+'&cat=inc&only=inc');await page.reload();await page.waitForSelector('.inc-credited');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow '+key+width+theme);
  check(await page.locator('.inc-details>summary').innerText()==='Program Details','Program Details label');
  check(await page.locator('.pwf-ask').count()===0,'What Counts replaced');
  check(await page.evaluate(()=>{const c=document.querySelector('.inc-credited'),e=document.querySelector('.pwf-list');return !e||!!(c.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING);}),'Credited accounts precede eligible list');
  check(await page.locator('.inc-credited').count()===1,'No duplicate credited section');
  check(await page.evaluate(()=>!document.querySelector('.px .program-details')),'Full terms moved out of snapshot');
  if(key==='sam_adams_cold_snap')check(await page.locator('.inc-credited').innerText().then(t=>t.includes('Not Supplied')&&!t.includes('Nothing credited')),'Missing detail is not zero credit');
  else check(await page.locator('.inc-credited [data-list="dist"]').count()===4,'Three account previews and View All');
  await page.screenshot({path:path.join(shots,'after-'+key+'-'+width+'-'+theme+'.png')});
  await page.locator('.inc-details>summary').click();
  check(await page.locator('.inc-parameters li').count()>=4,'Parameters are individual bullets');
  check(await page.locator('.inc-parameters').innerText().then(t=>!t.includes('$')),'Requirement bullets do not leak rates');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded rules fit');
  if(width===390)await page.locator('.inc-details').screenshot({path:path.join(shots,'parameters-'+key+'-'+theme+'.png')});
  if(key!=='sam_adams_cold_snap'){
   await page.locator('.inc-credited-head [data-act="accts"]').click();await page.waitForSelector('#acctRows');
   check(await page.locator('#acctRows>.hrow').count()===(key==='famosa_oct'?4:141),'View All contains the real source rows');
   if(key==='mabi_single_serve'){
    await page.locator('input[placeholder="Search accounts"]').fill('Wineland');
    await page.waitForFunction(n=>document.querySelectorAll('#acctRows>.hrow').length===n,evidence.mabi.rows.filter(x=>x.name==='Wineland').length);
    check(await page.locator('#acctRows').innerText().then(t=>t.includes('Wineland')),'Search credited account names');
   }
   await page.locator('#acctRows>.hrow').first().click();await page.waitForSelector('.hsec');
   check(await page.locator('body').innerText().then(t=>t.includes('Credited for This Program')),'Account opens its source records');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Account detail fits');
  }
 }
 check(await page.evaluate(()=>fetch('/accounts/data/reps/alex-rodriguez.json').then(r=>r.status))===403,'Other rep account book stays blocked');
 await context.close();
 // Main must keep its manager summaries, exports and program models intact.
 if(hasBefore){
  const manager=await browser.newContext({viewport:{width:1366,height:1000}});
  await manager.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const snapshots=[];
  for(const old of [true,false]){
   await manager.clearCookies();
   await manager.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name:'Local Manager',role:'manager'})),url:origin},...(old?[{name:'detail_before',value:'1',url:origin}]:[])]);
   const mp=await manager.newPage();await mp.clock.setFixedTime(new Date('2026-10-23T16:00:00Z'));
   await mp.goto(origin+'/hub/#mode=manager&view=programs');await mp.waitForSelector('.pv-incentive');
   snapshots.push({models:await model(mp),html:await mp.evaluate(()=>KohlerHub.test.screenPrograms())});
   check(await mp.locator('[data-act="export-data"]').count()>0&&await mp.locator('[data-act="export-recap"]').count()>0,'Manager exports retained');
   await mp.locator('[data-act="review-reps"]').first().click();check(await mp.locator('.pv-review-body:not([hidden])').count()>0,'Manager Review Reps retained');
   await mp.close();
  }
  assert.deepEqual(snapshots[0],snapshots[1]);checks++;
  await manager.close();
 }
 check(errors.length===0,'No errors: '+errors.join('; '));console.log(checks+' incentive detail/data/browser checks passed.');
})().catch(e=>{console.error(e);console.error(errors);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
