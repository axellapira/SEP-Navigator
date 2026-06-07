// Reading List window: shows Saved and Visited articles via two tabs.
// Updates the dock badge (count of saved). Open + remove actions.

import userData from './userData.js';
import globalState from './globalState.js';

export function initReadingList() {
  const itemsEl = document.getElementById('readingListItems');
  const emptyEl = document.getElementById('readingListEmpty');
  const statsEl = document.getElementById('readingListStats');
  const badgeEl = document.getElementById('readingListBadge');
  const tabsEl  = document.querySelectorAll('.rl-tab');
  const clearAllBtn = document.getElementById('rlClearAll');

  if (!itemsEl) return;

  let activeTab = 'saved';

  tabsEl.forEach(t => {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      tabsEl.forEach(x => x.classList.toggle('is-active', x === t));
      render();
    });
  });

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (activeTab === 'visited') {
        const n = userData.allVisited().size;
        if (n === 0) return;
        if (confirm(`Clear all ${n} visited articles? This can't be undone.`)) {
          userData.clearAllVisited();
        }
      }
    });
  }

  function render() {
    const savedItems = userData.allSavedWithMeta();
    const visitedItems = userData.allVisitedWithMeta();
    const items = activeTab === 'visited' ? visitedItems : savedItems;

    // Dock badge: always saved count.
    if (badgeEl) {
      if (savedItems.length > 0) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.textContent = savedItems.length > 99 ? '99+' : String(savedItems.length);
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Stats line
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="rl-stat"><strong>${savedItems.length}</strong> saved</span>
        <span class="rl-stat-sep">·</span>
        <span class="rl-stat"><strong>${visitedItems.length}</strong> visited</span>
      `;
    }

    // Show Clear all only on the Visited tab when there's something to clear
    if (clearAllBtn) {
      clearAllBtn.style.display = (activeTab === 'visited' && visitedItems.length > 0) ? 'inline-flex' : 'none';
    }

    // Empty state
    if (items.length === 0) {
      itemsEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.innerHTML = activeTab === 'visited'
          ? '<p>Nothing visited yet.</p><p>Click any article to start exploring.</p>'
          : '<p>Your reading list is empty.</p><p>Star any article from its preview to save it here.</p>';
      }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Sort by name (stable order)
    items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    itemsEl.innerHTML = '';
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'rl-item';
      const isSaved = userData.isSaved(item.id);
      const color = item.topCategory ? colorForCategory(item.topCategory) : '#8c1515';
      const removeLabel = activeTab === 'saved' ? 'Remove from list' : 'Forget this visit';
      row.innerHTML = `
        <span class="rl-tag" style="background:${color}"></span>
        <div class="rl-text">
          <div class="rl-name">${escapeHtml(item.name || item.id)}${activeTab === 'visited' && isSaved ? ' <span class="rl-saved-pill">★</span>' : ''}</div>
          ${item.topCategory ? `<div class="rl-cat">${escapeHtml(item.topCategory)}</div>` : ''}
        </div>
        <div class="rl-actions">
          <button class="rl-btn rl-open" title="Open">Open</button>
          <button class="rl-btn rl-remove" title="${removeLabel}">✕</button>
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
        if (activeTab === 'saved') userData.unsaveItem(item.id);
        else userData.unmarkVisited(item.id);
      });
      itemsEl.appendChild(row);
    });
  }

  userData.subscribe(render);
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
