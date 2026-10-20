/* Theme coverage and color-pair checks. No browser or backend required. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),css=fs.readFileSync(path.join(root,'shared/signature.css'),'utf8');
const tokens=s=>Object.fromEntries([...s.matchAll(/(--[\w-]+):\s*(#[a-f\d]{6})/gi)].map(x=>[x[1],x[2]]));
const light=tokens(css.match(/html:root\{([\s\S]*?)\}/)[1]);
const dark={...light,...tokens(css.match(/html:root\[data-theme="dark"\]\{([\s\S]*?)\}/)[1])};
const lum=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
let checks=0;
for(const [name,t] of Object.entries({light,dark})){
 for(const fg of ['--kdh-text','--kdh-text-2','--kdh-text-3','--kdh-text-4'])for(const bg of ['--kdh-bg','--kdh-surface','--kdh-surface-2']){assert.ok(ratio(t[fg],t[bg])>=4.5,`${name} ${fg} / ${bg}`);checks++;}
 for(const pair of [['--kdh-brand-ink','--kdh-brand'],['--kdh-brand','--kdh-brand-soft'],['--kdh-ok','--kdh-ok-soft'],['--kdh-warn','--kdh-warn-soft'],['--kdh-bad','--kdh-bad-soft'],['--kdh-gold','--kdh-gold-soft'],['--signature-side-ink','--signature-side'],['--signature-side-muted','--signature-side'],['--signature-gold','--signature-side']]){assert.ok(ratio(t[pair[0]],t[pair[1]])>=4.5,`${name} ${pair.join(' / ')}`);checks++;}
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||['node_modules','designs','tools'].includes(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let pages=0;for(const f of walk(root).filter(f=>f.endsWith('.html'))){const h=fs.readFileSync(f,'utf8');if(!h.includes('shared/kdh-user.js'))continue;assert.ok(h.includes('shared/kdh-user.js?v=20261020ws'),path.relative(root,f)+' has stale shell');assert.ok(/(?:kdh-skin|rep)\.css\?v=20261020ws/.test(h),path.relative(root,f)+' missing shared theme');pages++;}
const concepts=fs.readFileSync(path.join(root,'designs/kohler-theme-directions/concepts.html'),'utf8');
assert.equal([...concepts.matchAll(/data-variant="/g)].length,5);assert.ok(!concepts.includes('1671827')&&!concepts.includes('320.78'));
assert.ok(fs.existsSync(path.join(root,'assets/fonts/OFL-dm-sans.txt')));assert.ok(fs.statSync(path.join(root,'assets/fonts/dm-sans.ttf')).size>10000);
console.log(`${checks} theme text color pairs meet 4.5:1; ${pages} pages reference the shared Signature assets; five synthetic concepts and font license preserved.`);
