/* UI integration checks with an isolated API fixture; SQL security is tested separately. */
const {chromium}=require(process.env.KDH_PLAYWRIGHT||'playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.KDH_TEST_OUTPUT||path.join(root,'../tmp/work-check'));
fs.mkdirSync(out,{recursive:true});
const people=[{email:'r@test',name:'Rep One',role:'rep'},{email:'a@test',name:'Associate One',role:'associate'},{email:'m@test',name:'Manager One',role:'manager'}];
let tasks=[],messages=[],conversations=[],notices=[],comments=[],checks=0,dropMessage=false,dropTask=false,writes=0;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fixture={id:'10000000-0000-0000-0000-000000000001',title:'Check Carbliss placement',description:'Review the display',task_type:'other',rep_email:'r@test',rep_name:'Rep One',associate_email:'r@test',associate_name:'Rep One',personal:true,status:'assigned',planned_on:today,sort_order:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null};tasks.push(fixture);
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
try{
const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const login=async role=>{await page.goto('about:blank');const u=people.find(p=>p.role===role);await context.clearCookies();await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify(u)),url:base},{name:'kdh_at',value:'fixture',url:base}]);};
await page.route('**/*',async route=>{const request=route.request(),u=new URL(request.url()),pathname=u.pathname;
 if(u.origin!==base)return route.abort();
 if(pathname==='/shared/auth-config.js')return route.fulfill({contentType:'application/javascript',body:`window.KDH_AUTH={url:'${base}',key:'fixture'};`});
 if(pathname.includes('/shared/vendor/'))return route.fulfill({contentType:'application/javascript',body:'/* SQL tests separately verify durable events. */'});
 if(pathname==='/api/session')return route.fulfill({json:{}});
 if(!pathname.startsWith('/rest/v1/'))return route.continue();
 const userCookie=(await context.cookies()).find(c=>c.name==='kdh_user');if(!userCookie)return route.fulfill({status:401,json:{message:'Sign in'}});const user=JSON.parse(decodeURIComponent(userCookie.value));const table=pathname.slice('/rest/v1/'.length),body=request.postDataJSON(),method=request.method();let result=[];
 if(method!=='GET'&&!table.startsWith('rpc/kdh_people')&&!table.startsWith('rpc/kdh_work_people')&&!table.startsWith('rpc/kdh_team'))writes++;
 const filtered=rows=>rows.filter(row=>[...u.searchParams].every(([k,v])=>!v.startsWith('eq.')||String(row[k])===v.slice(3)));
 if(table==='rpc/kdh_work_people')result=people;
 else if(table==='rpc/kdh_people')result=people.filter(p=>p.role===body.p_role);
 else if(table==='field_tasks'){
 if(method==='POST'){let t=tasks.find(t=>t.id===body.id);if(!t){t={...fixture,...body,id:body.id||crypto.randomUUID(),rep_email:user.email,rep_name:user.name,associate_name:people.find(p=>p.email===body.associate_email)?.name,personal:body.associate_email===user.email,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};tasks.push(t);result=[t];}}
 else if(method==='PATCH'){result=filtered(tasks);result.forEach(t=>{Object.assign(t,body,{updated_at:new Date().toISOString()});if(body.associate_email){t.associate_name=people.find(p=>p.email===body.associate_email)?.name;t.personal=t.associate_email===t.rep_email;}if(body.status==='done')t.completed_at=new Date().toISOString();else if(body.status)t.completed_at=null;});}
 else if(method==='DELETE'){const ids=filtered(tasks).map(t=>t.id);result=filtered(tasks);tasks=tasks.filter(t=>!ids.includes(t.id));}
 else result=filtered(tasks).filter(t=>user.role==='manager'||t.rep_email===user.email||t.associate_email===user.email);
 }else if(table==='field_task_comments'){if(method==='POST'){const c={...body,id:comments.length+1,author_email:user.email,author_name:user.name,created_at:new Date().toISOString()};comments.push(c);result=[c];}else result=filtered(comments);}
 else if(table==='work_notifications'){result=filtered(notices.filter(n=>n.recipient===user.email));if(method==='PATCH')result.forEach(n=>Object.assign(n,body));}
 else if(table==='work_conversations')result=conversations.filter(c=>[c.person_a,c.person_b].includes(user.email));
 else if(table==='work_messages')result=filtered(messages);
 else if(table==='rpc/kdh_message_send'){let c=conversations.find(c=>[c.person_a,c.person_b].includes(user.email)&&[c.person_a,c.person_b].includes(body.p_to));if(!c){c={id:crypto.randomUUID(),person_a:user.email,person_b:body.p_to};conversations.push(c);}result=messages.find(m=>m.client_id===body.p_client);if(!result){result={id:messages.length+1,client_id:body.p_client,conversation_id:c.id,body:body.p_body,author_email:user.email,created_at:new Date().toISOString()};messages.push(result);notices.push({id:notices.length+1,recipient:body.p_to,event_key:'message:'+result.id,conversation_id:c.id,label:'Message from '+user.name,created_at:result.created_at,read_at:null});}}
 else if(table==='rpc/kdh_message_read'){notices.filter(n=>n.recipient===user.email&&n.conversation_id===body.p_conversation).forEach(n=>n.read_at=new Date().toISOString());result=null;}
 if(dropTask&&table==='field_tasks'&&method==='POST'){dropTask=false;return route.abort('failed');}
 if(dropMessage&&table==='rpc/kdh_message_send'){dropMessage=false;return route.abort('failed');}
 await route.fulfill({json:result});});
