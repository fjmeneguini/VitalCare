/**
 * scripts/cleanup_ranking.js
 * ---------------------------
 * Script de administração (Node) para "limpar" o nó /players do Realtime Database.
 * Ele mantém apenas o melhor registro por jogador (por nome) e permite duas operações:
 *  - --preview: apenas exibe o que seria gravado (sem alterar o DB)
 *  - --apply: grava os dados limpos em /players (SOBRESCREVE o conteúdo atual)
 *
 * Segurança / pré-requisitos:
 * - Este script usa o Firebase Admin SDK e requer o arquivo de credenciais de serviço
 *   (serviceAccountKey.json), baixado no Firebase Console (Project Settings → Service accounts).
 * - Nunca compartilhe a chave de serviço em canais públicos.
 */

// Módulos Node necessários
const admin = require('firebase-admin');
const fs = require('fs');

// Verifica se a chave da conta de serviço existe
if (!fs.existsSync('./serviceAccountKey.json')) {
  console.error('Arquivo serviceAccountKey.json ausente na raiz do projeto. Baixe do Firebase Console.');
  process.exit(1);
}

// Carrega credenciais e inicializa Firebase Admin
// Nota: usamos require('../serviceAccountKey.json') porque este script está em ./scripts
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: serviceAccount.databaseURL || process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

async function run(apply) {
  // Lê todas as entradas atuais em /players
  const snapshot = await db.ref('players').once('value');
  const data = snapshot.val() || {};

  // Agrupa por nome (mantém a melhor pontuação por nome)
  const bestMap = new Map();
  Object.entries(data).forEach(([key, entry]) => {
    const name = (entry.name || 'Anônimo').trim();
    const score = Number(entry.score || 0);
    if (!bestMap.has(name) || score > (Number(bestMap.get(name).score) || 0)) {
      bestMap.set(name, { ...entry, _origKey: key });
    }
  });

  // Converte mapa para objeto pronto para gravar no DB
  const cleaned = {};
  Array.from(bestMap.values()).forEach((entry, idx) => {
    const k = entry.id || `clean_${idx}_${Date.now()}`;
    cleaned[k] = entry;
  });

  console.log('Encontrados', Object.keys(data).length, 'registros brutos. Jogadores únicos (melhores):', Object.keys(cleaned).length);

  if (apply) {
    console.log('Aplicando dados limpos em /players (isso irá sobrescrever os dados existentes).');
    await db.ref('players').set(cleaned);
    console.log('Concluído.');
  } else {
    console.log('Preview dos dados limpos:');
    console.log(cleaned);
  }
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
run(apply).catch(err => { console.error(err); process.exit(1); });
