/* Actual Hub rendering + protected per-rep dataset checks, no production writes. */
const {chromium}=require(process.env.KDH_PLAYWRIGHT||'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.KDH_TEST_OUTPUT||path.join(root,'../tmp/new-belgium-check'));
fs.mkdirSync(out,{recursive:true});
const load=code=>{const c=vm.createContext({});vm.runInContext(code+';globalThis.blocks={PROGRAM_DATA,PROGRAM_DATA_2026_09,PROGRAM_DATA_2026_10};',c);return JSON.parse(JSON.stringify(c.blocks));};
const current=load(fs.readFileSync(path.join(root,'incentive-tracking/data/program_data.js'),'utf8'));
const previous=load(cp.execFileSync('git',['show','HEAD:incentive-tracking/data/program_data.js'],{cwd:root,maxBuffer:64*1024*1024}).toString());
assert.deepEqual(current.PROGRAM_DATA,previous.PROGRAM_DATA,'August snapshot changed');
assert.deepEqual(current.PROGRAM_DATA_2026_09,previous.PROGRAM_DATA_2026_09,'September snapshot changed');
for(const [key,value] of Object.entries(previous.PROGRAM_DATA_2026_10))assert.deepEqual(current.PROGRAM_DATA_2026_10[key],value,'Unrelated October program changed: '+key);
const key='new_belgium_distribution_retain',target=current.PROGRAM_DATA_2026_10[key];
assert.equal(target.house.placements,1092);assert.equal(Object.keys(target.byRep).length,13);
for(const file of fs.readdirSync(path.join(root,'incentive-tracking/data/rep'))){
 const blocks=load(fs.readFileSync(path.join(root,'incentive-tracking/data/rep',file),'utf8'));
 const sliced=blocks.PROGRAM_DATA_2026_10[key];assert.equal(sliced.__anyData,true);
 assert.ok(Object.keys(sliced.byRep).length<=1,'Cross-rep result in '+file);
 if(file==='tony-palmisano.js')assert.deepEqual(Object.keys(sliced.byRep),['Anthony Palmisano']);
 if(file==='alex-rodriguez.js'||file==='_none.js')assert.equal(Object.keys(sliced.byRep).length,0);
}
console.log('PASS source totals, 13-rep scope, all per-rep slices, frozen August/September and unchanged other October programs');
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage(),errors=[];let slice=null;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();if(u.pathname==='/shared/auth-config.js')return route.fulfill({contentType:'application/javascript',body:'window.KDH_AUTH={};'});if(u.pathname==='/api/session')return route.fulfill({json:{}});if(u.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});if(slice&&u.pathname==='/incentive-tracking/data/program_data.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,'incentive-tracking/data/rep',slice+'.js'),'utf8')});return route.continue();});
const login=async(name,role,repSlice)=>{slice=repSlice;await page.goto('about:blank');await context.clearCookies();await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({name,role,email:'fixture@test'})),url:base}]);};
const link=rep=>base+'/hub/#'+new URLSearchParams({view:'detail',rep,prog:'inc:'+key,only:'inc',im:'2026-10',mode:'rep'}).toString().replace(/\+/g,'%20');
await login('Anthony Palmisano','rep','tony-palmisano');await page.goto(link('Anthony Palmisano'));
await page.getByText('New Belgium Distribution Retain',{exact:true}).first().waitFor();
await page.waitForFunction(()=>document.querySelector('#app').textContent.includes('160'));
const result=await page.evaluate(key=>{const p=window.KohlerHub.programs().find(p=>p.key===key);return {channel:p.channel,start:p.period.start.getFullYear()+'-'+(p.period.start.getMonth()+1),end:p.period.end.getDate(),summary:p.forRep('Anthony Palmisano'),goals:document.querySelectorAll('.bg-row').length,targets:window.KohlerHub.nextAccounts(p,'Anthony Palmisano').rows.length,rank:p.ranking().map(r=>r.rep)};},key);
assert.equal(result.channel,'off');assert.equal(result.start,'2026-9');assert.equal(result.end,31);assert.equal(result.summary.valueNum,92);assert.equal(result.summary.goalNum,160);assert.ok(Math.abs(result.summary.pct-57.5)<1e-9);assert.equal(result.goals,3);assert.equal(result.targets,0);assert.deepEqual(result.rank,['Anthony Palmisano']);
console.log('PASS actual rep Hub summary, dates, package goals, scoped ranking, no invented account targets');
for(const width of [320,390,820,1440]){await page.setViewportSize({width,height:1080});for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow '+width+' '+theme);if(width===390||width===1440)await page.screenshot({path:path.join(out,'new-belgium-'+width+'-'+theme+'.png'),fullPage:true});}}
console.log('PASS 320/390/820/1440px in both themes');
await page.evaluate(key=>{const p=window.KohlerHub.programs().find(p=>p.key===key),host=document.createElement('div');host.id='nb-card-test';host.innerHTML=p.detailHtml('Anthony Palmisano');document.querySelector('#app').replaceChildren(host);},key);
await page.getByText('See 4 reported SKUs',{exact:true}).click();await page.getByText(/16712 · New Belgium Voodoo Ranger Hoppy Variety/).waitFor();assert.ok((await page.locator('#nb-card-test').innerText()).includes('Core bonus is unverified'));
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await login('Gavin Sharkey','manager',null);await page.goto(link('Anthony Palmisano'));
await page.waitForFunction(()=>window.KohlerHub&&window.KohlerHub.programs().some(p=>p.key==='new_belgium_distribution_retain'));
const ranking=await page.evaluate(key=>window.KohlerHub.programs().find(p=>p.key===key).ranking().map(r=>r.rep),key);assert.equal(ranking.length,13);assert.equal(ranking[0],'Dave Ehlers');
await login('Alex Rodriguez','rep','alex-rodriguez');await page.goto(base+'/hub/#view=rep&rep=Alex%20Rodriguez&only=inc');await page.waitForFunction(()=>window.KohlerHub&&window.KohlerHub.programs().some(p=>p.key==='new_belgium_distribution_retain'));
assert.equal(await page.evaluate(key=>window.KohlerHub.programs().find(p=>p.key===key).forRep('Alex Rodriguez'),key),null);
assert.deepEqual(errors,[]);console.log('PASS SKU drilldown, unverified bonus, manager ranking and absent-rep exclusion; no browser errors');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
