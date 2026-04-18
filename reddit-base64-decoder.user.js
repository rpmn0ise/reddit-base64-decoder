// ==UserScript==
// @name         Reddit Base64 Decoder
// @version      1.0
// @description  Userscript that automatically detects and decodes Base64 strings on Reddit, replacing them with readable content.
// @match        https://www.reddit.com/*
// @grant        none
// @license      MIT
// @namespace    https://github.com/rpmn0ise
// ==/UserScript==
 
(function() {
    const base64Regex = /[A-Za-z0-9+/]{20,}={0,2}/g;
 
    function decodeBase64(str) {
        try {
            const binary = atob(str);
    
            // check rapide : est-ce que c’est du texte ASCII propre ?
            if (/^[\x20-\x7E]+$/.test(binary)) {
                return binary;
            }
    
            // fallback UTF-8
            return new TextDecoder().decode(
                Uint8Array.from(binary, c => c.charCodeAt(0))
            );
    
        } catch {
            return null;
        }
    }
     
    function processNode(node) {
        if (node.nodeType !== Node.TEXT_NODE) return;

        // ignore si déjà traité
        if (node.parentNode && node.parentNode.dataset.decoded) return;
        node.parentNode.dataset.decoded = "true";
     
        const text = node.nodeValue;
        const matches = [...text.matchAll(base64Regex)];
    
        if (matches.length === 0) return;
    
        const frag = document.createDocumentFragment();
    
        let lastIndex = 0;
    
        for (const m of matches) {
            const match = m[0];
            const index = m.index;
        
            // texte avant match
            frag.appendChild(
                document.createTextNode(text.slice(lastIndex, index))
            );
        
            // ✅ ICI
            if (/https?:\/\//.test(match)) {
                frag.appendChild(document.createTextNode(match));
                lastIndex = index + match.length;
                continue;
            }
        
            const decoded = decodeBase64(match);
    
            if (decoded) {
                const isURL = /^https?:\/\/\S+$/.test(decoded);
    
                if (isURL) {
                    const a = document.createElement("a");
                    a.href = decoded;
                    a.textContent = decoded;
                    a.target = "_blank";
                    a.style.color = "#4dabf7";
                    frag.appendChild(a);
                } else {
                    frag.appendChild(document.createTextNode(decoded));
                }
            } else {
                frag.appendChild(document.createTextNode(match));
            }
    
            lastIndex = index + match.length;
        }
    
        // reste du texte
        frag.appendChild(
            document.createTextNode(text.slice(lastIndex))
        );
    
        node.parentNode.replaceChild(frag, node);
    }
 
    function scan(root) {
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT
        );
    
        let node;
        const nodes = [];
    
        while (node = walker.nextNode()) {
            nodes.push(node);
        }
    
        nodes.forEach(processNode);
    }
 
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                scan(node);
            }
        }
    });
 
    observer.observe(document.body, { childList: true, subtree: true });
 
    scan(document.body);
})();
