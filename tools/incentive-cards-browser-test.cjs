/* Local Phase 1 regression: real static data, real middleware routing,
   fixed clock, no live authentication or database writes.
   Run with Playwright available: node tools/incentive-cards-browser-test.cjs
   KDH_SHOTS optionally selects a local screenshot directory. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.KDH_SHOTS||path.join(root,'shots/incentive-cards');
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
   body=String(body).replace('window.KohlerHub = {','window.KohlerHub = {test:{screenProgramRep,progRowHtml,screenPrograms,screenProgram},');
  }
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(body);
 }catch(e){if(e.code!=='ENOENT')errors.push(e.message);res.writeHead(404);res.end();}
});
let browser,checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function model(page){return page.evaluate(()=>{
 const H=KohlerHub;
 return H.programs().filter(p=>p.type==='Incentive').flatMap(p=>H.roster.map(rep=>{
  const r=p.forRep(rep);return {id:p.id,rep,r,facts:r?H.progFacts(p,r,rep):null,available:r?H.availability(p,rep):null};
 }));
});}
async function geometry(page){return page.evaluate(()=>{
 const cards=[...document.querySelectorAll('.inc-progress')];
 return {overflow:document.documentElement.scrollWidth>innerWidth,cards:cards.map(c=>{
  const cells=[...c.querySelectorAll(':scope>.inc-stats>.inc-stat')];
  return {labels:cells.map(x=>x.querySelector('.inc-stat-label').textContent),sizes:cells.map(x=>parseFloat(getComputedStyle(x.querySelector('.inc-stat-value')).fontSize)),
   overflow:[...c.querySelectorAll('*')].some(x=>x.getBoundingClientRect().right>innerWidth+1),text:c.textContent};
 })};
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,channel:process.env.KDH_BROWSER_CHANNEL||'chrome'});
 const manager=await browser.newContext({viewport:{width:1366,height:1000}});
 await manager.addCookies([{name:'phase1_before',value:'1',url:origin}]);
 const page=await manager.newPage();await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
 await page.goto(origin+'/hub/');await page.waitForFunction(()=>window.KohlerHub?.programs().length);await page.waitForLoadState('networkidle');
 const baseline=await model(page),managerBefore=await page.evaluate(()=>({list:KohlerHub.test.screenPrograms(),detail:(KohlerHub.state.prog='inc:constellation_fall',KohlerHub.test.screenProgram())}));
 await manager.clearCookies();await page.reload();await page.waitForFunction(()=>window.KohlerHub?.programs().length);await page.waitForLoadState('networkidle');
 assert.deepEqual(await model(page),baseline);checks+=baseline.length;
 const managerAfter=await page.evaluate(()=>({list:KohlerHub.test.screenPrograms(),detail:(KohlerHub.state.prog='inc:constellation_fall',KohlerHub.test.screenProgram())}));
 assert.deepEqual(managerAfter,managerBefore);checks++;
 // Exercise every rep/program renderer against the real full dataset.
 const rendered=await page.evaluate(()=>{
  const H=KohlerHub,host=document.createElement('div');const result=[];
  for(const p of H.programs().filter(p=>p.type==='Incentive'))for(const rep of H.roster){
   const r=p.forRep(rep);if(!r||r.status==='unavailable'||r.soon||H.isDollarProgram(r)||!H.availability(p,rep).ok||!H.supportAllows(rep,p))continue;
   host.innerHTML=H.test.progRowHtml(p,r,rep);const block=host.querySelector('.inc-progress'),f=H.progFacts(p,r,rep);
   const cells=block?[...block.querySelectorAll(':scope>.inc-stats>.inc-stat')].map(x=>x.querySelector('.inc-stat-value').textContent):[];
   result.push({id:p.id,rep,block:!!block,cells,dollars:/\$\s*\d/.test(host.textContent),facts:f,r});
  }
  return result;
 });
 for(const x of rendered){
  check(x.block&&x.cells.length===3,x.id+' shared summary');check(!x.dollars,x.id+' no rep dollars');
  if(x.facts.goalN!=null){
   check(Math.abs(Number(x.cells[0].replace(/,/g,''))-Number(x.facts.goalN))<=0.051,x.id+' goal');
   check(Math.abs(Number(x.cells[1].replace(/,/g,''))-Number(x.facts.cur))<=0.051,x.id+' current');
   check(x.facts.needN<=0 ? x.cells[2]==='Met' : Math.abs(Number(x.cells[2].replace(/,/g,''))-Number(x.facts.needN))<=0.051,x.id+' remaining');
  }
 }
 // Local-only renderer states cover loading and no-goal cases without inventing production data.
 const states=await page.evaluate(()=>{
  const H=KohlerHub,p=H.programs().find(p=>p.key==='four_loko');
  return [{soon:true,now:'',goal:'',remain:null},{openEnded:true,now:'4 placements',valueNum:4,goalNum:null,status:'progress'}].map(r=>H.test.progRowHtml(p,r,H.roster[0]));
 });
 check(states[0].includes('Awaiting Data'),'awaiting data is not a zero');check(states[1].includes('No Fixed Goal'),'open-ended has no invented goal');
 await manager.close();
 const examples=(process.env.KDH_CARD_KEYS||'four_loko,le_grand_noir,famosa_oct,lytt,mabi_single_serve,constellation_fall,touchdowns_tea,industrial_arts,new_belgium_distribution_retain,heineken_husa').split(',');
 const chosen=examples.map(key=>rendered.find(x=>x.id==='inc:'+key&&x.r.goalNum>0&&x.r.valueNum>0)||rendered.find(x=>x.id==='inc:'+key)).filter(Boolean);
 const visualResults=[];
 for(const width of [390,820,1366])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
  let activeRep='';
  const p=await context.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  for(const x of chosen){
   if(activeRep!==x.rep){activeRep=x.rep;await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name:x.rep,role:'rep'})),url:origin}]);}
   // A new document is required when changing identity: hash-only navigation
   // deliberately keeps the current signed-in rep and their loaded slices.
   await p.goto(origin+'/hub/?localRep='+encodeURIComponent(x.rep)+'#view=rep&cat=inc&only=inc&rep='+encodeURIComponent(x.rep));await p.waitForFunction(()=>window.KohlerHub?.incRows(KohlerHub.state.rep).length);
   const button=p.locator('button.inc-card[data-prog="'+x.id+'"]');
   if(!await button.count())throw new Error(JSON.stringify({missing:x.id,rep:x.rep,diagnostic:await p.evaluate(id=>{const H=KohlerHub,z=H.programs().find(p=>p.id===id),r=z&&z.forRep(H.state.rep);return {present:!!z,r,available:z&&H.availability(z,H.state.rep),dollar:r&&H.isDollarProgram(r),active:z&&H.isActive(z)};},x.id)}));
   await button.waitFor();
   const g=await geometry(p);check(!g.overflow,'list page fits '+width);
   for(const c of g.cards){check(c.labels.join('|')==='Goal|Current|Remaining','same labels');check(c.sizes[2]>c.sizes[0]&&c.sizes[2]>c.sizes[1],'Remaining largest');check(!c.overflow,'card fits viewport');}
   if(width===390&&x.id==='inc:four_loko')await button.screenshot({path:path.join(out,'after-list-'+theme+'.png')});
   await button.click();await p.waitForSelector('.px .inc-progress');
   const detail=await geometry(p);check(!detail.overflow&&detail.cards.every(c=>!c.overflow),x.id+' detail fits '+width);
   for(const c of detail.cards)check(c.sizes[2]>c.sizes[0]&&c.sizes[2]>c.sizes[1],x.id+' detail Remaining largest');
   check(!/\$\s*\d/.test(await p.locator('#app').innerText()),x.id+' detail has no dollars');
   await p.locator('.px').screenshot({path:path.join(out,'card-'+x.id.slice(4)+'-'+width+'-'+theme+'.png')});
   if(width===390&&['inc:four_loko','inc:constellation_fall','inc:touchdowns_tea','inc:industrial_arts'].includes(x.id))await p.screenshot({path:path.join(out,'after-'+x.id.slice(4)+'-'+theme+'.png')});
   visualResults.push({width,theme,id:x.id,rep:x.rep});
  }
  check(!pageErrors.length,'no browser exceptions: '+pageErrors.join('; '));console.log('Passed '+width+'px '+theme);await context.close();
 }
 // Capture matching before views through the previous JS and CSS.
 for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:390,height:1000},colorScheme:theme});
  const x=chosen.find(x=>x.id==='inc:constellation_fall');
  if(!x){await context.close();continue;}
  await context.addCookies([{name:'phase1_before',value:'1',url:origin},{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name:x.rep,role:'rep'})),url:origin}]);
  const p=await context.newPage();await p.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await p.goto(origin+'/hub/#view=rep&cat=inc&only=inc&rep='+encodeURIComponent(x.rep));await p.waitForSelector('button[data-prog="'+x.id+'"]');
  await p.locator('button[data-prog="'+x.id+'"]').click();await p.waitForSelector('.px');
  await p.screenshot({path:path.join(out,'before-constellation_fall-'+theme+'.png')});await context.close();
 }
 check(requests.some(x=>x.role==='rep'&&x.asked==='/incentive-tracking/data/program_data.js'&&x.served.includes('/data/rep/')),'real incentive slice rewrite');
 check(requests.some(x=>x.role==='rep'&&x.asked==='/hub/data/accounts.js'&&x.served.includes('/accounts/data/book/')),'real account book rewrite');
 check(!errors.length,'local server errors');
 fs.writeFileSync(path.join(out,process.env.KDH_CARD_KEYS?'verification-targeted.json':'verification.json'),JSON.stringify({checks,models:baseline.length,rendered:rendered.length,screens:visualResults,errors},null,2));
 console.log(JSON.stringify({checks,unchangedProgramRepModels:baseline.length,renderedCards:rendered.length,responsiveScreens:visualResults.length,screenshots:out}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
