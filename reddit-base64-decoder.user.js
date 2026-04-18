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
    const base64Regex = /\b[A-Za-z0-9+/]{20,}={0,2}\b/g;
 
    function decodeBase64(str) {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch {
            return null;
        }
    }
 
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            const matches = node.nodeValue.match(base64Regex);
            if (!matches) return;
 
            let parent = node.parentNode;
            let text = node.nodeValue;
 
            matches.forEach(match => {
                const decoded = decodeBase64(match);
                if (!decoded || decoded.length < 5) return;
 
                // Vérifie si c'est une URL
                let isURL = /^https?:\/\/[^\s]+$/.test(decoded);
 
                let replacement;
 
                if (isURL) {
                    // crée un lien cliquable
                    const a = document.createElement("a");
                    a.href = decoded;
                    a.textContent = decoded;
                    a.target = "_blank";
                    a.style.color = "#4dabf7"; // optionnel
                    replacement = a;
                } else {
                    // sinon texte simple
                    replacement = document.createTextNode(decoded);
                }
 
                // remplace dans le texte
                const parts = text.split(match);
                const frag = document.createDocumentFragment();
 
                parts.forEach((part, index) => {
                    frag.appendChild(document.createTextNode(part));
                    if (index < parts.length - 1) {
                        frag.appendChild(replacement.cloneNode(true));
                    }
                });
 
                parent.replaceChild(frag, node);
            });
        }
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
