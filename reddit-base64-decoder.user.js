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
            return new TextDecoder().decode(
                Uint8Array.from(atob(str), c => c.charCodeAt(0))
            );
        } catch {
            return null;
        }
    }
 
    function processNode(node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
    
        const text = node.nodeValue;
        const matches = text.match(base64Regex);
        if (!matches) return;
    
        let newNode = document.createDocumentFragment();
    
        let lastIndex = 0;
    
        for (const match of matches) {
            const index = text.indexOf(match, lastIndex);
            if (index === -1) continue;
    
            // texte avant
            newNode.appendChild(
                document.createTextNode(text.slice(lastIndex, index))
            );
    
            const decoded = decodeBase64(match);
    
            if (decoded) {
                const isURL = /^https?:\/\/[^\s]+$/.test(decoded);
    
                if (isURL) {
                    const a = document.createElement("a");
                    a.href = decoded;
                    a.textContent = decoded;
                    a.target = "_blank";
                    a.style.color = "#4dabf7";
                    newNode.appendChild(a);
                } else {
                    newNode.appendChild(document.createTextNode(decoded));
                }
            } else {
                newNode.appendChild(document.createTextNode(match));
            }
    
            lastIndex = index + match.length;
        }
    
        // reste du texte
        newNode.appendChild(
            document.createTextNode(text.slice(lastIndex))
        );
    
        node.parentNode.replaceChild(newNode, node);
    }
 
    function scan(element) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            processNode(node);
        }
    }
 
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                scan(node);
            });
        });
    });
 
    observer.observe(document.body, { childList: true, subtree: true });
 
    scan(document.body);
})();
