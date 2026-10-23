/* Real middleware + isolated PostgreSQL + actual site assets. Sample tags only in memory.
   No production API or account tag writes. */
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('playwright'),{database,identity}=require('./brand-fit-db.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'shots/brand-fit');fs.mkdirSync(out,{recursive:true});
const ctx=vm.createContext({Request,Response,URL,console});vm.runInContext(fs.readFileSync(path.join(root,'middleware.js'),'utf8').replace(/^import .*$/mg,'').replace(/export default /g,'').replace(/export /g,''),ctx);const route=vm.runInContext('route',ctx);
const mime={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'};
let db,browser,checks=0,origin,forceMissing=false,zeroWrite=false,failHistory=false,scopeOverride=null;const requests=[],errors=[];
const check=(v,m)=>{assert.ok(v,m);checks++;};
let queue=Promise.resolve();const locked=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
let sampleRep,account,otherAccount;
async function api(req,res,url){
 const token=(req.headers.authorization||'').replace('Bearer ','');const table=url.pathname.split('/').pop();
 requests.push({api:table,method:req.method,token});
 if(forceMissing&&table.startsWith('account_fit_')){res.writeHead(404);return res.end(JSON.stringify({code:'PGRST205'}));}
 if(table==='kdh_program_scope'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(scopeOverride||{manager:token==='mgr',admin:false,team:[sampleRep.rep],brands:null}));}
 if(!['account_fit_types','account_fit_tags'].includes(table)){res.setHeader('content-type','application/json');return res.end('[]');}
 let body='';for await(const chunk of req)body+=chunk;const data=body?JSON.parse(body):null;
 await locked(async()=>{
  await identity(db,token);let sql='',args=[];
  const where=[];for(const key of ['customer_num','type_id','id']){const value=url.searchParams.get(key);if(value?.startsWith('eq.')){args.push(value.slice(3));where.push(key+'=$'+args.length);}}
  const wh=where.length?' where '+where.join(' and '):'';
  if(req.method==='GET'){sql='select '+(table==='account_fit_types'?'id,label,families':'customer_num,type_id')+' from '+table+wh+' order by '+(table==='account_fit_types'?'id':'customer_num,type_id')+' limit '+Math.min(Number(url.searchParams.get('limit')||500),500)+' offset '+Number(url.searchParams.get('offset')||0);}
  else if(zeroWrite){res.setHeader('content-type','application/json');return res.end('[]');}
  else if(req.method==='POST'){
   const keys=table==='account_fit_types'?['label','families']:['customer_num','type_id'];args=keys.map(k=>data[k]);sql='insert into '+table+'('+keys.join(',')+') values($1,$2) returning *';
  }else if(req.method==='PATCH'){args.push(data.label,data.families);sql='update '+table+' set label=$'+(args.length-1)+',families=$'+args.length+wh+' returning *';}
  else if(req.method==='DELETE')sql='delete from '+table+wh+' returning *';
  try{const rows=(await db.query(sql,args)).rows;res.setHeader('content-type','application/json');res.end(JSON.stringify(rows));}
  catch(e){res.writeHead(e.code==='42501'?403:400,{'content-type':'application/json'});res.end(JSON.stringify({code:e.code}));}
 });
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin||'http://127.0.0.1');
  if(url.pathname.startsWith('/test-api/rest/v1/'))return await api(req,res,url);
  const c=(req.headers.cookie||'').match(/(?:^|;\s*)kdh_user=([^;]+)/);const user=c?JSON.parse(decodeURIComponent(c[1])):{name:'Local Manager',role:'manager'};
  if(url.pathname==='/shared/auth-config.js'){res.setHeader('content-type','application/javascript');return res.end('window.KDH_AUTH='+JSON.stringify({url:origin+'/test-api',key:'local-fixture'})+';');}
  const verdict=route(new Request(url,{headers:{accept:req.headers.accept||'*/*'}}),url,{ok:true,...user});
  if(verdict.status!==200){res.writeHead(verdict.status,Object.fromEntries(verdict.headers));return res.end(await verdict.text());}
  const pathname=verdict.headers.get('x-middleware-rewrite')?new URL(verdict.headers.get('x-middleware-rewrite')).pathname:url.pathname;
  requests.push({role:user.role,path:pathname});
  if(failHistory&&pathname.includes('/data/hist/')){res.writeHead(503);return res.end();}
  const f=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  let body=fs.readFileSync(f);
  if(pathname==='/accounts/brand-fit.html'||pathname==='/accounts/'||pathname==='/accounts/index.html')body=String(body).replace('<main ', '<div style="padding:14px;background:#fff3cd;color:#523d00;text-align:center;font-size:16px" role="note">Local Test · Sample Account Tags Only</div><main ');
  res.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');res.end(body);
 }catch(e){if(e.code!=='ENOENT')errors.push(e.message);res.writeHead(404);res.end();}
});
async function pageFor(user={name:'Local Manager',role:'manager'},token='mgr'){
 const c=await browser.newContext();await c.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify(user)),url:origin},{name:'kdh_at',value:token,url:origin}]);
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('https://**/*',r=>r.abort());return p;
}
async function fitReady(p){await p.locator('#bfNew').waitFor();}
(async()=>{
 db=await database();const idx=JSON.parse(fs.readFileSync(path.join(root,'accounts/data/index.json')));
 sampleRep=idx.reps.find(r=>r.key==='chris-payton');
 const book=JSON.parse(fs.readFileSync(path.join(root,'accounts/data/reps/'+sampleRep.key+'.json')));account=book.accounts.find(a=>a.area==='Passaic');assert.ok(account);otherAccount=book.accounts.find(a=>a.n!==account.n);
 assert.ok(account);await db.query('insert into account_assignments values($1,$2),($3,$4)',[String(account.n),'rep',String(otherAccount.n),'other']);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const p=await pageFor();await p.goto(origin+'/accounts/brand-fit.html');await fitReady(p);
 check(await p.getByText('No tagged, eligible accounts yet.',{exact:true}).isVisible(),'no invented account tags on initial page');
 check(await p.getByText('Dive Bar',{exact:true}).isVisible(),'seed mapping rendered');
 await p.getByRole('button',{name:'Add Account Type'}).click();await p.getByRole('textbox',{name:'Account Type',exact:true}).fill('Sample Test Type');
 await p.getByLabel('Brand Families',{exact:true}).selectOption(['Miller High Life']);await p.getByRole('button',{name:'Save Mapping',exact:true}).click();await p.getByText('Mapping Saved',{exact:true}).waitFor();checks++;
 await p.reload();await fitReady(p);check(await p.getByText('Sample Test Type',{exact:true}).isVisible(),'mapping persists after reload through real PostgreSQL');
 const section=p.locator('details').filter({has:p.locator('summary').filter({hasText:/^Sample Test Type$/})});await section.locator('summary').click();await section.getByRole('button',{name:'Edit Mapping'}).click();await p.getByRole('textbox',{name:'Account Type',exact:true}).fill('Sample Renamed Type');await p.getByRole('button',{name:'Save Mapping',exact:true}).click();await p.getByText('Mapping Saved',{exact:true}).waitFor();checks++;
 const ap=await pageFor();await ap.goto(origin+'/accounts/#acct='+account.n+'&rep='+encodeURIComponent(sampleRep.rep)+'&sec=products');
 await ap.locator('#brandFit').getByText('Account Type Not Tagged',{exact:true}).waitFor();checks++;
 await ap.locator('#brandFit summary').click();await ap.locator('#brandFit').getByLabel('Dive Bar',{exact:true}).check();await ap.getByRole('button',{name:'Save Account Types',exact:true}).click();await ap.locator('#brandFit [role=status]').getByText('Saved',{exact:true}).waitFor();checks++;
 await ap.reload();await ap.locator('#brandFit .bf-row').first().waitFor();check((await ap.locator('#brandFit .bf-row').count())>0,'tag persists and eligible fits render');
 await p.reload();await fitReady(p);check(await p.locator('summary').filter({hasText:/^Dive Bar ·/}).count()>0,'summary reflects saved account tag');
 // Every missing detail must agree with the account engine using the same stored tag/history.
 const compare=await p.evaluate(async n=>{
  const [data,cat,h,prod]=await Promise.all([KdhBrandFit.load(),fetch('data/catalog.json').then(r=>r.json()),fetch('data/hist/chris-payton.json').then(r=>r.json()),fetch('data/products.json').then(r=>r.json())]);
  const a=HUB_ACCOUNTS.reps['Chris Payton'].find(a=>String(a.n)===String(n));return KdhBrandFitEngine.rows({account:a,...data,catalog:cat.products,permissions:await KdhBrandFit.permissions(HUB_BRANDS),history:h.accounts[String(n)]||{},months:h.months,ref:h.ref,products:prod.products});
 },account.n);const badges=await ap.locator('#brandFit .bf-row').allTextContents();for(const r of compare)check(badges.some(s=>s.includes(r.family)&&s.includes(r.buying?'Buying':'Pitch Idea')),'summary/account same buying decision '+r.family);
 for(const width of [390,820,1366])for(const theme of ['light','dark']){
  for(const x of [p,ap]){await x.setViewportSize({width,height:1000});await x.evaluate(t=>{localStorage.setItem('kdh_theme',t);document.documentElement.dataset.theme=t;},theme);}
  const info=await p.evaluate(()=>({over:document.documentElement.scrollWidth>innerWidth,box:document.getElementById('brandFitApp').getBoundingClientRect().width}));check(!info.over&&info.box<=960,'manager responsive '+width+theme);
  check(!(await ap.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'account no overflow '+width+theme);
  await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(out,`summary-${width}-${theme}.png`),fullPage:true});
  await ap.locator('#brandFit').evaluate(el=>{if(!el.querySelector('[data-sample]')){const note=document.createElement('p');note.dataset.sample='1';note.textContent='Local Test · Sample Account Tag';el.prepend(note);}});
  await ap.locator('#brandFit').evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-110));
  await ap.locator('#brandFit').screenshot({path:path.join(out,`account-${width}-${theme}.png`)});
  await p.getByRole('button',{name:'Add Account Type'}).click();await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:path.join(out,`editor-${width}-${theme}.png`),fullPage:true});await p.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 // Actual manager entry, team/brand scope and missing-account detail.
 const detail=p.locator('details').filter({has:p.locator('summary').filter({hasText:/^Dive Bar · Narragansett ·/})});await detail.locator('summary').click();check(await detail.locator('a').count()===1,'missing count has exactly one account link');
 const scopedFiles=requests.filter(r=>r.path?.includes('/accounts/data/hist/'));check(scopedFiles.every(r=>r.path.endsWith('/chris-payton.json')),'manager report fetches only assigned team history');
 scopeOverride={manager:true,admin:false,team:[sampleRep.rep],brands:['Pabst Blue Ribbon']};await p.reload();await fitReady(p);
 check(await p.locator('summary').filter({hasText:/^Dive Bar · Pabst Blue Ribbon ·/}).count()===1,'assigned brand kept');check(await p.locator('summary').filter({hasText:/^Dive Bar · Narragansett ·/}).count()===0,'unassigned brand excluded');
 scopeOverride={manager:true,admin:false,team:[],brands:[]};await p.reload();await p.getByText('No team or brands are assigned to this sign-in.',{exact:true}).waitFor();checks++;
 scopeOverride=null;await p.reload();await fitReady(p);
 // Zero rows must not be reported as a saved write.
 zeroWrite=true;await p.getByRole('button',{name:'Add Account Type'}).click();await p.getByRole('textbox',{name:'Account Type',exact:true}).fill('Sample Failed Save');await p.getByLabel('Brand Families',{exact:true}).selectOption(['Sapporo']);await p.getByRole('button',{name:'Save Mapping',exact:true}).click();await p.getByText('The change was not saved. Reload and try again.',{exact:true}).waitFor();checks++;zeroWrite=false;await p.getByRole('button',{name:'Cancel',exact:true}).click();
 forceMissing=true;await p.reload();await p.getByText('Brand Fits setup is pending.',{exact:true}).waitFor();checks++;forceMissing=false;await p.getByRole('button',{name:'Retry',exact:true}).click();await fitReady(p);checks++;
 failHistory=true;await p.reload();await fitReady(p);check(await p.locator('.bf-row').filter({hasText:'History Unavailable'}).count()>0,'failed history visible instead of missing');failHistory=false;
 // Pagination uses the same REST/SQL boundary and must not silently stop at 500/1000.
 await locked(async()=>{await db.exec('reset role');await db.exec("insert into account_assignments select 'sample-'||g,'rep' from generate_series(1,1100) g;insert into account_fit_tags select 'sample-'||g,'b5f17000-0000-4000-8000-000000000001'::uuid from generate_series(1,1100) g;");});
 check(await p.evaluate(async()=>{const d=await KdhBrandFit.load();return d.tags.length===1101;}),'all 1101 saved tags paginated');
 for(const role of ['rep','associate']){
  const rp=await pageFor({role,name:role==='rep'?'Chris Payton':'Local Associate'},role);
  for(const file of ['brand-fit.html','brand-fit.js','brand-fit-engine.js','brand-fit-manager.js','brand-fit.css']){
   const response=await rp.request.get(origin+'/accounts/'+file,{headers:{accept:'application/json'},maxRedirects:0});check(response.status()===403,role+' rollout blocks '+file);
  }
  const before=requests.filter(r=>r.api?.startsWith('account_fit_')).length;
  await rp.goto(origin+'/accounts/brand-fit.html');check(!rp.url().includes('brand-fit.html'),role+' page redirected');check(requests.filter(r=>r.api?.startsWith('account_fit_')).length===before,role+' cannot fetch fit API via page');await rp.context().close();
 }
 // Page-level gate independently refuses a rep identity even without middleware (fixture route).
 const preview=await pageFor();await preview.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{});});
 await preview.route('**/accounts/brand-fit.html',async r=>{const body=fs.readFileSync(path.join(root,'accounts/brand-fit.html'),'utf8').replace('<script src="brand-fit-manager.js', '<script>window.kdhUser=()=>({role:"rep",name:"Chris Payton",preview:true});</script><script src="brand-fit-manager.js');await r.fulfill({contentType:'text/html',body});});
 const prior=requests.filter(r=>r.api?.startsWith('account_fit_')).length;await preview.goto(origin+'/accounts/brand-fit.html');await preview.getByText('Managers Only',{exact:true}).waitFor();check(requests.filter(r=>r.api?.startsWith('account_fit_')).length===prior,'preview gate performs no fit requests');
 await ap.evaluate(()=>{location.hash='';});await ap.getByRole('link',{name:'Brand Fits',exact:true}).waitFor();
 for(const theme of ['light','dark']){await ap.setViewportSize({width:390,height:1000});await ap.evaluate(t=>{document.documentElement.dataset.theme=t;window.scrollTo(0,0);},theme);check(!(await ap.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'Accounts entry no phone overflow '+theme);await ap.screenshot({path:path.join(out,'entry-390-'+theme+'.png')});}
 await ap.getByRole('link',{name:'Brand Fits',exact:true}).click();await fitReady(ap);checks++;
 check(errors.length===0,'no browser/server errors: '+errors.join(';'));
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,account:String(account.n),sampleTags:true,errors},null,2));console.log(checks+' full-flow/browser checks passed; screenshots '+out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));await db?.close();});
