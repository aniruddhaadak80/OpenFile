/* Builds a standalone HTML file that decrypts its own content in the browser with a password.
 * Format inside: base64 of [iter u32][salt 16][iv 12][AES-GCM ciphertext of the packed payload]. */
import { pwEncrypt, b64 } from './privacy.ts'

export function pack(kind: 'text' | 'file', name: string, mime: string, data: Uint8Array) {
  const enc = new TextEncoder(), meta = enc.encode(JSON.stringify({ kind, name, mime }))
  const out = new Uint8Array(4 + meta.length + data.length)
  new DataView(out.buffer).setUint32(0, meta.length); out.set(meta, 4); out.set(data, 4 + meta.length)
  return out
}
export function unpack(p: Uint8Array) {
  const n = new DataView(p.buffer, p.byteOffset).getUint32(0)
  return { meta: JSON.parse(new TextDecoder().decode(p.slice(4, 4 + n))) as { kind: string; name: string; mime: string }, data: p.slice(4 + n) }
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function buildHtml(payload: Uint8Array, password: string, title: string, hint: string) {
  const blob = b64(await pwEncrypt(payload, password))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f5f5f4;font:16px/1.5 system-ui,sans-serif}main{width:min(92vw,520px);padding:28px;border:1px solid #2a2a2a;border-radius:18px;background:#121212}h1{margin:0 0 6px;font-size:20px}p{color:#a8a29e;margin:0 0 16px;font-size:14px}input{box-sizing:border-box;width:100%;padding:12px;border-radius:12px;border:1px solid #333;background:#0a0a0a;color:#fff;font-size:15px}button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:12px;background:#F5A524;color:#000;font-weight:700;font-size:15px;cursor:pointer}#err{color:#F97316;font-size:13px;min-height:18px;margin-top:8px}pre{white-space:pre-wrap;word-break:break-word;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:12px;padding:14px;max-height:60vh;overflow:auto}small{display:block;margin-top:14px;color:#78716c;font-size:12px}</style></head>
<body><main><h1>${esc(title)}</h1><p>This file is locked. Enter the password to open it. Everything happens in this browser, nothing is sent anywhere.</p>${hint ? `<p>Hint: ${esc(hint)}</p>` : ''}
<form id="f"><input id="pw" type="password" placeholder="Password" autocomplete="current-password" autofocus><button>Unlock</button><div id="err"></div></form><div id="out"></div><small>Made with OpenFile. AES-256-GCM, PBKDF2-SHA256.</small></main>
<script>
const D="${blob}";
const u=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
document.getElementById('f').onsubmit=async e=>{e.preventDefault();const err=document.getElementById('err');err.textContent='Unlocking';
try{const b=u(D),dv=new DataView(b.buffer),it=dv.getUint32(0),k0=await crypto.subtle.importKey('raw',new TextEncoder().encode(document.getElementById('pw').value),'PBKDF2',false,['deriveKey']);
const k=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b.slice(4,20),iterations:it},k0,{name:'AES-GCM',length:256},false,['decrypt']);
const p=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(20,32)},k,b.slice(32)));
const n=new DataView(p.buffer).getUint32(0),m=JSON.parse(new TextDecoder().decode(p.slice(4,4+n))),d=p.slice(4+n),o=document.getElementById('out');
document.getElementById('f').remove();
if(m.kind==='text'){const pre=document.createElement('pre');pre.textContent=new TextDecoder().decode(d);o.append(pre)}
else{const url=URL.createObjectURL(new Blob([d],{type:m.mime||'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=m.name;a.textContent='Save '+m.name;a.style.cssText='display:block;text-align:center;padding:12px;border-radius:12px;background:#F5A524;color:#000;font-weight:700;text-decoration:none';o.append(a);
if(/^image\\//.test(m.mime)){const i=new Image();i.src=url;i.style.cssText='max-width:100%;margin-top:12px;border-radius:12px';o.append(i)}}
}catch(x){err.textContent='Wrong password, try again.'}};
</script></body></html>`
}
