// ==UserScript==
// @name Reddit Base64 Decoder (compact)
// @match https://www.reddit.com/*
// @grant none
// ==/UserScript==

(()=>{const r=/\b[A-Za-z0-9+/]{20,}={0,2}\b/g,d=s=>{try{return decodeURIComponent(escape(atob(s)))}catch{return}},s=n=>{if(n.nodeType!=3)return;let t=n.nodeValue,m=t.match(r);if(!m)return;let p=n.parentNode,f=document.createDocumentFragment();m.forEach(x=>{let v=d(x);if(!v||v.length<5)return;t.split(x).forEach((a,i)=>{f.appendChild(document.createTextNode(a));if(i<m.length){/^https?:\/\//.test(v)?(()=>{let a=document.createElement("a");a.href=v;a.textContent=v;a.target="_blank";f.appendChild(a)})():f.appendChild(document.createTextNode(v))}});p.replaceChild(f,n)})},o=n=>{let w=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);while(w.nextNode())s(w.currentNode)},b=new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(o)));b.observe(document.body,{childList:1,subtree:1});o(document.body)})();
