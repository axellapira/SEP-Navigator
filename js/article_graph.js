// Lightweight article graph built once from data.json.
// Powers BFS / random / adjacency lookups for speedrun + future features.

let _graph = null;

export function buildGraph(data) {
  if (_graph) return _graph;

  // Flatten hierarchy → article leaves (only nodes with article_url are playable).
  const articlesById = new Map();
  const articleList = [];
  function walk(node, parentCat, broaderCat) {
    if (node.article_url) {
      const a = {
        id: node.id || node.name,
        name: node.name,
        category: parentCat,
        broaderCategory: broaderCat,
        articleUrl: node.article_url
      };
      articlesById.set(a.id, a);
      articleList.push(a);
    }
    if (node.children) node.children.forEach(c => walk(c, node.name, parentCat));
  }
  walk(data.hierarchy, 'Root', null);

  // Adjacency (undirected — a citation in either direction lets you traverse).
  const adj = new Map(); // id -> Set(ids)
  function addEdge(a, b) {
    if (!articlesById.has(a) || !articlesById.has(b)) return;
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }
  (data.links || []).forEach(l => addEdge(l.source, l.target));

  // BFS shortest path A -> B. Returns array of ids including A and B, or null.
  // Optional `allowedSet` restricts which articles can be traversed (in addition to start/target).
  function shortestPath(a, b, allowedSet) {
    if (!articlesById.has(a) || !articlesById.has(b)) return null;
    if (a === b) return [a];
    const prev = new Map();
    const visited = new Set([a]);
    const queue = [a];
    while (queue.length) {
      const cur = queue.shift();
      const neighbors = adj.get(cur);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        if (allowedSet && n !== b && !allowedSet.has(n)) continue;
        visited.add(n);
        prev.set(n, cur);
        if (n === b) {
          const path = [b];
          let p = b;
          while (prev.has(p)) {
            p = prev.get(p);
            path.push(p);
          }
          return path.reverse();
        }
        queue.push(n);
      }
    }
    return null;
  }

  function neighborsOf(id) {
    return adj.get(id) || new Set();
  }

  function getArticle(id) {
    return articlesById.get(id);
  }

  function randomPair(minHops = 3, maxHops = 8, maxAttempts = 50, allowedCategories) {
    // Restrict pool to articles in allowed categories if provided.
    const pool = allowedCategories && allowedCategories.size
      ? articleList.filter(a => allowedCategories.has(a.broaderCategory || a.category))
      : articleList;
    if (pool.length < 2) return null;
    const allowedSet = allowedCategories && allowedCategories.size
      ? new Set(pool.map(p => p.id))
      : null;

    for (let i = 0; i < maxAttempts; i++) {
      const a = pool[Math.floor(Math.random() * pool.length)];
      const b = pool[Math.floor(Math.random() * pool.length)];
      if (a.id === b.id) continue;
      const path = shortestPath(a.id, b.id, allowedSet);
      if (path && path.length - 1 >= minHops && path.length - 1 <= maxHops) {
        return { start: a, target: b, optimal: path.length - 1, path };
      }
    }
    // Fallback: any pair within pool with a path.
    for (let i = 0; i < 50; i++) {
      const a = pool[Math.floor(Math.random() * pool.length)];
      const b = pool[Math.floor(Math.random() * pool.length)];
      if (a.id === b.id) continue;
      const path = shortestPath(a.id, b.id, allowedSet);
      if (path) return { start: a, target: b, optimal: path.length - 1, path };
    }
    return null;
  }

  function allTopCategories() {
    const set = new Set();
    articleList.forEach(a => {
      const c = a.broaderCategory || a.category;
      if (c && c !== 'Root') set.add(c);
    });
    return Array.from(set).sort();
  }

  // ----- Trivia / curiosity helpers -----

  function degree(id) {
    const s = adj.get(id);
    return s ? s.size : 0;
  }

  // Degree restricted to within an allowed subgraph.
  function degreeIn(id, allowedSet) {
    const s = adj.get(id);
    if (!s) return 0;
    if (!allowedSet) return s.size;
    let count = 0;
    for (const x of s) if (allowedSet.has(x)) count++;
    return count;
  }

  function mostCentralArticles(n = 5, allowedSet) {
    const pool = allowedSet
      ? articleList.filter(a => allowedSet.has(a.id))
      : articleList;
    return pool.slice()
      .sort((a, b) => degreeIn(b.id, allowedSet) - degreeIn(a.id, allowedSet))
      .slice(0, n)
      .map(a => ({ ...a, degree: degreeIn(a.id, allowedSet) }));
  }

  function lonelyArticles(n = 10, maxDegree = 1, allowedSet) {
    const pool = allowedSet
      ? articleList.filter(a => allowedSet.has(a.id))
      : articleList;
    return pool
      .filter(a => degreeIn(a.id, allowedSet) <= maxDegree)
      .sort((a, b) => degreeIn(a.id, allowedSet) - degreeIn(b.id, allowedSet))
      .slice(0, n)
      .map(a => ({ ...a, degree: degreeIn(a.id, allowedSet) }));
  }

  // BFS-based connected components (treat adjacency as undirected, ignoring isolated articles)
  function connectedComponents() {
    const seen = new Set();
    const comps = [];
    for (const a of articleList) {
      if (seen.has(a.id)) continue;
      // BFS from a.id
      const queue = [a.id];
      const comp = [];
      seen.add(a.id);
      while (queue.length) {
        const cur = queue.shift();
        comp.push(cur);
        const neigh = adj.get(cur);
        if (!neigh) continue;
        for (const n of neigh) {
          if (!seen.has(n) && articlesById.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      comps.push(comp);
    }
    return comps.sort((a, b) => b.length - a.length);
  }

  // Cut-vertices / articulation points using Tarjan's algorithm.
  // Optionally restricted to a subgraph induced by `allowedSet`.
  function bridgeArticles(allowedSet) {
    const pool = allowedSet
      ? articleList.filter(a => allowedSet.has(a.id))
      : articleList;
    const ids = pool.map(a => a.id);
    const disc = new Map();
    const low = new Map();
    const parent = new Map();
    const ap = new Set();
    let timer = 0;
    const neighbors = u => {
      const s = adj.get(u);
      if (!s) return [];
      if (!allowedSet) return Array.from(s);
      const out = [];
      for (const v of s) if (allowedSet.has(v)) out.push(v);
      return out;
    };

    function dfs(u) {
      const stack = [{ u, iter: null, children: 0 }];
      while (stack.length) {
        const frame = stack[stack.length - 1];
        if (frame.iter === null) {
          disc.set(frame.u, timer);
          low.set(frame.u, timer);
          timer++;
          frame.iter = neighbors(frame.u)[Symbol.iterator]();
        }
        let advanced = false;
        let next = frame.iter.next();
        while (!next.done) {
          const v = next.value;
          if (!disc.has(v)) {
            parent.set(v, frame.u);
            frame.children++;
            stack.push({ u: v, iter: null, children: 0 });
            advanced = true;
            break;
          } else if (v !== parent.get(frame.u)) {
            low.set(frame.u, Math.min(low.get(frame.u), disc.get(v)));
          }
          next = frame.iter.next();
        }
        if (!advanced) {
          stack.pop();
          if (stack.length) {
            const par = stack[stack.length - 1];
            low.set(par.u, Math.min(low.get(par.u), low.get(frame.u)));
            const isRoot = parent.get(par.u) === undefined;
            if (!isRoot && low.get(frame.u) >= disc.get(par.u)) ap.add(par.u);
          } else {
            if (frame.children > 1) ap.add(frame.u);
          }
        }
      }
    }
    for (const id of ids) if (!disc.has(id)) dfs(id);
    return Array.from(ap).map(id => articlesById.get(id)).filter(Boolean);
  }

  // Compute the longest shortest-path (graph diameter) AND every pair sharing
  // that max distance. `allowedSet` optionally restricts traversal + endpoints.
  const _diameterCache = new Map();   // cacheKey -> result
  function diameter(allowedSet) {
    const cacheKey = allowedSet
      ? 'sub:' + Array.from(allowedSet).sort().join(',')
      : 'all';
    if (_diameterCache.has(cacheKey)) return _diameterCache.get(cacheKey);

    let maxLen = 0;
    const seenPairs = new Set();
    const pairs = [];   // { a, b, len, path }

    // Source pool: if filtered, only allowed articles can start a BFS.
    const sources = allowedSet
      ? Array.from(allowedSet)
      : articleList.map(a => a.id);

    for (const start of sources) {
      const dist = new Map([[start, 0]]);
      const prev = new Map();
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift();
        const d = dist.get(cur);
        const neigh = adj.get(cur);
        if (!neigh) continue;
        for (const n of neigh) {
          if (dist.has(n)) continue;
          if (allowedSet && !allowedSet.has(n)) continue;
          dist.set(n, d + 1);
          prev.set(n, cur);
          queue.push(n);
        }
      }
      // Walk all distances reachable from `start`; track the max + collect pairs.
      for (const [endId, d] of dist) {
        if (endId === start) continue;
        if (d < maxLen) continue;
        if (d > maxLen) {
          maxLen = d;
          pairs.length = 0;
          seenPairs.clear();
        }
        // Use sorted pair key to dedupe (a,b) vs (b,a)
        const key = start < endId ? `${start}|${endId}` : `${endId}|${start}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        // Reconstruct path from start to endId
        const path = [endId];
        let p = endId;
        while (prev.has(p)) { p = prev.get(p); path.push(p); }
        pairs.push({ a: start, b: endId, len: d, path: path.reverse() });
      }
    }
    const result = { len: maxLen, pairs };
    _diameterCache.set(cacheKey, result);
    return result;
  }
  function clearDiameterCache() { _diameterCache.clear(); }

  function searchArticles(query, limit = 8) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (const a of articleList) {
      if (a.name.toLowerCase().includes(q)) {
        out.push(a);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  _graph = {
    articles: articleList,
    articlesById,
    adj,
    shortestPath,
    neighborsOf,
    getArticle,
    randomPair,
    searchArticles,
    allTopCategories,
    degree,
    degreeIn,
    mostCentralArticles,
    lonelyArticles,
    connectedComponents,
    bridgeArticles,
    diameter,
    clearDiameterCache
  };
  return _graph;
}

export function getGraph() { return _graph; }
