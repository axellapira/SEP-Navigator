// Random article ("I'm feeling lucky"): picks a random SEP article leaf
// and drives the existing globalState single-view, which surfaces it
// everywhere (network filter + treemap drill + inline preview).

import globalState from './globalState.js';

export function initRandomArticle(data) {
  // Flatten the hierarchy and keep only leaves with an article_url.
  const leaves = [];
  function walk(node, parentCat, broaderCat) {
    if (node.article_url) {
      leaves.push({
        id: node.id || node.name,
        name: node.name,
        category: parentCat,
        broaderCategory: broaderCat,
        articleUrl: node.article_url
      });
    }
    if (node.children) {
      node.children.forEach(child => walk(child, node.name, parentCat));
    }
  }
  walk(data.hierarchy, 'Root', null);

  function pickRandom() {
    if (!leaves.length) return;
    const choice = leaves[Math.floor(Math.random() * leaves.length)];
    globalState.update({
      type: 'single',
      category: null,
      subcategory: null,
      node: choice
    });
  }

  const btn = document.getElementById('dockRandom');
  if (!btn) return;
  btn.addEventListener('click', () => {
    pickRandom();
    btn.classList.remove('rolling');
    void btn.offsetWidth;
    btn.classList.add('rolling');
  });
}
