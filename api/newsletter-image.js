/* Only newsletter editors may fetch Encompass product images. No arbitrary URL proxy. */
export const config = { runtime: 'edge' };
const MAX = 3 * 1024 * 1024;
const reply = (status, error) => Response.json({error}, {status, headers:{'cache-control':'private, no-store'}});
export function productImageUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash) return null;
    if (!['cdn.e8.co','images.encompass8.com'].includes(u.hostname)) return null;
    if (!/^\/DSDLink\/S3Images\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname)) return null;
    return u.href;
  } catch { return null; }
}
export function imageType(b) {
  if (b[0]===255 && b[1]===216 && b[2]===255) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)) return 'image/png';
  if (new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP') return 'image/webp';
  return null;
}
export default async function handler(request) {
  if(request.method!=='POST') return reply(405,'POST only.');
  if(request.headers.get('origin')!==new URL(request.url).origin) return reply(403,'Use the newsletter editor to import images.');
  const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)kdh_at=([^;]+)/)?.[1];
  if(!token) return reply(401,'Sign in again.');
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) return reply(503,'Sign-in is not configured.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
    const scope=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/kdh_newsletter_scope',{method:'POST',headers:{apikey:key,authorization:'Bearer '+decodeURIComponent(token),'content-type':'application/json'},body:'{}',signal:controller.signal});
    if(!scope.ok) return reply(401,'Sign in again.');
    if((await scope.json()).editor!==true) return reply(403,'Newsletter editing access is required.');
    const text=await request.text();if(text.length>2048) return reply(400,'Image link is too long.');
    let source;try{source=productImageUrl(JSON.parse(text).url);}catch{return reply(400,'Invalid image link.');}
    if(!source) return reply(400,'Use an Encompass product image link, or upload the image manually.');
    const upstream=await fetch(source,{redirect:'manual',signal:controller.signal});
    if(!upstream.ok||upstream.status>=300) return reply(422,'Image unavailable. Upload a replacement or skip it.');
    if(Number(upstream.headers.get('content-length'))>MAX) {await upstream.body?.cancel();return reply(413,'Image exceeds 3 MB. Upload a smaller replacement.');}
    const reader=upstream.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX){await reader.cancel();return reply(413,'Image exceeds 3 MB. Upload a smaller replacement.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const type=imageType(bytes);if(!type)return reply(422,'Choose a JPEG, PNG or WebP product image.');
    return new Response(bytes,{headers:{'content-type':type,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  } catch {return reply(502,'Image could not be loaded. Retry, upload a replacement, or skip it.');}
  finally {clearTimeout(timer);}
}
