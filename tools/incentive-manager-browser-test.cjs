/* Local manager incentive regression: real static data, real middleware routing,
   fixed clock, no live authentication or database writes.
   Run with Playwright available: node tools/incentive-manager-browser-test.cjs
   KDH_SHOTS optionally selects a local screenshot directory. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.KDH_SHOTS||path.join(root,'shots/incentive-manager');
fs.mkdirSync(out,{recursive:true});
const old={};for(const f of ['hub/hub.js','hub/hub.css'])old[f]=execFileSync('git',['show','HEAD:'+f],{cwd:root,encoding:'utf8',maxBuffer:8e6});
const mw=vm.createContext({Request,Response,URL,console});
vm.runInContext(fs.readFileSync(path.join(root,'middleware.js'),'utf8').replace(/^import .*$/mg,'').replace(/export default /g,'').replace(/export /g,''),mw);
const routeRequest=vm.runInContext('route',mw);
const requests=[],errors=[],mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://127.0.0.1:'+server.address().port),cookie=req.headers.cookie||'';
  const match=cookie.match(/(?:^|;\s*)kdh_user=([^;]+)/),user=match?JSON.parse(decodeURIComponent(match[1])):{name:'Local Manager',role:'manager'};
  if(u.pathname==='/shared/auth-config.js'){res.setHeader('content-type','application/javascript');return res.end('window.KDH_AUTH = {};');}
  const publicAsset=/^\/(assets\/|login\/|favicon|manifest\.webmanifest)/.test(u.pathname);
  const verdict=publicAsset?new Response(null):routeRequest(new Request(u,{headers:{accept:req.headers.accept||'*/*',cookie}}),u,{ok:true,...user});
  if(verdict.status!==200){res.writeHead(verdict.status,Object.fromEntries(verdict.headers));return res.end(await verdict.text());}
  const rewrite=verdict.headers.get('x-middleware-rewrite');
  const served=rewrite?new URL(rewrite).pathname:u.pathname;
  requests.push({role:user.role,name:user.name,asked:u.pathname,served});
  const file=path.resolve(root,'.'+served+(served.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  let body;
  const rel=path.relative(root,file).replace(/\\/g,'/'),before=cookie.includes('phase1_before=1');
  body=before&&old[rel]!=null?old[rel]:fs.readFileSync(file);
  if(rel==='hub/hub.js'){
   // Test-only access to renderers, never added to the shipped API.
   body=String(body).replace('window.KohlerHub = {','window.KohlerHub = {test:{screenProgramRep,progRowHtml,screenPrograms,screenProgram,exportRows,exportScopeText},');
  }
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(body);
 }catch(e){if(e.code!=='ENOENT')errors.push(e.message);res.writeHead(404);res.end();}
});
let browser,checks=0;
const check=(v,m)=>{assert.ok(v,m);checks++;};
const userCookie=(origin,user)=>({name:'kdh_user',value:encodeURIComponent(JSON.stringify(user)),url:origin});
async function ready(p){
 await p.waitForFunction(()=>window.KohlerHub?.programs().length);
 await p.evaluate(async()=>{await document.fonts.ready;await KohlerHub.loadFor(KohlerHub.programs().filter(p=>p.type==='MPO'&&KohlerHub.isActive(p)));});
}
async function snapshot(p){return p.evaluate(async()=>{
 const H=KohlerHub,all=H.programs().filter(p=>p.type==='Incentive');
 const models=all.map(p=>({id:p.id,stats:H.programStats(p),exposure:p.exposure(),rules:p.rules,
  rankings:p.ranking().filter(r=>H.roster.includes(r.rep)),
  reps:H.roster.map(rep=>({rep,r:p.forRep(rep),facts:p.forRep(rep)?H.progFacts(p,p.forRep(rep),rep):null}))}));
 const variants=[];
 for(const f of [{chan:'all',sup:'all',month:'active'},{chan:'on',sup:'all',month:'active'},{chan:'off',sup:'all',month:'all'},
  {chan:'all',sup:'all',month:'2026-09'},{chan:'all',sup:all[0]?.supplier||'all',month:'all'}]){
  Object.assign(H.state.filters,{type:'inc'},f);const list=H.programsForExport('');
  variants.push({filter:f,ids:list.map(p=>p.id),rows:H.test.exportRows(list,false),lines:H.test.exportRows(list,true)});
 }
 Object.assign(H.state.filters,{type:'inc',chan:'all',sup:'all',month:'active'});
 const list=H.programsForExport(''),M=await H.recapModel(list),book=H.recapBook(M,{label:'Local Verification',iso:'2026-10-22T12:00:00Z',file:'local'},'',list);
 return {roster:H.roster,scope:H.test.exportScopeText(),brands:H.brandScope(),models,variants,recap:M,book};
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,channel:process.env.KDH_BROWSER_CHANNEL||'chrome'});
 const scopes=[{name:'Local Manager',role:'manager'},{name:'Mike Engel',role:'manager'},{name:'Chris McCrohan',role:'manager'},
  {name:'Jason Koo',role:'manager'},{name:'Local Manager',role:'manager',preview:true}];
 const scopeResults=[];
 for(const user of scopes){
  const c=await browser.newContext({viewport:{width:1366,height:1000}});await c.addCookies([userCookie(origin,user),{name:'phase1_before',value:'1',url:origin}]);
  const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await p.goto(origin+'/hub/');await ready(p);const before=await snapshot(p);
  await c.clearCookies();await c.addCookies([userCookie(origin,user)]);await p.reload();await ready(p);const after=await snapshot(p);
  assert.deepEqual(after,before);checks+=after.models.length+after.variants.length+2;
  check(await p.locator('.pv-incentive').count()>0,'scoped summary cards exist');
  check(await p.locator('.pv-review-body:visible').count()===0,'reps collapsed initially');
  const hasExports=await p.locator('[data-act="export-data"]').count();check(user.preview?!hasExports:hasExports===1,'global export/preview permission');
  await p.locator('[data-act="review-reps"]').first().click();
  const names=await p.locator('.pv-review-body:visible .lname').allTextContents();
  check(names.every(n=>after.roster.includes(n.trim())),'expanded ranks restricted to scoped roster');
  if(user.name==='Mike Engel')check(after.roster.length===4,'DM has four reps');
  if(user.name==='Chris McCrohan')check(!after.brands&&after.roster.length===6,'hybrid DM retains all suppliers for team');
  if(user.name==='Jason Koo')check(!!after.brands?.length,'brand manager supplier scope loaded');
  scopeResults.push({name:user.name,preview:!!user.preview,reps:after.roster.length,programs:after.models.length});console.log('Passed scope '+user.name+(user.preview?' preview':''));await c.close();
 }
 const screens=[];
 for(const width of [390,820,1366])for(const theme of ['light','dark']){
  const c=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,acceptDownloads:true});
  await c.addCookies([userCookie(origin,scopes[0])]);const p=await c.newPage(),pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));await p.goto(origin+'/hub/');await ready(p);
  check(await p.locator('.filters .fgrp').count()===4,'all filters remain');
  check(await p.locator('.pv-review-body:visible').count()===0,'no reps shown first');
  check(!/\$\s*\d/.test((await p.locator('.pv-summary').allTextContents()).join(' ')),'no dollars in summary');
  const overflow=()=>p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  check(!await overflow(),'summary fits '+width);
  // Native button keyboard activation and more than one open program.
  const summaries=p.locator('[data-act="review-reps"]');await summaries.first().focus();await p.keyboard.press('Enter');
  check(await summaries.first().getAttribute('aria-expanded')==='true','keyboard opens reps');
  await summaries.nth(1).click();check(await p.locator('.pv-review-body:visible').count()===2,'multiple programs may stay open');
  await summaries.first().click();await summaries.nth(1).click();
  const card=p.locator('.pv-incentive').filter({has:p.locator('[data-prog="inc:constellation_fall"]')});
  await card.locator('[data-act="review-reps"]').screenshot({path:path.join(out,`summary-${width}-${theme}.png`)});
  await card.locator('[data-act="review-reps"]').click();await card.locator('.pv-review-body').waitFor({state:'visible'});
  check(await card.locator('.lrow').count()>0,'rep results available');
  const fold=card.locator('.pv-details');check(!await fold.evaluate(x=>x.open),'program details collapsed');
  await fold.locator('summary').click();check(await fold.evaluate(x=>x.open),'program details open');
  check(await fold.locator('.rules li').count()>0,'rules retained');check(await fold.locator('.pstats .pstat').count()>=4,'original statistics retained');
  check(!await overflow(),'expanded details fit '+width);
  // Re-rendering another open card must retain the current Program Details fold.
  await summaries.first().click();check(await card.locator('.pv-details').evaluate(x=>x.open),'details survive re-render');await summaries.first().click();
  await card.locator('.pv-details>summary').click();
  await card.locator('.pv-review-body').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,`review-${width}-${theme}.png`)});
  const duplicates=await p.evaluate(()=>{const a=[...document.querySelectorAll('[id]')].map(x=>x.id);return a.filter((x,i)=>a.indexOf(x)!==i);});
  check(!duplicates.length,'unique export option IDs');
  const state=await p.evaluate(()=>({...KohlerHub.state.filters}));
  await card.locator('.lrow').first().click();await p.waitForSelector('[data-act="back-review"]');
  await p.locator('[data-act="back-review"]').click();await p.waitForSelector('.pv-summary');
  assert.deepEqual(await p.evaluate(()=>({...KohlerHub.state.filters})),state);checks++;
  check(await card.locator('[data-act="review-reps"]').getAttribute('aria-expanded')==='true','back returns to expanded card');
  // UI filter behavior, including the existing rep filter navigation.
  await p.locator('select[data-filter="sup"]').selectOption('Constellation');
  check(await p.locator('.pv-summary').count()===1,'supplier filter');
  await p.locator('select[data-filter="month"]').selectOption('all');check(!await overflow(),'filtered page fits');
  await p.locator('select[data-filter="month"]').selectOption('active');
  await p.locator('.fpill[data-filter="chan"][data-v="off"]').click();check(await p.locator('.pv-summary').count()===1,'premise filter includes both-premise program');
  if(width===390&&theme==='light'){
   // Per-program export options are independent of the global options.
   const bar=card.locator('.pv-inline-tools .xbar');await bar.locator('.xopts>summary').click();await bar.locator('.x-lines').check();
   check(!await p.locator('.pv-head .x-lines').isChecked(),'global lines option remains off');
   const dl=p.waitForEvent('download');await bar.locator('[data-act="export-data"]').click();const d=await dl;
   const csv=fs.readFileSync(await d.path(),'utf8');check(csv.includes('Constellation')&&!csv.includes('Four Loko'),'per-program CSV has intended program');
   const popup=p.waitForEvent('popup');await bar.locator('[data-act="export-recap"]').click();const recap=await popup;
   await recap.waitForSelector('table');check((await recap.locator('body').innerText()).includes('Supplier Billing'),'billing recap opens');
   const excel=recap.locator('a[download]');check(await excel.count()>0,'Excel recap download retained');
   const xdl=recap.waitForEvent('download');await excel.first().click();const xd=await xdl;check(fs.readFileSync(await xd.path()).subarray(0,2).toString()==='PK','Excel workbook generated');await recap.close();
  }
  await p.locator('#pvRep').selectOption('Chris Payton');await p.waitForFunction(()=>KohlerHub.state.rep==='Chris Payton'&&KohlerHub.state.view==='rep');
  check(!await overflow(),'rep filter navigation fits');check(!pageErrors.length,pageErrors.join('; '));
  // Actual rep identity exercises middleware copies and larger supplier marks.
  await c.clearCookies();await c.addCookies([userCookie(origin,{name:'Chris Payton',role:'rep'})]);
  await p.goto(origin+'/hub/?localRep=chris-payton#view=rep&only=inc&rep=Chris%20Payton&cat=inc');await ready(p);
  const header=p.locator('.hsupg[aria-label="Constellation"] .hsupg-h');await header.waitFor();await header.scrollIntoViewIfNeeded();
  const logo=header.locator('.suplogo');const box=await logo.boundingBox();check(box.width>=144&&box.height>=72,'supplier logo is larger');
  await p.waitForFunction(()=>{const i=document.querySelector('.hsupg[aria-label="Constellation"] .suplogo img');return i?.complete&&i.naturalWidth>0;});
  check(await logo.locator('img').evaluate(i=>i.complete&&i.naturalWidth>0),'supplier logo loads');
  await header.screenshot({path:path.join(out,`supplier-logo-${width}-${theme}.png`)});
  check(!await overflow(),'rep list fits');check(!/\$\s*\d/.test(await p.locator('#app').innerText()),'rep list has no dollars');
  screens.push({width,theme});console.log(`Passed manager/rep ${width}px ${theme}`);await c.close();
 }
 // Show the previous summary and supplier logo at the same mobile width.
 for(const user of [scopes[0],{name:'Chris Payton',role:'rep'}]){
  const c=await browser.newContext({viewport:{width:390,height:1000},colorScheme:'light'});await c.addCookies([userCookie(origin,user),{name:'phase1_before',value:'1',url:origin}]);
  const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));await p.goto(origin+'/hub/');await ready(p);
  const loc=user.role==='manager'?p.locator('.pvcard[data-prog="inc:constellation_fall"]'):p.locator('.hsupg[aria-label="Constellation"] .hsupg-h');
  await loc.screenshot({path:path.join(out,`before-${user.role}.png`)});await c.close();
 }
 check(!errors.length,'local server errors');
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,scopes:scopeResults,screens,errors},null,2));
 console.log(JSON.stringify({checks,scopes:scopeResults.length,responsiveViews:screens.length,screenshots:out}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
