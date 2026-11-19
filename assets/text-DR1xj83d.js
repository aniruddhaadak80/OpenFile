var e=[[1e3,`M`],[900,`CM`],[500,`D`],[400,`CD`],[100,`C`],[90,`XC`],[50,`L`],[40,`XL`],[10,`X`],[9,`IX`],[5,`V`],[4,`IV`],[1,`I`]];function t(t){if(!Number.isInteger(t)||t<1||t>3999)return``;let n=``;for(let[r,i]of e)for(;t>=r;)n+=i,t-=r;return n}function n(n){let r=n.trim().toUpperCase();if(!/^[MDCLXVI]+$/.test(r))return NaN;let i=0;for(let t=0;t<r.length;t++){let n=e.find(e=>e[1]===r[t])[0],a=t+1<r.length?e.find(e=>e[1]===r[t+1])[0]:0;i+=n<a?-n:n}return t(i)===r?i:NaN}function r(e){return e.split(`
`).map(e=>{let r=e.trim();if(!r)return``;if(/^\d+$/.test(r))return t(Number(r))||`out of range (1 to 3999)`;let i=n(r);return Number.isNaN(i)?`not a valid numeral`:String(i)}).join(`
`)}var i={A:`.-`,B:`-...`,C:`-.-.`,D:`-..`,E:`.`,F:`..-.`,G:`--.`,H:`....`,I:`..`,J:`.---`,K:`-.-`,L:`.-..`,M:`--`,N:`-.`,O:`---`,P:`.--.`,Q:`--.-`,R:`.-.`,S:`...`,T:`-`,U:`..-`,V:`...-`,W:`.--`,X:`-..-`,Y:`-.--`,Z:`--..`,0:`-----`,1:`.----`,2:`..---`,3:`...--`,4:`....-`,5:`.....`,6:`-....`,7:`--...`,8:`---..`,9:`----.`,".":`.-.-.-`,",":`--..--`,"?":`..--..`,"'":`.----.`,"!":`-.-.--`,"/":`-..-.`,"(":`-.--.`,")":`-.--.-`,"&":`.-...`,":":`---...`,";":`-.-.-.`,"=":`-...-`,"+":`.-.-.`,"-":`-....-`,_:`..--.-`,'"':`.-..-.`,$:`...-..-`,"@":`.--.-.`},a=Object.fromEntries(Object.entries(i).map(([e,t])=>[t,e]));function o(e){return e.toUpperCase().split(`
`).map(e=>e.split(/\s+/).filter(Boolean).map(e=>[...e].map(e=>i[e]??``).filter(Boolean).join(` `)).join(` / `)).join(`
`)}function s(e){return e.split(`
`).map(e=>e.split(/\s*\/\s*|\s{3,}/).map(e=>e.trim().split(/\s+/).filter(Boolean).map(e=>a[e]??`?`).join(``)).join(` `)).join(`
`)}function c(e){return/^[\s.\-/_·–•]+$/.test(e)&&/[.\-]/.test(e)?s(e.replace(/[·•]/g,`.`).replace(/[–_]/g,`-`)):o(e)}function l(e,t){let n=e.split(/\r?\n/),r=new Map,i=e=>{let n=t.trim?e.trim():e;return t.ignoreCase&&(n=n.toLowerCase()),n};for(let e of n)r.set(i(e),(r.get(i(e))??0)+1);let a=new Set,o=[];for(let e of n){let n=i(e);t.dropEmpty&&n===``||(t.onlyDuplicates?(r.get(n)??0)>1&&!a.has(n)&&(a.add(n),o.push(e)):a.has(n)||(a.add(n),o.push(e)))}return{text:o.join(`
`),removed:n.length-o.length}}function u(e,t,n){let r=e.split(/\r?\n/),i=e=>n?e.toLowerCase():e;switch(t){case`az`:return r.sort((e,t)=>i(e)<i(t)?-1:+(i(e)>i(t))).join(`
`);case`za`:return r.sort((e,t)=>i(e)<i(t)?1:i(e)>i(t)?-1:0).join(`
`);case`natural`:return r.sort((e,t)=>i(e).localeCompare(i(t),void 0,{numeric:!0})).join(`
`);case`length`:return r.sort((e,t)=>e.length-t.length).join(`
`);case`numeric`:return r.sort((e,t)=>(parseFloat(e)||0)-(parseFloat(t)||0)).join(`
`);case`reverse`:return r.reverse().join(`
`);case`random`:for(let e=r.length-1;e>0;e--){let t=Math.floor(Math.random()*(e+1));[r[e],r[t]]=[r[t],r[e]]}return r.join(`
`)}}function d(e,t,n){return e.split(/\r?\n/).map((e,r)=>`${t+r}${n}${e}`).join(`
`)}function f(e,t){return e.split(`
`).map(e=>{let n=[],r=``;for(let i of e.split(/\s+/).filter(Boolean))r&&(r+` `+i).length>t?(n.push(r),r=i):r=r?r+` `+i:i;return r&&n.push(r),n.join(`
`)}).join(`
`)}function p(e,t){let n=e=>{let t=e.replace(`#`,``),n=t.length===3?[...t].map(e=>e+e).join(``):t;return[0,2,4].map(e=>parseInt(n.slice(e,e+2),16))},r=e=>{let[t,r,i]=n(e).map(e=>{let t=e/255;return t<=.03928?t/12.92:((t+.055)/1.055)**2.4});return .2126*t+.7152*r+.0722*i},i=r(e),a=r(t),o=(Math.max(i,a)+.05)/(Math.min(i,a)+.05);return{ratio:o,aaText:o>=4.5,aaLarge:o>=3,aaaText:o>=7,aaaLarge:o>=4.5}}export{u as a,r as i,l as n,p as o,c as r,f as s,d as t};