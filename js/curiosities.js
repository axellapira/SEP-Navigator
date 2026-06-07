// Curiosities — graph trivia / fun facts about the SEP citation graph.
// Cards: furthest pair(s), most central, lonely, bridges.
// A top filter strip restricts all cards to the selected categories.

import { buildGraph } from './article_graph.js';
import globalState from './globalState.js';

let graph = null;
let allowedCats = new Set();      // empty = all
let lastBody = null;

export function initCuriosities(data) {
  graph = buildGraph(data);
  const body = document.getElementById('curiositiesBody');
  if (!body) return;
  lastBody = body;
  const opener = document.getElementById('dockCuriosities');
  if (opener) {
    opener.addEventListener('click', () => {
      const win = document.getElementById('curiositiesWindow');
      if (!win) return;
      win.classList.remove('is-closed', 'is-minimized');
      win.dataset.state = 'normal';
      win.style.display = '';
      const allZ = Array.from(document.querySelectorAll('.window'))
        .map(w => parseInt(w.style.zIndex) || 10);
      win.style.zIndex = Math.max(...allZ) + 1;
      if (!win.dataset.rendered) {
        render(body);
        win.dataset.rendered = '1';
      }
    });
  }
  document.getElementById('curiositiesRefresh')?.addEventListener('click', () => {
    graph.clearDiameterCache();
    render(body);
  });
}

function allowedSet() {
  if (allowedCats.size === 0) return null;
  const ids = new Set();
  graph.articles.forEach(a => {
    const c = (a.broaderCategory || a.category || '').trim();
    if (allowedCats.has(c)) ids.add(a.id);
  });
  return ids.size === graph.articles.length ? null : ids;
}

function render(body) {
  body.innerHTML = '';
  body.appendChild(renderFilterStrip());
  const facts = document.createElement('div');
  facts.id = 'curiositiesFacts';
  body.appendChild(facts);
  computeAndRender(facts);
}

function recompute() {
  if (!lastBody) return;
  const facts = document.getElementById('curiositiesFacts');
  if (facts) computeAndRender(facts);
}

function computeAndRender(facts) {
  facts.innerHTML = '<div class="cur-loading">Computing…</div>';
  requestAnimationFrame(() => setTimeout(() => {
    facts.innerHTML = '';
    facts.appendChild(furthestPairCard());
    facts.appendChild(mostCentralCard());
    facts.appendChild(lonelyCard());
    facts.appendChild(bridgesCard());
  }, 20));
}

function renderFilterStrip() {
  const wrap = document.createElement('div');
  wrap.className = 'cur-filter-strip';
  const cats = graph.allTopCategories();
  if (allowedCats.size === 0) cats.forEach(c => allowedCats.add(c));
  const label = document.createElement('div');
  label.className = 'cur-filter-label';
  label.textContent = 'Limit to';
  wrap.appendChild(label);
  cats.forEach(c => {
    const chip = document.createElement('label');
    chip.className = 'sr-cat-chip';
    chip.innerHTML = `
      <input type="checkbox" ${allowedCats.has(c) ? 'checked' : ''}/>
      <span class="sr-cat-swatch" style="background:${colorForCategory(c)}"></span>
      <span>${escapeHtml(c)}</span>`;
    chip.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) allowedCats.add(c);
      else allowedCats.delete(c);
      if (allowedCats.size === 0) { e.target.checked = true; allowedCats.add(c); return; }
      recompute();
    });
    wrap.appendChild(chip);
  });
  return wrap;
}

function card(title, subtitle, contentEl) {
  const wrap = document.createElement('div');
  wrap.className = 'cur-card';
  wrap.innerHTML = `
    <div class="cur-card-head">
      <div class="cur-card-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="cur-card-sub">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  `;
  wrap.appendChild(contentEl);
  return wrap;
}

function articleRow(a, extra) {
  const row = document.createElement('button');
  row.className = 'cur-article-row';
  const color = colorForCategory(a.broaderCategory || a.category);
  row.innerHTML = `
    <span class="cur-row-swatch" style="background:${color}"></span>
    <span class="cur-row-name">${escapeHtml(a.name)}</span>
    ${extra ? `<span class="cur-row-extra">${escapeHtml(extra)}</span>` : ''}
  `;
  row.addEventListener('click', () => {
    globalState.update({
      type: 'single', category: null, subcategory: null,
      node: {
        id: a.id, name: a.name,
        broaderCategory: a.broaderCategory || a.category,
        category: a.category,
        articleUrl: a.articleUrl
      }
    });
  });
  return row;
}

