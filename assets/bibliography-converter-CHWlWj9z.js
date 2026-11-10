import{o as e}from"./rolldown-runtime-BCiCTKAo.js";import{z as t}from"./files-DNe_5uDt.js";import{Vt as n,a as r,b as i,d as a,m as o,r as s,s as c}from"./ui-v8VrfU8u.js";import{C as l,D as u,F as d,I as f,O as p,P as m,T as h,a as g,d as _}from"./study-BeXYYdTl.js";import{i as v,t as y}from"./ui-M9U_uCzz.js";var b=e(t(),1),x=n(),S=`@article{verma2024,
  author = {Verma, Rahul and Chen, Li},
  title = {Fast {PDF} rendering on low end phones},
  journal = {Mobile Systems Review},
  year = {2024}, volume = {8}, number = {2}, pages = {101--117},
  doi = {10.5555/msr.2024.101}
}
@book{knuth1997,
  author = {Knuth, Donald E.},
  title = {The Art of Computer Programming},
  publisher = {Addison-Wesley}, address = {Boston}, year = {1997}, edition = {3}
}`;function C(){let[e,t]=(0,b.useState)(S),[n,C]=(0,b.useState)(`ris`),w=(0,b.useMemo)(()=>{let t=_(e);try{if(!t)return{refs:[],f:t,e:e.trim()?`Could not tell the format. Paste BibTeX (@article{...}), RIS (TY  - JOUR) or CSL JSON.`:null};let n=t===`bibtex`?l(e):t===`ris`?u(e):h(e);return{refs:n,f:t,e:n.length?null:`No references found.`}}catch(e){return{refs:[],f:t,e:e.message}}},[e]),T=n===`ris`?f(w.refs):n===`bibtex`?m(w.refs):n===`csl`?d(w.refs):w.refs.map((e,t)=>p(g(e,n,t+1))).join(`

`),E=n===`ris`?`ris`:n===`bibtex`?`bib`:n===`csl`?`json`:`txt`;return(0,x.jsxs)(`div`,{className:`space-y-4`,children:[(0,x.jsxs)(`div`,{className:`grid gap-3 lg:grid-cols-[1fr_260px]`,children:[(0,x.jsxs)(`div`,{children:[(0,x.jsx)(a,{hint:w.f?`${w.f.toUpperCase()}, ${w.refs.length} references`:``,children:`Paste BibTeX, RIS or CSL JSON`}),(0,x.jsx)(i,{"aria-label":`Paste BibTeX, RIS or CSL JSON`,value:e,onChange:e=>t(e.target.value),className:`min-h-56`})]}),(0,x.jsx)(r,{compact:!0,multiple:!0,accept:`.bib,.ris,.json,.txt,.enw`,onFiles:async e=>t((await Promise.all(e.map(e=>e.text()))).join(`

`)),label:`Or drop .bib, .ris or .json files`,sub:`From Zotero, Mendeley, EndNote, Google Scholar`})]}),(0,x.jsx)(c,{error:w.e}),(0,x.jsxs)(`div`,{children:[(0,x.jsx)(a,{children:`Convert to`}),(0,x.jsx)(o,{value:n,onChange:C,options:[{value:`ris`,label:`RIS`},{value:`bibtex`,label:`BibTeX`},{value:`csl`,label:`CSL JSON`},{value:`apa`,label:`APA list`},{value:`mla`,label:`MLA list`},{value:`chicago`,label:`Chicago list`},{value:`harvard`,label:`Harvard list`},{value:`ieee`,label:`IEEE list`}]})]}),(0,x.jsx)(v,{title:`${w.refs.length} references`,text:T,filename:`references.${E}`}),[`apa`,`mla`,`chicago`,`harvard`,`ieee`,`vancouver`].includes(n)&&w.refs.length>0&&(0,x.jsx)(s,{className:`space-y-2 font-serif text-[15px]`,children:w.refs.map((e,t)=>(0,x.jsx)(`p`,{className:`pl-8 -indent-8`,children:(0,x.jsx)(y,{text:g(e,n,t+1)})},t))})]})}export{C as default};