const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
await login('rep');await page.goto(base+'/rep/');
await check('My Day renders on rep Home',()=>page.getByRole('heading',{name:'My Day',exact:true}).waitFor());
await check('quick entry persists through reload',async()=>{await page.getByRole('textbox',{name:'New task',exact:true}).fill('Review Red Bull incentives');await page.getByRole('button',{name:'Add Task',exact:true}).click();await page.locator('[data-my-day]').getByText('Review Red Bull incentives',{exact:true}).waitFor();await page.reload();await page.locator('[data-my-day]').getByText('Review Red Bull incentives',{exact:true}).waitFor();assert.equal(tasks.filter(t=>t.title==='Review Red Bull incentives').length,1);});
await check('checkbox completes personal task',async()=>{await page.getByRole('checkbox',{name:'Complete Review Red Bull incentives'}).check();await page.waitForFunction(()=>document.querySelector('[data-my-day]').textContent.includes('1 of 2 complete'));assert.equal(tasks.find(t=>t.title==='Review Red Bull incentives').status,'done');});
await check('reorder saves rank',async()=>{await page.getByRole('button',{name:'Reorder',exact:true}).click();await page.getByRole('button',{name:'Move Review Red Bull incentives up'}).click();await page.waitForFunction(()=>document.querySelector('.work-row .work-title').textContent==='Review Red Bull incentives');assert.ok(tasks[1].sort_order<tasks[0].sort_order);await page.getByRole('button',{name:'Done Reordering'}).click();});
await check('phone has no horizontal overflow',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));
await check('small phone fits',async()=>{await page.setViewportSize({width:320,height:720});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:390,height:844});});
await page.screenshot({path:path.join(out,'my-day-mobile.png'),fullPage:false});
await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:path.join(out,'my-day-mobile-dark.png'),fullPage:false});
await check('delegation reuses personal task',async()=>{await page.goto(base+'/tasks/#edit='+fixture.id);await page.locator('#fAssoc').selectOption('a@test');await page.getByRole('button',{name:'Save Changes'}).click();await page.locator('.dtitle').waitFor();assert.equal(tasks.find(t=>t.id===fixture.id).associate_email,'a@test');assert.equal(tasks.length,2);});
await check('account task prefills CustomerID',async()=>{await page.goto(base+'/tasks/?account=001&name=ABC%20Liquors#new');await page.locator('#acctPicked').waitFor();assert.equal(await page.locator('#acctPicked').getAttribute('data-n'),'001');});
await check('direct message retry after lost response sends only once',async()=>{await page.getByRole('button',{name:/Messages/}).click();await page.locator('#work-person').selectOption('a@test');await page.getByRole('textbox',{name:'Message',exact:true}).fill('Can you check the display?');dropMessage=true;await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('.work-dialog [data-work-error]').getByText(/fetch/i).waitFor();await page.getByRole('button',{name:'Send',exact:true}).click();await page.locator('.work-thread').getByText('Can you check the display?',{exact:false}).waitFor();assert.equal(messages.length,1);});
await login('associate');await page.goto(base+'/tasks/');
await check('associate sees assigned work',()=>page.getByText('Check Carbliss placement',{exact:true}).waitFor());
await check('unread message badge and read state',async()=>{await page.locator('[data-msg-count]').getByText('1',{exact:true}).waitFor();await page.getByRole('button',{name:/Messages/}).click();await page.locator('[data-conversation]').click();await page.locator('.work-thread').getByText('Can you check the display?',{exact:false}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-msg-count]').textContent==='');});
await login('manager');await page.goto(base+'/tasks/');
await check('manager assignment and customer filter',async()=>{await page.getByRole('link',{name:'Assign Task',exact:true}).click();await page.locator('#fAssoc').selectOption('r@test');await page.locator('#fTitle').fill('Review account priorities');await page.getByRole('button',{name:'Assign Task',exact:true}).click();await page.locator('.dtitle').waitFor();assert.equal(tasks.at(-1).associate_email,'r@test');await page.goto(base+'/tasks/');await page.locator('#mf-account').waitFor();});
await page.setViewportSize({width:820,height:1180});await page.screenshot({path:path.join(out,'manager-tablet.png'),fullPage:true});
await check('tablet has no horizontal overflow',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true));
await login('rep');await page.goto(base+'/rep/');
await check('task retry after lost response does not duplicate',async()=>{await page.getByRole('textbox',{name:'New task',exact:true}).fill('Retry this checklist item');dropTask=true;await page.getByRole('button',{name:'Add Task',exact:true}).click();await page.locator('[data-my-day] [data-work-error]').getByText(/fetch/i).waitFor();await page.getByRole('button',{name:'Add Task',exact:true}).click();await page.locator('.work-title').getByText('Retry this checklist item',{exact:true}).waitFor();assert.equal(tasks.filter(t=>t.title==='Retry this checklist item').length,1);});
await check('account timeline uses task audit events',async()=>{fixture.account_num='001';fixture.field_task_comments=[{id:91,kind:'status',body:'done: Display checked',created_at:new Date().toISOString(),author_name:'Associate One'}];await page.evaluate(()=>{const section=document.createElement('section');section.id='actFeed';document.body.append(section);});await page.addScriptTag({url:base+'/accounts/activity.js'});await page.evaluate(()=>window.KdhActivity.attach({n:'001',name:'ABC Liquors',prem:'Off',me:{email:'r@test'},readOnly:false,extra:{},progName:s=>s,hubLink:()=>'/hub/'}));await page.locator('#actFeed').getByRole('link',{name:'Check Carbliss placement',exact:true}).first().waitFor();const events=await page.evaluate(()=>window.KdhActivity._events().filter(e=>e.type==='task').map(e=>e.id));assert.deepEqual(events.sort(),['task:'+fixture.id,'task-event:91'].sort());});
await login('manager');await context.addCookies([{name:'kdh_preview',value:encodeURIComponent('Rep One'),url:base}]);
await check('preview disables checklist and communication writes',async()=>{await page.goto(base+'/rep/');await page.waitForFunction(()=>document.querySelector('[data-my-day]').hidden);assert.equal(await page.locator('.work-tools').count(),0);const before=writes;await page.goto(base+'/tasks/#task='+fixture.id);await page.locator('.dtitle').waitFor();assert.equal(await page.locator('#composer,#btnDone,#btnWithdraw').count(),0);assert.equal(writes,before);});
await login('manager');await context.addCookies([{name:'kdh_user',value:encodeURIComponent(JSON.stringify({...people.find(p=>p.role==='manager'),ws:'finance'})),url:base}]);
await check('finance workspace keeps its existing boundaries',async()=>{await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('[data-my-day]').hidden);assert.equal(await page.locator('.work-tools').count(),0);});
await check('no uncaught browser errors',async()=>assert.deepEqual(errors,[]));
console.log(`${checks} browser checks passed; screenshots: ${out}`);
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
