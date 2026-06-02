// Curiosities — graph trivia / fun facts about the SEP citation graph.
// Renders cards into #curiositiesBody. Items are clickable, route through globalState.

import { buildGraph } from './article_graph.js';
import globalState from './globalState.js';
import userData from './userData.js';

let graph = null;

export function initCuriosities(data) {
  graph = buildGraph(data);
  const body = document.getElementById('curiositiesBody');
  if (!body) return;
  // Compute on first open (lazy) so initial load isn't blocked.
  const opener = document.getElementById('dockCuriosities');
  if (opener) {
    opener.addEventListener('click', () => {
      // Open the window via the window manager pattern (set data-state, show)
      const win = document.getElementById('curiositiesWindow');
      if (!win) return;
      win.classList.remove('is-closed', 'is-minimized');
      win.dataset.state = 'normal';
      win.style.display = '';
      // Bring to front
      const allZ = Array.from(document.querySelectorAll('.window'))
        .map(w => parseInt(w.style.zIndex) || 10);
      win.style.zIndex = Math.max(...allZ) + 1;
      // Lazy render once.
      if (!win.dataset.rendered) {
        render(body);
        win.dataset.rendered = '1';
      }
    });
  }
  // Refresh button on the card header
  document.getElementById('curiositiesRefresh')?.addEventListener('click', () => {
    render(body);
  });
}

function render(body) {
  body.innerHTML = '<div class="cur-loading">Computing the curious corners of SEP…</div>';
  // Defer heavy work to next frame so the loader paints.
  requestAnimationFrame(() => setTimeout(() => {
    body.innerHTML = '';
    body.appendChild(furthestPairCard());
    body.appendChild(mostCentralCard());
    body.appendChild(lonelyCard());
    body.appendChild(bridgesCard());
  }, 20));
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
  const d = graph.diameter();
  const content = document.createElement('div');
  if (!d || !d.path) {
    content.innerHTML = '<div class="cur-empty">No path data.</div>';
  } else {
    const a = graph.getArticle(d.a);
    const b = graph.getArticle(d.b);
    content.innerHTML = `
      <p class="cur-fact"><strong>${d.len}</strong> clicks separate ${escapeHtml(a?.name || d.a)} from ${escapeHtml(b?.name || d.b)}.</p>
    `;
    const pathWrap = document.createElement('div');
    pathWrap.className = 'cur-pathlist';
    d.path.forEach(id => {
      const x = graph.getArticle(id);
      if (x) pathWrap.appendChild(articleRow(x));
    });
    content.appendChild(pathWrap);
  }
  return card('Furthest pair', 'The longest shortest-path in the SEP citation graph', content);
}

function mostCentralCard() {
  const items = graph.mostCentralArticles(6);
  const content = document.createElement('div');
  content.className = 'cur-list';
  items.forEach(a => content.appendChild(articleRow(a, `${a.degree} connections`)));
  return card('Most central', 'Articles with the most connections (in + out)', content);
}

function lonelyCard() {
  const items = graph.lonelyArticles(8, 1);
  const content = document.createElement('div');
  content.className = 'cur-list';
  if (!items.length) {
    content.innerHTML = '<div class="cur-empty">Nothing lonely — every article is well-connected.</div>';
  } else {
    items.forEach(a => content.appendChild(articleRow(a, a.degree === 0 ? 'orphan' : `${a.degree} link`)));
  }
  return card('Lonely articles', 'Articles barely connected to anything else', content);
}

function isolatedClustersCard() {
  const comps = graph.connectedComponents();
  // The first component is the main graph; everything after is "isolated".
  const isolated = comps.slice(1).filter(c => c.length >= 2).slice(0, 6);
  const content = document.createElement('div');
  content.className = 'cur-clusters';
  if (!isolated.length) {
    content.innerHTML = '<div class="cur-empty">The graph is fully connected — no isolated clusters.</div>';
  } else {
    isolated.forEach(comp => {
      const block = document.createElement('div');
      block.className = 'cur-cluster';
      const head = document.createElement('div');
      head.className = 'cur-cluster-head';
      head.textContent = `Cluster of ${comp.length}`;
      block.appendChild(head);
      comp.slice(0, 5).forEach(id => {
        const a = graph.getArticle(id);
        if (a) block.appendChild(articleRow(a));
      });
      if (comp.length > 5) {
        const more = document.createElement('div');
        more.className = 'cur-cluster-more';
        more.textContent = `+ ${comp.length - 5} more`;
        block.appendChild(more);
      }
      content.appendChild(block);
    });
  }
  return card('Isolated pockets', 'Mini-graphs disconnected from the main SEP', content);
}

function bridgesCard() {
  const bridges = graph.bridgeArticles();
  // Sort by degree desc; pick the top 8.
  bridges.sort((a, b) => graph.degree(b.id) - graph.degree(a.id));
  const top = bridges.slice(0, 8);
  const content = document.createElement('div');
  content.className = 'cur-list';
  if (!top.length) {
    content.innerHTML = '<div class="cur-empty">No critical bridges found.</div>';
  } else {
    top.forEach(a => content.appendChild(articleRow(a, `${graph.degree(a.id)} connections`)));
  }
  return card(
    'Bridge articles',
    'Removing one of these would split the graph apart',
    content
  );
}

function colorForCategory(name) {
  const key = (name || '').trim();
  const map = {
    'History of Philosophy':   '#db4848',
    'Moral Philosophy':        '#E69300',
    'Metaphysics':             '#65C977',
    'Philosophy of Knowledge': '#B874D9',
    'Philosophy of Logic':     '#5CAFFD',
    'Logic':                   '#5CAFFD'
  };
  return map[key] || '#8c1515';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