// ----- Cards -----

function furthestPairCard() {
  const aset = allowedSet();
  const result = graph.diameter(aset);
  const content = document.createElement('div');
  if (!result || !result.pairs.length) {
    content.innerHTML = '<div class="cur-empty">No paths found in this subgraph.</div>';
  } else {
    const PREVIEW = 2;
    const total = result.pairs.length;
    content.innerHTML = `
      <p class="cur-fact"><strong>${result.len}</strong> click${result.len === 1 ? '' : 's'} separate the furthest pairs.
      ${total > 1 ? `<span class="cur-fact-note">${total} pair${total === 1 ? '' : 's'} share this distance.</span>` : ''}
      </p>
    `;
    const initial = result.pairs.slice(0, PREVIEW);
    initial.forEach(p => content.appendChild(renderPairBlock(p)));
    if (total > PREVIEW) {
      const hidden = document.createElement('div');
      hidden.className = 'cur-hidden-pairs';
      hidden.style.display = 'none';
      result.pairs.slice(PREVIEW).forEach(p => hidden.appendChild(renderPairBlock(p)));
      content.appendChild(hidden);
      const toggle = document.createElement('button');
      toggle.className = 'cur-expand-toggle';
      toggle.textContent = `Show ${total - PREVIEW} more`;
      toggle.addEventListener('click', () => {
        const open = hidden.style.display === 'block';
        hidden.style.display = open ? 'none' : 'block';
        toggle.textContent = open
          ? `Show ${total - PREVIEW} more`
          : `Hide ${total - PREVIEW}`;
      });
      content.appendChild(toggle);
    }
  }
  return card('Furthest pairs', 'The longest shortest-paths in the (sub)graph', content);
}

function renderPairBlock(pair) {
  const block = document.createElement('div');
  block.className = 'cur-pair-block';
  pair.path.forEach(id => {
    const a = graph.getArticle(id);
    if (a) block.appendChild(articleRow(a));
  });
  return block;
}

function mostCentralCard() {
  const aset = allowedSet();
  const items = graph.mostCentralArticles(6, aset);
  const content = document.createElement('div');
  content.className = 'cur-list';
  items.forEach(a => content.appendChild(articleRow(a, `${a.degree} connections`)));
  return card('Most central', 'Articles with the most connections in this (sub)graph', content);
}

function lonelyCard() {
  const aset = allowedSet();
  const items = graph.lonelyArticles(8, 1, aset);
  const content = document.createElement('div');
  content.className = 'cur-list';
  if (!items.length) {
    content.innerHTML = '<div class="cur-empty">Nothing lonely in this subgraph.</div>';
  } else {
    items.forEach(a => content.appendChild(articleRow(a, a.degree === 0 ? 'orphan' : `${a.degree} link`)));
  }
  return card('Lonely articles', 'Articles barely connected to anything else', content);
}

function bridgesCard() {
  const aset = allowedSet();
  const bridges = graph.bridgeArticles(aset);
  bridges.sort((a, b) => graph.degreeIn(b.id, aset) - graph.degreeIn(a.id, aset));
  const top = bridges.slice(0, 8);
  const content = document.createElement('div');
  content.className = 'cur-list';
  if (!top.length) {
    content.innerHTML = '<div class="cur-empty">No critical bridges in this subgraph.</div>';
  } else {
    top.forEach(a => content.appendChild(articleRow(a, `${graph.degreeIn(a.id, aset)} connections`)));
  }
  return card(
    'Bridge articles',
    'Removing one of these would split the (sub)graph apart',
    content
  );
}

function colorForCategory(name) {
  const key = (name || '').trim();
  const map = {
    'History of Philosophy':   '#c0392b',
    'Moral Philosophy':        '#e6a23c',
    'Metaphysics':             '#3e8e5a',
    'Philosophy of Knowledge': '#6a3d8a',
    'Philosophy of Logic':     '#2e7eb6',
    'Logic':                   '#2e7eb6'
  };
  return map[key] || '#8c1515';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
