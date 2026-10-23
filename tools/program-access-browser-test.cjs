/* Local DM program eligibility regression: real static data, real middleware routing,
   fixed clock, no live authentication or database writes.
   Run with Playwright available: node tools/program-access-browser-test.cjs
   KDH_SHOTS optionally selects a local screenshot directory. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.KDH_SHOTS||path.join(root,'shots/program-access');
fs.mkdirSync(out,{recursive:true});
const old={};for(const f of ['hub/hub.js','hub/hub.css',...fs.readdirSync(path.join(root,'incentive-tracking/data/rep')).map(f=>'incentive-tracking/data/rep/'+f)])old[f]=execFileSync('git',['show','HEAD:'+f],{cwd:root,encoding:'utf8',maxBuffer:8e6});
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
 browser=await chromium.launch({headless:true,channel:'chrome'});
 const config=vm.createContext({window:{}});
 vm.runInContext(fs.readFileSync(path.join(root,'shared/dm-groups.js'),'utf8'),config);
 vm.runInContext(fs.readFileSync(path.join(root,'shared/program-access.js'),'utf8'),config);
 const groups=JSON.parse(JSON.stringify(config.window.KDH_DM_GROUPS)),team=groups.find(g=>g.dm==='Mike Kennedy');
 const results=[],screens=[];
 async function model(p){return p.evaluate(()=>{const H=KohlerHub,rep=H.state.rep;return {
  programs:H.programs().map(p=>({id:p.id,source:p.source,key:p.key,r:p.forRep(rep)})),
  visible:H.incRows(rep).map(x=>x.p.key),mpo:['off','on'].map(s=>H.sortedForRep(rep,s).map(x=>({id:x.p.id,r:x.r})))
 };});}
 for(const rep of groups.flatMap(g=>g.reps)){
  const c=await browser.newContext();await c.addCookies([userCookie(origin,{name:rep,role:'rep'}),{name:'phase1_before',value:'1',url:origin}]);
  const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await p.goto(origin+'/hub/#view=rep&only=inc&cat=inc&rep='+encodeURIComponent(rep));await ready(p);const before=await model(p);
  await c.clearCookies();await c.addCookies([userCookie(origin,{name:rep,role:'rep'})]);await p.reload();await ready(p);const after=await model(p);
  for(const prog of after.programs){assert.deepEqual(prog.r,before.programs.find(x=>x.id===prog.id).r);checks++;}
  if(team.reps.includes(rep)){
   check(after.programs.some(p=>p.key==='two_xo'),rep+' general 2XO retained in registry');
   assert.deepEqual(after.visible,before.visible);checks++;
   if(before.visible.includes('two_xo'))check(after.visible.includes('two_xo'),rep+' territory-eligible 2XO visible');
   const response=await p.request.get(origin+'/incentive-tracking/data/program_data.js');
   const d=vm.createContext({});vm.runInContext(await response.text(),d);
   const datasets=vm.runInContext('[PROGRAM_DATA,PROGRAM_DATA_2026_09,PROGRAM_DATA_2026_10]',d);
   check(datasets.some(data=>data.two_xo),rep+' general 2XO data retained');
   await p.goto(origin+'/hub/#view=detail&only=inc&cat=inc&prog=inc:two_xo');await ready(p);
   check(await p.evaluate(()=>KohlerHub.state.prog==='inc:two_xo'),'general program deep link retained');
   check(await p.locator('#app').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('.inc-estimate').forEach(x=>x.remove());return !c.textContent.includes('$');}),'only own estimated earnings may contain dollars');
  } else {
   assert.deepEqual(after.visible,before.visible);checks++;
   check(!after.programs.some(p=>p.key==='fall_seasonal_sd'||p.key==='path_to_victory_sd'),rep+' explicit team programs excluded');
   await p.goto(origin+'/hub/#view=detail&only=inc&cat=inc&prog=inc:fall_seasonal_sd');await ready(p);
   check(await p.evaluate(()=>KohlerHub.state.prog===null),'team-only deep link blocked for another team');
  }
  assert.deepEqual(after.mpo,before.mpo);checks++;
  results.push({rep,before:before.visible,after:after.visible});await c.close();console.log('Checked '+rep);
 }
 for(const theme of ['light','dark'])for(const width of [390,820,1366]){
  const c=await browser.newContext({viewport:{width,height:1000},colorScheme:theme});
  const ownerEmail=fs.readFileSync(path.join(root,'shared/kdh-user.js'),'utf8').match(/var OWNER = '([^']+)'/)[1];
  await c.addCookies([userCookie(origin,{name:'Local Manager',role:'manager',email:ownerEmail}),{name:'kdh_preview',value:encodeURIComponent(team.reps[0]),url:origin}]);
  const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await p.goto(origin+'/hub/#view=rep&only=inc&cat=inc');await ready(p);
  check(await p.evaluate(()=>KohlerHub.incRows(KohlerHub.state.rep).some(x=>x.p.key==='two_xo')),'preview 2XO visible');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
  check(await p.locator('#app').evaluate(el=>{const c=el.cloneNode(true);c.querySelectorAll('.inc-estimate').forEach(x=>x.remove());return !c.textContent.includes('$');}),'preview dollars limited to own estimates');
  await p.screenshot({path:path.join(out,`after-${width}-${theme}.png`),fullPage:true});screens.push({width,theme});
  if(width===390)await p.locator('.hsupg').filter({hasText:'2XO Bourbon'}).screenshot({path:path.join(out,`restored-2xo-${theme}.png`)});
  if(width===390){await c.addCookies([{name:'phase1_before',value:'1',url:origin}]);await p.reload();await ready(p);await p.screenshot({path:path.join(out,`before-${width}-${theme}.png`),fullPage:true});}
  await c.close();
 }
 const c=await browser.newContext();await c.addCookies([userCookie(origin,{name:'Mike Kennedy',role:'manager'}),{name:'phase1_before',value:'1',url:origin}]);
 const p=await c.newPage();await p.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));await p.goto(origin+'/hub/');await ready(p);const baseline=await snapshot(p);
 await c.clearCookies();await c.addCookies([userCookie(origin,{name:'Mike Kennedy',role:'manager'})]);await p.reload();await ready(p);assert.deepEqual(await snapshot(p),baseline);checks++;
 check(await p.evaluate(()=>{const g=KDH_DM_GROUPS.find(g=>g.dm==='Mike Kennedy');g.reps.push('Temporary Test Rep');const allowed=kdhProgramAllowed('inc','fall_seasonal_sd','Temporary Test Rep')&&kdhProgramAllowed('inc','two_xo','Temporary Test Rep')&&kdhProgramAllowed('off','any_mpo','Temporary Test Rep');g.reps.pop();return allowed&&!kdhProgramAllowed('inc','fall_seasonal_sd','Temporary Test Rep')&&kdhProgramAllowed('inc','two_xo','Temporary Test Rep');}),'membership controls only explicit team programs');
 await c.close();check(requests.some(r=>r.role==='rep'&&r.served.includes('/data/rep/')),'actual data rewrites');check(!errors.length,'no server errors');
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,results,screens,errors},null,2));
 console.log(JSON.stringify({checks,reps:results.length,responsiveScreens:screens.length,screenshots:out}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
