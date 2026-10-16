const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');let checks=0;
const source=fs.readFileSync(path.join(root,'middleware.js'),'utf8').replace(/^import .*$/mg,'').replace(/export default /g,'').replace(/export /g,'');
const c=vm.createContext({Response,Request,URL,console});vm.runInContext(source,c);
function route(p,role,email='',preview=''){c.req=new Request('https://example.test'+p,{headers:{accept:'text/html',cookie:'kdh_preview='+encodeURIComponent(preview)}});c.url=new URL(c.req.url);c.verdict={ok:true,role,email};return vm.runInContext('route(req,url,verdict)',c);}
for(const [role,dest] of [['rep','/rep/'],['associate','/associate/']]){assert.equal(new URL(route('/',role).headers.get('location')).pathname,dest);assert.equal(route(dest,role).headers.get('x-middleware-next'),'1');checks+=2;}
for(const p of ['/rep/','/rep/index.html','/associate/','/associate/index.html']){assert.equal(new URL(route(p,'manager').headers.get('location')).pathname,'/');checks++;}
for(const role of ['manager','rep','associate']){assert.equal(route('/tasks/',role).headers.get('x-middleware-next'),'1');checks++;}
const shell=fs.readFileSync(path.join(root,'shared/kdh-user.js'),'utf8');
for(const role of ['manager','rep','associate','owner','owner-rep','owner-associate']){
 let written='';const actual={name:'Actual User',email:role.startsWith('owner')?'g.sharkey@kohlerdist.com':'actual@example.test',role:role==='owner'?'manager':role==='owner-rep'?'rep':role==='owner-associate'?'associate':role};
 const d={currentScript:{src:'https://example.test/shared/kdh-user.js'},readyState:'loading',addEventListener(){},dispatchEvent(){},documentElement:{setAttribute(){},classList:{toggle(){}}}};
 Object.defineProperty(d,'cookie',{get:()=> 'kdh_user='+encodeURIComponent(JSON.stringify(actual))+'; kdh_preview='+encodeURIComponent(JSON.stringify({name:'Someone Else',role:'manager'})),set:v=>{written=v;}});
 const context={document:d,URL,console,CustomEvent,location:{protocol:'https:',pathname:'/'},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},matchMedia:()=>({matches:false,addEventListener(){}})};context.window=context;
 vm.createContext(context);vm.runInContext(shell,context);
 if(role==='owner'){
   assert.equal(context.kdhUser().name,'Someone Else');assert.equal(context.kdhUser().preview,true);assert.equal(typeof context.kdhViewAs,'function');checks++;
   context.kdhSetPreview({name:'Preview Associate',role:'associate',email:'associate@example.test'});assert.ok(written.includes('Max-Age=86400'));assert.ok(written.includes('Preview%20Associate'));checks++;
   context.kdhExitPreview();assert.ok(written.includes('Max-Age=0'));checks++;continue;
 }
 assert.equal(context.kdhUser().name,actual.name);assert.equal(context.kdhUser().role,actual.role);assert.equal(context.kdhUser().preview,undefined);checks++;
 assert.equal(context.kdhViewAs,undefined);assert.equal(context.kdhViewAsRep,undefined);checks++;
 context.kdhSetPreview('Someone Else');assert.ok(written.includes('Max-Age=0'));assert.ok(!written.includes('Someone'));checks++;
}
for(const p of ['/rep/','/associate/']){
 assert.equal(route(p,'manager','g.sharkey@kohlerdist.com','Preview Rep').headers.get('x-middleware-next'),'1');checks++;
 assert.equal(new URL(route(p,'manager','other@example.test','Preview Rep').headers.get('location')).pathname,'/');checks++;
 assert.equal(new URL(route(p,'manager','g.sharkey@kohlerdist.com').headers.get('location')).pathname,'/');checks++;
}
for(const name of ['index.html','rep/index.html','associate/index.html','team/index.html']){
 const h=fs.readFileSync(path.join(root,name),'utf8');assert.ok(!/id="viewAsBtn"|id="previewBtn"|data-preview=|id="repSelect"/.test(h),name);checks++;
 for(const script of h.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1],{filename:name});
}
assert.ok(fs.readFileSync(path.join(root,'login/index.html'),'utf8').includes("role === 'associate' ? '/associate/'"));checks++;
console.log(`${checks} role landing, signed-in identity, owner-only View As and inline syntax checks passed`);
