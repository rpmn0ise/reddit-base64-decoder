const base64Regex = /\b[A-Za-z0-9+/]{20,}={0,2}\b/g;

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

    const matches = node.nodeValue.match(base64Regex);
    if (!matches) return;

    let parent = node.parentNode;
    let text = node.nodeValue;

    matches.forEach(match => {
        const decoded = decodeBase64(match);
        if (!decoded || decoded.length < 5) return;

        let isURL = /^https?:\/\/[^\s]+$/.test(decoded);

        let replacement;

        if (isURL) {
            const a = document.createElement("a");
            a.href = decoded;
            a.textContent = decoded;
            a.target = "_blank";
            a.style.color = "#4dabf7";
            replacement = a;
        } else {
            replacement = document.createTextNode(decoded);
        }

        const parts = text.split(match);
        const frag = document.createDocumentFragment();

        parts.forEach((part, i) => {
            frag.appendChild(document.createTextNode(part));
            if (i < parts.length - 1) {
                frag.appendChild(replacement.cloneNode(true));
            }
        });

        parent.replaceChild(frag, node);
    });
}

function scan(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
        processNode(node);
    }
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
