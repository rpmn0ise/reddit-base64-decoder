// ==UserScript==
// @name         Reddit — Base64 Decoder & URL Linker
// @namespace    https://github.com/userscripts/reddit-base64
// @version      1.3.0
// @description  Décode automatiquement les chaînes Base64 et rend les URLs cliquables dans les commentaires et posts Reddit
// @author       UserScript
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://sh.reddit.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Styles ───────────────────────────────────────────────────────────────

  GM_addStyle(`
    .b64-wrapper {
      display: inline-block;
      position: relative;
      cursor: pointer;
      border-bottom: 2px dashed #ff6314;
      color: inherit;
    }

    .b64-wrapper:hover .b64-tooltip {
      display: block;
    }

    .b64-decoded-inline {
      display: inline;
      background: rgba(255, 99, 20, 0.12);
      border: 1px solid rgba(255, 99, 20, 0.35);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'Courier New', monospace;
      font-size: 0.92em;
      color: #d45500;
      cursor: default;
      word-break: break-all;
    }

    .b64-decoded-block {
      display: block;
      margin: 6px 0;
      background: rgba(255, 99, 20, 0.07);
      border-left: 3px solid #ff6314;
      border-radius: 0 6px 6px 0;
      padding: 8px 12px;
      font-family: 'Courier New', monospace;
      font-size: 0.88em;
      color: #333;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      .b64-decoded-inline {
        background: rgba(255, 130, 60, 0.15);
        border-color: rgba(255, 130, 60, 0.4);
        color: #ff9f60;
      }
      .b64-decoded-block {
        background: rgba(255, 99, 20, 0.08);
        border-left-color: #ff7733;
        color: #ddd;
      }
    }

    .b64-label {
      font-size: 0.72em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #ff6314;
      margin-right: 6px;
      vertical-align: middle;
      user-select: none;
    }

    .b64-toggle-btn {
      display: inline-block;
      font-size: 0.7em;
      font-weight: 600;
      cursor: pointer;
      background: none;
      border: 1px solid #ff6314;
      color: #ff6314;
      border-radius: 3px;
      padding: 1px 5px;
      margin-left: 5px;
      vertical-align: middle;
      user-select: none;
      transition: background 0.15s, color 0.15s;
    }
    .b64-toggle-btn:hover {
      background: #ff6314;
      color: #fff;
    }

    .b64-url-link {
      color: #0079d3 !important;
      text-decoration: underline !important;
      word-break: break-all;
    }
    .b64-url-link:hover {
      color: #0060a8 !important;
    }

    @media (prefers-color-scheme: dark) {
      .b64-url-link {
        color: #5ba4cf !important;
      }
      .b64-url-link:hover {
        color: #81bde3 !important;
      }
    }
  `);

  // ─── Regex ────────────────────────────────────────────────────────────────

  // Base64 : min 16 chars, multiple of 4 (avec padding optionnel)
  const BASE64_RE = /(?<![A-Za-z0-9+/=])([A-Za-z0-9+/]{16,}={0,2})(?![A-Za-z0-9+/=])/g;

  // URLs brutes (pas déjà dans un <a>)
  const URL_RE = /(?<!['"=])(https?:\/\/[^\s<>"')\]]+)/g;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Tente de décoder une chaîne Base64.
   * Retourne null si ce n'est pas du Base64 valide ou si le résultat n'est pas lisible.
   */
  function tryDecodeBase64(str) {
    // Doit être multiple de 4 (avec padding)
    const padded = str.padEnd(Math.ceil(str.length / 4) * 4, '=');
    try {
      const decoded = atob(padded);
      // Filtre : au moins 60% de caractères imprimables ASCII
      let printable = 0;
      for (let i = 0; i < decoded.length; i++) {
        const c = decoded.charCodeAt(i);
        if ((c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13) printable++;
      }
      if (printable / decoded.length < 0.6) return null;
      // Filtre : doit contenir au moins un espace, lettre ou chiffre
      if (!/[a-zA-Z0-9 ]/.test(decoded)) return null;
      // Filtre : évite les faux positifs comme les IDs courts purement alphanumériques sans sens
      if (decoded.length < 5) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Vérifie que le nœud texte n'est pas déjà à l'intérieur d'un élément
   * qu'on a déjà traité ou d'un <a>, <code>, <pre>, <script>, <style>.
   */
  function shouldSkipNode(node) {
    let el = node.parentElement;
    while (el) {
      const tag = el.tagName && el.tagName.toLowerCase();
      if (
        tag === 'a' ||
        tag === 'code' ||
        tag === 'pre' ||
        tag === 'script' ||
        tag === 'style' ||
        tag === 'textarea' ||
        tag === 'input' ||
        el.classList.contains('b64-decoded-inline') ||
        el.classList.contains('b64-decoded-block') ||
        el.dataset.b64processed
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  // ─── Traitement d'un nœud texte ───────────────────────────────────────────

  function processTextNode(textNode) {
    if (shouldSkipNode(textNode)) return;

    const text = textNode.nodeValue;
    if (!text || text.trim().length < 4) return;

    // On collecte tous les remplacements à faire (base64 + urls)
    const replacements = [];

    // ── 1. Base64
    let m;
    BASE64_RE.lastIndex = 0;
    while ((m = BASE64_RE.exec(text)) !== null) {
      const raw = m[1];
      const decoded = tryDecodeBase64(raw);
      if (decoded) {
        replacements.push({ start: m.index, end: m.index + raw.length, type: 'b64', raw, decoded });
      }
    }

    // ── 2. URLs (seulement dans les segments qui ne sont pas déjà Base64)
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      const url = m[1];
      const start = m.index;
      const end = start + url.length;
      // Ne pas chevaucher avec un match base64
      const overlaps = replacements.some(r => start < r.end && end > r.start);
      if (!overlaps) {
        replacements.push({ start, end, type: 'url', raw: url });
      }
    }

    if (replacements.length === 0) return;

    // Trier par position
    replacements.sort((a, b) => a.start - b.start);

    // Construire un fragment DOM
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const rep of replacements) {
      // Texte avant
      if (rep.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, rep.start)));
      }

      if (rep.type === 'b64') {
        fragment.appendChild(buildBase64Element(rep.raw, rep.decoded));
      } else if (rep.type === 'url') {
        fragment.appendChild(buildUrlElement(rep.raw));
      }

      cursor = rep.end;
    }

    // Texte restant
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  // ─── Constructeurs d'éléments ─────────────────────────────────────────────

  function buildBase64Element(raw, decoded) {
    const isLong = decoded.length > 60;

    const wrapper = document.createElement('span');
    wrapper.dataset.b64processed = '1';

    const label = document.createElement('span');
    label.className = 'b64-label';
    label.textContent = '⚙ b64';

    const btn = document.createElement('button');
    btn.className = 'b64-toggle-btn';
    btn.textContent = 'Afficher';
    btn.title = 'Afficher le contenu décodé';

    const decodedEl = document.createElement(isLong ? 'div' : 'span');
    decodedEl.className = isLong ? 'b64-decoded-block' : 'b64-decoded-inline';
    decodedEl.style.display = 'none';

    // Si le décodé contient lui-même des URLs, les rendre cliquables
    decodedEl.innerHTML = escapeHtml(decoded).replace(
      /https?:\/\/[^\s<>"')\]]+/g,
      url => `<a class="b64-url-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );

    let visible = false;
    btn.addEventListener('click', () => {
      visible = !visible;
      decodedEl.style.display = visible ? (isLong ? 'block' : 'inline') : 'none';
      btn.textContent = visible ? 'Masquer' : 'Afficher';
    });

    // Texte original (grisé, petit)
    const originalEl = document.createElement('span');
    originalEl.style.cssText = 'opacity:0.45; font-size:0.8em; word-break:break-all;';
    originalEl.textContent = raw;

    wrapper.appendChild(label);
    wrapper.appendChild(originalEl);
    wrapper.appendChild(btn);
    wrapper.appendChild(decodedEl);

    return wrapper;
  }

  function buildUrlElement(url) {
    const a = document.createElement('a');
    a.href = url;
    a.textContent = url;
    a.className = 'b64-url-link';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Parcours du DOM ──────────────────────────────────────────────────────

  function walkAndProcess(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'code', 'pre', 'textarea', 'input'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(processTextNode);
  }

  // ─── Sélecteurs Reddit (old + new) ───────────────────────────────────────

  const CONTENT_SELECTORS = [
    // New Reddit
    '[data-testid="comment"]',
    '[data-testid="post-container"]',
    '.Post',
    '.Comment',
    'shreddit-comment',
    'shreddit-post',
    // Old Reddit
    '.usertext-body',
    '.entry .md',
    '.expando .md',
    '.comment .md',
  ].join(', ');

  function processAll() {
    const elements = document.querySelectorAll(CONTENT_SELECTORS);
    if (elements.length === 0) {
      // Fallback : tout le body
      walkAndProcess(document.body);
    } else {
      elements.forEach(el => {
        if (!el.dataset.b64scanned) {
          el.dataset.b64scanned = '1';
          walkAndProcess(el);
        }
      });
    }
  }

  // ─── MutationObserver pour le contenu chargé dynamiquement ───────────────

  let debounceTimer = null;

  const observer = new MutationObserver(mutations => {
    let hasNew = false;
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) break;
    }
    if (!hasNew) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAll, 400);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    processAll();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Petit délai pour laisser Reddit hydrater le DOM
    setTimeout(init, 800);
  }

})();
