/* Local Sales Pulse and own incentive estimate verification: real static data, real middleware routing,
   fixed clock, no live authentication or database writes.
   Run with Playwright available: node tools/sales-pulse-browser-test.cjs
   KDH_SHOTS optionally selects a local screenshot directory. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.KDH_SHOTS||path.join(root,'shots/sales-pulse');
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
   body=String(body).replace('window.KohlerHub = {',"window.KohlerHub = {test:{screenProgramRep,progRowHtml,screenPrograms,screenProgram,exportRows,exportScopeText,ownIncentiveEstimateHtml:typeof ownIncentiveEstimateHtml==='function'?ownIncentiveEstimateHtml:()=>''},");
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
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const source=JSON.parse(fs.readFileSync(path.join(root,'sales-pulse/data/pulse.json'),'utf8'));
 const screens=[],pageErrors=[];
 const open=async(user,width=1366,theme='light')=>{
  const c=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
  if(user)await c.addCookies([userCookie(origin,user)]);
  const p=await c.newPage();p.on('pageerror',e=>pageErrors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  return {c,p};
 };
 async function pulseReady(p){await p.waitForSelector('.pulse-card');await p.evaluate(()=>document.fonts.ready);}
 function fmt(n){return Number(n).toLocaleString('en-US',{maximumFractionDigits:0});}
 for(const width of [390,820,1366])for(const theme of ['light','dark']){
  const {c,p}=await open({name:'Local Manager',role:'manager'},width,theme);
  await p.goto(origin+'/sales-pulse/');await pulseReady(p);
  check(await p.locator('.pulse-card').count()===3,'three market cards');
  check(!await p.locator('#pulse-detail').isVisible(),'details closed initially');
  for(const s of ['core','southern','total']){
   check(await p.locator('.pulse-card.'+s+' .pulse-hero strong').innerText()===fmt(source.periods[source.default].scopes[s].current.cases),s+' exact default cases');
  }
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no page overflow');
  check(await p.locator('.pulse-wrap').evaluate(el=>el.getBoundingClientRect().width<=960),'centered width limit');
  check(!await p.locator('#pulse-app').innerText().then(t=>t.includes('$')),'no Pulse dollars');
  await p.screenshot({path:path.join(out,`pulse-${width}-${theme}.png`),fullPage:true});
  await p.locator('[data-scope="southern"]').click();
  check(await p.locator('#pulse-detail').isVisible(),'Review Southern opens detail');
  await p.locator('#pulse-kind').selectOption('accounts');await p.locator('#pulse-direction').selectOption('up');
  const expected=source.periods[source.default].scopes.southern.accounts.up[0];
  if(expected)check((await p.locator('#pulse-detail > .pulse-list').innerText()).includes(expected.name),'account detail matches source');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'detail fits width');
  await p.screenshot({path:path.join(out,`detail-${width}-${theme}.png`),fullPage:true});
  await p.locator('[data-close]').click();check(!await p.locator('#pulse-detail').isVisible(),'detail closes');
  check(await p.locator('[data-scope="southern"]').evaluate(el=>el===document.activeElement),'focus restored after closing');
  await p.locator('.pulse-coverage').last().locator('summary').click();
  check((await p.locator('.pulse-coverage').last().innerText()).includes('Other Areas'),'other areas reconciled');
  const other=source.periods[source.default].scopes.other.current;
  const otherValues=await p.locator('.pulse-coverage').last().locator('dd').allTextContents();
  check(otherValues.join('|')===[Number(other.cases).toLocaleString('en-US',{maximumFractionDigits:2}),fmt(other.placements),fmt(other.buying_accounts),fmt(other.new_buying_accounts)].join('|'),'Other area counts match data');
  screens.push({width,theme});await c.close();console.log('Passed Pulse '+width+'px '+theme);
 }
 if(process.env.KDH_PULSE_UI_ONLY==='1'){
  check(!errors.length&&!pageErrors.length,'no server/browser errors');
  fs.writeFileSync(path.join(out,'verification-ui.json'),JSON.stringify({checks,screens,errors,pageErrors},null,2));
  console.log(JSON.stringify({checks,responsiveScreens:screens.length,uiOnly:true}));return;
 }
 // All 18 month/YTD windows render their own matched prior-year data.
 const {c,p}=await open({name:'Mike Kennedy',role:'manager'});await p.goto(origin+'/sales-pulse/');await pulseReady(p);
 for(const [id,row] of Object.entries(source.periods)){
  const [mode,end]=id.split(':');await p.locator('#pulse-mode').selectOption(mode);await p.locator('#pulse-month').selectOption(end);
  for(const s of ['core','southern','total']){
   check(await p.locator('.pulse-card.'+s+' .pulse-hero strong').innerText()===fmt(row.scopes[s].current.cases),id+'/'+s+' cases');
   const nums=await p.locator('.pulse-card.'+s+' dd').allTextContents();
   check(nums.join('|')===[row.scopes[s].current.placements,row.scopes[s].current.buying_accounts,row.scopes[s].current.new_buying_accounts].map(fmt).join('|'),id+'/'+s+' distinct counts');
  }
 }
 await c.close();
 // Actual middleware rejects page and every payload for reps / associates / IT.
 for(const role of ['rep','associate','it']){
  for(const file of ['/sales-pulse/','/sales-pulse/data/pulse.json','/sales-pulse/pulse.js','/sales-pulse/pulse.css']){
   const result=routeRequest(new Request(origin+file,{headers:{accept:file.endsWith('/')?'text/html':'application/json'}}),new URL(origin+file),{ok:true,name:'Alex Rodriguez',role});
   check(result.status===302||result.status===307||result.status===403,role+' denied '+file);
  }
 }
 check(vm.runInContext('ROLLOUT_LIMITED',mw)===true,'rollout unchanged');
 const ownerEmail=fs.readFileSync(path.join(root,'shared/kdh-user.js'),'utf8').match(/var OWNER = '([^']+)'/)[1];
 const preview=await open({name:'Local Manager',role:'manager',email:ownerEmail});await preview.c.addCookies([{name:'kdh_preview',value:'Alex%20Rodriguez',url:origin}]);
 const start=requests.length;await preview.p.goto(origin+'/sales-pulse/');await preview.p.waitForSelector('.pulse-state');
 check((await preview.p.locator('.pulse-state').innerText()).includes('Managers Only'),'preview blocked in UI');
 check(!requests.slice(start).some(r=>r.asked==='/sales-pulse/data/pulse.json'),'preview never fetches whole market data');await preview.c.close();
 // Network failure / retry, then a zero prior base: no fake infinity.
 const failure=await open({name:'Local Manager',role:'manager'});let fail=true;
 await failure.p.route('**/sales-pulse/data/pulse.json*',r=>{if(fail){fail=false;return r.fulfill({status:503,body:'Unavailable'});}const changed=JSON.parse(JSON.stringify(source));changed.periods[changed.default].scopes.core.prior.cases=0;return r.fulfill({contentType:'application/json',body:JSON.stringify(changed)});});
 await failure.p.goto(origin+'/sales-pulse/');await failure.p.locator('#pulse-retry').click();await pulseReady(failure.p);
 check((await failure.p.locator('.pulse-card.core').innerText()).includes('No Prior Base'),'zero baseline labeled');
 check(!/Infinity|NaN/.test(await failure.p.locator('#pulse-app').innerText()),'no fabricated percent');await failure.c.close();
 // Rep estimates read existing own-row payouts only. No new finance requests.
 const reps=['Alex Rodriguez','Alisa Acciardi','Andrew Lundy','Dylan Rubino','Hakan Sadik','Jaime Colonna',"John O'Donoghue",'Michael Harboy','Chris Payton'];
 let positive=0,unavailable=0,zero=0;
 for(const rep of reps){
  const user=await open({name:rep,role:'rep'},390);const began=requests.length;
  await user.p.goto(origin+'/hub/#view=rep&cat=inc&only=inc');await ready(user.p);
  const values=await user.p.evaluate(()=>{
   const H=KohlerHub,rep=H.state.rep;
   return [...document.querySelectorAll('.inc-card')].map(el=>{
    const prog=H.programs().find(p=>p.id===el.dataset.prog),d=prog.entry&&prog.entry.getRep(rep),raw=d&&typeof d.payout==='number'&&Number.isFinite(d.payout)?d.payout:null;
    return {id:prog.id,raw,text:el.querySelector('.inc-estimate')?.textContent||'',foreign:H.test.ownIncentiveEstimateHtml(prog,'Temporary Other Rep')};
   });
  });
  for(const v of values){
   check(v.text.includes('Estimated Earnings'),rep+' estimate labeled');check(v.foreign==='','cannot render another rep estimate');
   if(v.raw==null){unavailable++;check(v.text.includes('Estimate Unavailable'),'missing estimate is not zero');}
   else {if(v.raw>0)positive++;if(v.raw===0)zero++;check(v.text.includes('$'+v.raw.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})),'amount equals existing tracker');check(v.text.includes('not final'),'estimate not payroll');}
  }
  check(await user.p.locator('#app').evaluate(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('.inc-estimate').forEach(e=>e.remove());return !/\$\s*\d/.test(copy.textContent);}),'currency confined to own estimates');
  check(!requests.slice(began).some(r=>/program_finance/.test(r.asked)),'no manager finance fetch');
  if(rep==='Chris Payton'){
   await user.p.screenshot({path:path.join(out,'rep-estimates-light.png'),fullPage:true});
   const card=user.p.locator('.inc-card').filter({hasText:'Push Famosa'});if(await card.count()){await card.click();await user.p.waitForSelector('.inc-estimate');check((await user.p.locator('.inc-estimate').first().innerText()).includes('Estimated Earnings'),'detail retains own estimate');await user.p.screenshot({path:path.join(out,'rep-estimate-detail.png'),fullPage:true});}
  }
  await user.c.close();console.log('Passed own estimates: '+rep);
 }
 check(positive>0&&zero>0&&unavailable>0,'positive, zero and unavailable estimates exercised');
 for(const width of [390,820,1366])for(const theme of ['light','dark']){
  const rep=await open({name:'Chris Payton',role:'rep'},width,theme);
  await rep.p.goto(origin+'/hub/#view=rep&cat=inc&only=inc');await ready(rep.p);
  const card=rep.p.locator('.inc-card[data-prog="inc:famosa_oct"]');await card.evaluate(el=>el.scrollIntoView({block:'center'}));
  check(await rep.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'own estimate list fits '+width);
  check(await card.evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.inc-remaining .inc-stat-value')).fontSize)>parseFloat(getComputedStyle(el.querySelector('.inc-estimate b')).fontSize)),'Remaining stays prominent');
  await card.screenshot({path:path.join(out,`estimate-card-${width}-${theme}.png`)});
  await card.click();await rep.p.waitForSelector('.inc-estimate');
  check(await rep.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'own estimate detail fits '+width);
  await rep.p.screenshot({path:path.join(out,`estimate-detail-${width}-${theme}.png`),fullPage:true});await rep.c.close();
 }
 // Manager models, exports and rankings retain their original values.
 const manager=await open({name:'Local Manager',role:'manager'});await manager.c.addCookies([{name:'phase1_before',value:'1',url:origin}]);
 await manager.p.goto(origin+'/hub/');await ready(manager.p);const baseline=await snapshot(manager.p);
 await manager.c.clearCookies();await manager.c.addCookies([userCookie(origin,{name:'Local Manager',role:'manager'})]);await manager.p.reload();await ready(manager.p);
 assert.deepEqual(await snapshot(manager.p),baseline);checks++;
 check(!await manager.p.locator('.inc-estimate').count(),'manager overview unchanged');await manager.c.close();
 check(!errors.length&&!pageErrors.length,'no server/browser errors: '+errors.concat(pageErrors).join('; '));
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,screens,reps:reps.length,estimates:{positive,zero,unavailable},errors,pageErrors},null,2));
 console.log(JSON.stringify({checks,responsiveScreens:screens.length,reps:reps.length,estimates:{positive,zero,unavailable},screenshots:out}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
