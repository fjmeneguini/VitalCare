/*
  ranking.js
  ----------
  Integração cliente com Firebase Realtime Database para manter um ranking global.

  Principais responsabilidades:
  - exportar addPlayer(entry) para gravar uma entrada de score (usa auth anônima quando necessário)
  - exportar listenRanking(cb) que fornece um array deduplicado (melhor score por nome, case-insensitive)
  - manter um cache em window._lastRanking para renderização imediata na UI

  Observações de segurança/operacionais:
  - Este código assume regras de DB que permitem leituras; para gravação usamos autenticação anônima.
  - A deduplicação aqui é feita no cliente: agrupa por nome normalizado (lowercase) e mantém o melhor score.
*/

// Importações do SDK do Firebase (versão CDN compatível com módulos ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Configuração do Firebase para este projeto (fornecida pelo usuário)
const firebaseConfig = {
  apiKey: "AIzaSyAiwy5ScED2U5J2COhlN-AjBgY6mYmhfiM",
  authDomain: "rankinggame-d6292.firebaseapp.com",
  databaseURL: "https://rankinggame-d6292-default-rtdb.firebaseio.com",
  projectId: "rankinggame-d6292",
  storageBucket: "rankinggame-d6292.firebasestorage.app",
  messagingSenderId: "617402964167",
  appId: "1:617402964167:web:fd73fadc53486c581846e2"
};

// Inicializa o app Firebase e instâncias de Database/Auth
console.log('[ranking.js] initializing Firebase app');
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/*
  ensureAuth()
  --------------
  Garante (o melhor que podemos no cliente) que exista um usuário autenticado
  via autenticação anônima antes de executar operações de escrita no Realtime DB.

  Retorna uma Promise que resolve com o usuário (ou null em caso de falha). Em caso
  de falha no signInAnonymously, ainda resolvemos para não bloquear leituras.
*/
let authReady = false;
function ensureAuth() {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      authReady = true;
      return resolve(auth.currentUser);
    }

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        authReady = true;
        console.log('[ranking.js] auth state changed - user:', user.uid);
        unsub();
        resolve(user);
      }
    });

    // Tenta autenticação anônima; em caso de erro resolvemos com null para não bloquear leituras
    signInAnonymously(auth).catch((err) => {
      console.error('Anonymous sign-in failed:', err);
      resolve(null);
    });
  });
}

/*
  addPlayer(entry)
  ----------------
  API pública para adicionar um registro de jogador no nó /players do Realtime DB.
  Usa ensureAuth() para tentar autenticar anonimamente antes da escrita.

  Entrada esperada: objeto com campos como { id, timestamp, name, score, prize, ... }
*/
export async function addPlayer(entry) {
  await ensureAuth(); // garante autenticação antes de gravar
  const playersRef = ref(db, 'players');
  return push(playersRef, entry);
}

/*
  listenRanking(callback)
  -----------------------
  Anexa um listener em /players e transforma a carga em um array de jogadores únicos
  (case-insensitive por nome), mantendo a melhor pontuação e a contagem de runs por nome.

  O callback será chamado com um array do formato:
    [{ name, score, id, prize, timestamp, count }, ...]

  Observações:
  - A deduplicação é útil para apresentar um "melhor por jogador" no ranking global.
  - Mantemos também window._lastRanking como cache de leitura rápida para a UI.
*/
export function listenRanking(callback) {
  console.log('[ranking.js] listenRanking called');
  const playersRef = ref(db, 'players');

  onValue(playersRef, (snapshot) => {
    const data = snapshot.val();
    console.log('[ranking.js] DB snapshot:', data);

    const bestMap = new Map();
    if (data) {
      Object.entries(data).forEach(([key, entry]) => {
        const rawName = (entry.name || 'Anônimo').trim();
        const nameKey = rawName.toLowerCase();
        const score = Number(entry.score || 0);
        if (!bestMap.has(nameKey)) {
          bestMap.set(nameKey, { best: entry, count: 1, displayName: rawName });
        } else {
          const cur = bestMap.get(nameKey);
          cur.count = (cur.count || 0) + 1;
          if (score > Number(cur.best.score || 0)) {
            cur.best = entry;
            cur.displayName = rawName;
          }
          bestMap.set(nameKey, cur);
        }
      });
    }

    const uniquePlayers = Array.from(bestMap.entries()).map(([nameKey, info]) => {
      const e = info.best;
      return {
        name: info.displayName || nameKey,
        score: Number(e.score || 0),
        id: e.id || e.key || null,
        prize: e.prize || null,
        timestamp: e.timestamp || null,
        count: info.count || 1
      };
    }).sort((a, b) => b.score - a.score);
    console.log('[ranking.js] unique players count:', uniquePlayers.length);

    try {
      if (typeof window !== 'undefined') {
        window._lastRanking = uniquePlayers;
      }
    } catch (e) { /* ignore */ }

    try {
      const el = typeof document !== 'undefined' ? document.getElementById('ranking') : null;
      console.log('[ranking.js] document #ranking element present?', !!el);
    } catch (e) {
      console.warn('[ranking.js] error checking DOM element:', e);
    }

    callback(uniquePlayers);
  }, (err) => {
    console.error('listenRanking error', err);
    callback([]);
  });
}

/*
  Compatibilidade global
  ----------------------
  Muitos trechos da UI usam window.addPlayer / window.listenRanking; aqui expomos essas
  funções no escopo global para compatibilidade e deixamos um getter para o cache local.
*/
if (typeof window !== 'undefined') {
  window.addPlayer = window.addPlayer || addPlayer;
  window.listenRanking = window.listenRanking || listenRanking;
  window._lastRanking = window._lastRanking || [];
  window.getCachedRanking = () => window._lastRanking || [];
}
