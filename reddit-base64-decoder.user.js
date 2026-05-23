// ==UserScript==
// @name         Reddit — Base64 Decoder & URL Linker
// @namespace    https://github.com/rpmn0ise/reddit-base64-decoder
// @version      2.0.0
// @description  Décode automatiquement les chaînes Base64 et rend les URLs cliquables dans les commentaires et posts Reddit
// @author       rpmn0ise
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://new.reddit.com/*
// @match        https://sh.reddit.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── Configuration ────────────────────────────────────────────────────────
  // Modifie ces valeurs selon tes préférences

  const CONFIG = {
    AUTO_EXPAND:     false,  // true = affiche le décodé directement sans cliquer
    MIN_LENGTH:      16,     // longueur minimale d'une chaîne pour tenter le décodage
    PRINTABLE_RATIO: 0.6,    // ratio min de caractères imprimables dans le résultat
    DEBOUNCE_MS:     500,    // délai avant rescan après mutation DOM (ms)
    SHOW_BADGE:      true,   // affiche un compteur flottant en bas à droite
  };

  // ─── État global ──────────────────────────────────────────────────────────

  let totalDetected = 0;
  let badgeEl = null;

  // ─── Styles ───────────────────────────────────────────────────────────────

  GM_addStyle(`
    /* ── Wrapper Base64 ── */
    .b64-wrapper {
      display: inline;
      position: relative;
    }

    /* ── Original grisé ── */
    .b64-original {
      opacity: 0.4;
      font-size: 0.8em;
      word-break: break-all;
      font-family: 'Courier New', monospace;
    }

    /* ── Label ⚙ b64 ── */
    .b64-label {
      font-size: 0.7em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #ff6314;
      margin: 0 4px;
      vertical-align: middle;
      user-select: none;
    }

    /* ── Boutons (toggle + copy) ── */
    .b64-btn {
      display: inline-block;
      font-size: 0.7em;
      font-weight: 600;
      cursor: pointer;
      background: none;
      border: 1px solid #ff6314;
      color: #ff6314;
      border-radius: 3px;
      padding: 1px 6px;
      margin-left: 3px;
      vertical-align: middle;
      user-select: none;
      transition: background 0.15s, color 0.15s;
      line-height: 1.6;
    }
    .b64-btn:hover {
      background: #ff6314;
      color: #fff;
    }
    .b64-btn.copied {
      background: #2ecc71;
      border-color: #2ecc71;
      color: #fff;
    }

    /* ── Contenu décodé court (inline) ── */
    .b64-decoded-inline {
      display: inline;
      background: rgba(255, 99, 20, 0.1);
      border: 1px solid rgba(255, 99, 20, 0.3);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'Courier New', monospace;
      font-size: 0.92em;
      color: #c44400;
      word-break: break-all;
    }

    /* ── Contenu décodé long (block) ── */
    .b64-decoded-block {
      display: block;
      margin: 6px 0 6px 4px;
      background: rgba(255, 99, 20, 0.06);
      border-left: 3px solid #ff6314;
      border-radius: 0 6px 6px 0;
      padding: 8px 12px;
      font-family: 'Courier New', monospace;
      font-size: 0.85em;
      color: #333;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: auto;
    }

    /* ── JSON pretty-printed ── */
    .b64-decoded-block.is-json {
      color: #1a6e3c;
      background: rgba(46, 204, 113, 0.06);
      border-left-color: #2ecc71;
    }
    .b64-decoded-inline.is-json {
      color: #1a6e3c;
      background: rgba(46, 204, 113, 0.1);
      border-color: rgba(46, 204, 113, 0.35);
    }

    /* ── Dark mode ── */
    @media (prefers-color-scheme: dark) {
      .b64-decoded-inline {
        background: rgba(255, 130, 60, 0.13);
        border-color: rgba(255, 130, 60, 0.35);
        color: #ff9f60;
      }
      .b64-decoded-block {
        background: rgba(255, 99, 20, 0.07);
        border-left-color: #ff7733;
        color: #ccc;
      }
      .b64-decoded-block.is-json {
        color: #5ddb8e;
        background: rgba(46, 204, 113, 0.07);
        border-left-color: #2ecc71;
      }
      .b64-decoded-inline.is-json {
        color: #5ddb8e;
        background: rgba(46, 204, 113, 0.1);
        border-color: rgba(46, 204, 113, 0.3);
      }
    }

    /* ── URLs linkées ── */
    .b64-url-link {
      color: #0079d3 !important;
      text-decoration: underline !important;
      word-break: break-all;
    }
    .b64-url-link:hover {
      color: #005fa3 !important;
    }
    @media (prefers-color-scheme: dark) {
      .b64-url-link       { color: #5ba4cf !important; }
      .b64-url-link:hover { color: #81bde3 !important; }
    }

    /* ── Badge compteur ── */
    #b64-badge {
      position: fixed;
      bottom: 14px;
      right: 14px;
      background: #ff6314;
      color: #fff;
      border-radius: 999px;
      padding: 4px 11px;
      font-size: 0.72em;
      font-weight: 700;
      z-index: 99999;
      opacity: 0.82;
      pointer-events: none;
      font-family: system-ui, sans-serif;
      letter-spacing: 0.03em;
      transition: opacity 0.2s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
    }
    #b64-badge[data-count="0"] {
      opacity: 0;
    }
  `);

  // ─── Regex ────────────────────────────────────────────────────────────────

  // Base64 standard : exclut les segments qui ressemblent à des chemins d'URL (précédés par /)
  const BASE64_RE = /(?<![A-Za-z0-9+/=\-_./])([A-Za-z0-9+/]{16,}={0,2})(?![A-Za-z0-9+/=\-_])/g;

  // Base64url (JWT, etc.) : utilise - et _ au lieu de + et /
  const BASE64URL_RE = /(?<![A-Za-z0-9\-_.])([A-Za-z0-9\-_]{16,})(?![A-Za-z0-9\-_.])/g;

  // URLs brutes non dans un attribut href/src
  const URL_RE = /(?<!['"=])(https?:\/\/[^\s<>"')\]]+)/g;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Normalise et décode une chaîne Base64 (standard ou base64url).
   * Retourne { decoded, isJson } ou null si invalide/illisible.
   */
  function tryDecode(str) {
    // Normaliser base64url → base64 standard
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

    let decoded;
    try {
      decoded = atob(padded);
    } catch {
      return null;
    }

    // Filtre longueur minimale
    if (decoded.length < 5) return null;

    // Filtre ratio de caractères imprimables
    let printable = 0;
    for (let i = 0; i < decoded.length; i++) {
      const c = decoded.charCodeAt(i);
      if ((c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13) printable++;
    }
    if (printable / decoded.length < CONFIG.PRINTABLE_RATIO) return null;

    // Filtre : doit contenir au moins un alphanumérique
    if (!/[a-zA-Z0-9]/.test(decoded)) return null;

    // Tenter le pretty-print JSON
    let isJson = false;
    let formatted = decoded;
    try {
      const parsed = JSON.parse(decoded);
      formatted = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch { /* pas du JSON, on garde decoded brut */ }

    return { decoded: formatted, isJson };
  }

  /**
   * Vérifie si le nœud est dans un élément à ignorer.
   */
  function shouldSkipNode(node) {
    let el = node.parentElement;
    while (el) {
      const tag = el.tagName && el.tagName.toLowerCase();
      if (
        tag === 'a' || tag === 'code' || tag === 'pre' ||
        tag === 'script' || tag === 'style' ||
        tag === 'textarea' || tag === 'input' ||
        el.classList.contains('b64-decoded-inline') ||
        el.classList.contains('b64-decoded-block') ||
        el.dataset.b64processed
      ) return true;
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Échappe le HTML pour injection sûre dans innerHTML.
   */
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Linkifie les URLs dans une chaîne HTML déjà échappée.
   */
  function linkifyHtml(html) {
    return html.replace(
      /https?:\/\/[^\s<>"')\]]+/g,
      url => `<a class="b64-url-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
  }

  // ─── Mise à jour du badge ─────────────────────────────────────────────────

  function updateBadge() {
    if (!CONFIG.SHOW_BADGE) return;
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.id = 'b64-badge';
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = `⚙ b64 : ${totalDetected}`;
    badgeEl.dataset.count = totalDetected;
  }

  // ─── Construction des éléments DOM ───────────────────────────────────────

  function buildBase64Element(raw, decoded, isJson) {
    const isLong = decoded.length > 80 || decoded.includes('\n');

    const wrapper = document.createElement('span');
    wrapper.className = 'b64-wrapper';
    wrapper.dataset.b64processed = '1';

    // Texte original grisé
    const originalEl = document.createElement('span');
    originalEl.className = 'b64-original';
    originalEl.textContent = raw;

    // Label
    const label = document.createElement('span');
    label.className = 'b64-label';
    label.textContent = isJson ? '⚙ b64/json' : '⚙ b64';

    // Bouton toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'b64-btn';
    toggleBtn.textContent = CONFIG.AUTO_EXPAND ? 'Masquer' : 'Afficher';
    toggleBtn.title = 'Afficher / masquer le contenu décodé';

    // Bouton copier
    const copyBtn = document.createElement('button');
    copyBtn.className = 'b64-btn';
    copyBtn.textContent = '⎘';
    copyBtn.title = 'Copier le contenu décodé';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(decoded).then(() => {
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '⎘';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });

    // Contenu décodé
    const decodedEl = document.createElement(isLong ? 'div' : 'span');
    decodedEl.className = isLong ? 'b64-decoded-block' : 'b64-decoded-inline';
    if (isJson) decodedEl.classList.add('is-json');
    decodedEl.style.display = CONFIG.AUTO_EXPAND ? (isLong ? 'block' : 'inline') : 'none';

    // Injecter le HTML avec URLs linkifiées
    decodedEl.innerHTML = linkifyHtml(escapeHtml(decoded));

    // Toggle
    let visible = CONFIG.AUTO_EXPAND;
    toggleBtn.addEventListener('click', () => {
      visible = !visible;
      decodedEl.style.display = visible ? (isLong ? 'block' : 'inline') : 'none';
      toggleBtn.textContent = visible ? 'Masquer' : 'Afficher';
    });

    wrapper.appendChild(originalEl);
    wrapper.appendChild(label);
    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(copyBtn);
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

  // ─── Traitement d'un nœud texte ───────────────────────────────────────────

  function processTextNode(textNode) {
    if (shouldSkipNode(textNode)) return;

    const text = textNode.nodeValue;
    if (!text || text.trim().length < CONFIG.MIN_LENGTH) return;

    const replacements = [];

    // ── 1. Base64 standard
    BASE64_RE.lastIndex = 0;
    let m;
    while ((m = BASE64_RE.exec(text)) !== null) {
      const raw = m[1];
      const result = tryDecode(raw);
      if (result) {
        replacements.push({
          start: m.index, end: m.index + raw.length,
          type: 'b64', raw, ...result
        });
      }
    }

    // ── 2. Base64url (JWT style : trois segments séparés par des points)
    //    On cible le pattern complet header.payload.signature
    const jwtRe = /([A-Za-z0-9\-_]{10,})\.([A-Za-z0-9\-_]{10,})\.([A-Za-z0-9\-_]{10,})/g;
    jwtRe.lastIndex = 0;
    while ((m = jwtRe.exec(text)) !== null) {
      const fullMatch = m[0];
      const start = m.index;
      const end = start + fullMatch.length;
      const alreadyCovered = replacements.some(r => start < r.end && end > r.start);
      if (!alreadyCovered) {
        // Décoder le payload (deuxième segment)
        const result = tryDecode(m[2]);
        if (result) {
          replacements.push({
            start, end,
            type: 'b64',
            raw: fullMatch,
            decoded: `[JWT] Payload:\n${result.decoded}`,
            isJson: result.isJson,
          });
        }
      }
    }

    // ── 3. URLs brutes
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      const url = m[1];
      const start = m.index;
      const end = start + url.length;
      const overlaps = replacements.some(r => start < r.end && end > r.start);
      if (!overlaps) {
        replacements.push({ start, end, type: 'url', raw: url });
      }
    }

    if (replacements.length === 0) return;

    replacements.sort((a, b) => a.start - b.start);

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const rep of replacements) {
      if (rep.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, rep.start)));
      }
      if (rep.type === 'b64') {
        fragment.appendChild(buildBase64Element(rep.raw, rep.decoded, rep.isJson));
        totalDetected++;
      } else if (rep.type === 'url') {
        fragment.appendChild(buildUrlElement(rep.raw));
      }
      cursor = rep.end;
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
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

    // Traitement direct au fil du walk (pas de tableau intermédiaire)
    // Note : processTextNode remplace le nœud, mais le walker a déjà avancé
    let node;
    const batch = [];
    while ((node = walker.nextNode())) batch.push(node);
    batch.forEach(processTextNode);
  }

  // ─── Sélecteurs Reddit ────────────────────────────────────────────────────

  const CONTENT_SELECTORS = [
    // New Reddit / Shreddit — attributs data-* stables
    '[data-testid="comment"]',
    '[data-testid="post-container"]',
    '[data-adclicklocation="title"]',
    // Web components Shreddit
    'shreddit-comment',
    'shreddit-post',
    // Fallback class Reddit
    '.Comment',
    '.Post',
    // Old Reddit
    '.usertext-body',
    '.entry .md',
    '.expando .md',
    '.comment .md',
  ].join(', ');

  function processAll() {
    const prevCount = totalDetected;
    const elements = document.querySelectorAll(CONTENT_SELECTORS);

    if (elements.length === 0) {
      walkAndProcess(document.body);
    } else {
      elements.forEach(el => {
        // Rescan si le contenu a changé (on reset le flag)
        const currentHash = el.innerText ? el.innerText.length : 0;
        if (el.dataset.b64scanned === String(currentHash)) return;
        el.dataset.b64scanned = String(currentHash);
        walkAndProcess(el);
      });
    }

    if (totalDetected !== prevCount) updateBadge();
  }

  // ─── MutationObserver ─────────────────────────────────────────────────────

  let debounceTimer = null;

  const observer = new MutationObserver(mutations => {
    let hasNewElement = false;
    outer: for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          hasNewElement = true;
          break outer;
        }
      }
    }
    if (!hasNewElement) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processAll, { timeout: 1000 });
      } else {
        processAll();
      }
    }, CONFIG.DEBOUNCE_MS);
  });

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    processAll();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 800);
  }

})();
