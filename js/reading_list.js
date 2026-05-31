// Reading List panel: renders saved articles into the Reading List window,
// updates the dock badge, supports open + remove actions.

import userData from './userData.js';
import globalState from './globalState.js';

export function initReadingList() {
  const itemsEl = document.getElementById('readingListItems');
  const emptyEl = document.getElementById('readingListEmpty');
  const statsEl = document.getElementById('readingListStats');
  const badgeEl = document.getElementById('readingListBadge');

  if (!itemsEl) return;

  function render() {
    const items = userData.allSavedWithMeta();
    const readCount = userData.allRead().size;

    // Stats line
    if (statsEl) {
      const savedN = items.length;
      statsEl.innerHTML = `
        <span class="rl-stat"><strong>${savedN}</strong> saved</span>
        <span class="rl-stat-sep">·</span>
        <span class="rl-stat"><strong>${readCount}</strong> read</span>
      `;
    }

    // Dock badge
    if (badgeEl) {
      if (items.length > 0) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.textContent = items.length > 99 ? '99+' : String(items.length);
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Items vs empty state
    if (items.length === 0) {
      itemsEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Sort by name for stability
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    itemsEl.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'rl-item';
      const isRead = userData.isRead(item.id);
      const color = item.topCategory ? colorForCategory(item.topCategory) : '#8c1515';
      row.innerHTML = `
        <span class="rl-tag" style="background:${color}"></span>
        <div class="rl-text">
          <div class="rl-name">${escapeHtml(item.name || item.id)}${isRead ? ' <span class="rl-read-pill">read</span>' : ''}</div>
          ${item.topCategory ? `<div class="rl-cat">${escapeHtml(item.topCategory)}</div>` : ''}
        </div>
        <div class="rl-actions">
          <button class="rl-btn rl-open" title="Open">Open</button>
          <button class="rl-btn rl-remove" title="Remove from list">✕</button>
        </div>
      `;
      row.querySelector('.rl-open').addEventListener('click', () => {
        globalState.update({
          type: 'single',
          category: null,
          subcategory: null,
          node: {
            id: item.id,
            name: item.name,
            broaderCategory: item.topCategory || null,
            category: item.topCategory || null,
            articleUrl: item.url || null
          }
        });
      });
      row.querySelector('.rl-remove').addEventListener('click', () => {
        userData.unsaveItem(item.id);
      });
      itemsEl.appendChild(row);
    });
  }

  // Re-render on every change.
  userData.subscribe(render);
}

// Same color set the rest of the app uses for top categories.
function colorForCategory(name) {
  const map = {
    'History of Philosophy': '#db4848',
    'Moral Philosophy':      '#E69300',
    'Metaphysics':           '#65C977',
    'Philosophy of Knowledge': '#B874D9',
    'Logic':                 '#5CAFFD'
  };
  return map[name] || '#8c1515';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
