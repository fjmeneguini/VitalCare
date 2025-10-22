// LocalStorage-backed ranking module
// Exporta: addPlayer(entry), listenRanking(callback), getRawRanking()
// Também anexa `addPlayer` e `listenRanking` ao window para compatibilidade com código inline.

const STORAGE_KEY = 'vitalcareRanking';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    console.warn('Failed to parse ranking from localStorage', e);
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// listener set for realtime-style callbacks
const listeners = new Set();

function notifyListeners() {
  const list = loadAll();
  // reduce to best score per player
  const bestMap = new Map();
  list.forEach(e => {
    const n = e.name || 'Anônimo';
    if (!bestMap.has(n) || e.score > bestMap.get(n).score) {
      bestMap.set(n, e);
    }
  });
  const ranking = Array.from(bestMap.values()).sort((a, b) => b.score - a.score);
  const arrForCallback = ranking.map(e => ({ name: e.name, score: e.score, id: e.id, prize: e.prize }));
  listeners.forEach(cb => {
    try { cb(arrForCallback); } catch (err) { console.error('ranking listener error', err); }
  });
}

// entry: full object with id, timestamp, name, score, prize, etc.
export function addPlayer(entry) {
  const list = loadAll();
  list.push(entry);
  saveAll(list);
  notifyListeners();
}

// Subscribe to ranking updates. Returns unsubscribe function.
export function listenRanking(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  // send initial
  notifyListeners();
  return () => listeners.delete(callback);
}

export function getRawRanking() {
  return loadAll();
}

// Expose in window for compatibility with jogo.html inline script
if (typeof window !== 'undefined') {
  window.addPlayer = window.addPlayer || addPlayer;
  window.listenRanking = window.listenRanking || listenRanking;
}
