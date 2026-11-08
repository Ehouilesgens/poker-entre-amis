'use strict';
/* Serveur du poker entre amis : aucune dépendance, uniquement Node.js.
   - La page du jeu est servie à l'adresse de base.
   - Les joueurs reçoivent l'état de la table en direct (Server-Sent Events) et envoient leurs actions par POST.
   - Le serveur est seul maître du paquet : chacun ne reçoit que ses propres cartes. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Table, MAX_JOUEURS } = require('./game.js');

const PORT = Number(process.env.PORT) || 3000;
const PAGE = path.join(__dirname, 'public', 'index.html');
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // sans I, L, O : pas de confusion avec 1 et 0
const MAX_TABLES = 300;

/** code -> { table, clients: Map(playerId -> Set(res)), coupures: Map(playerId -> timeout) } */
const salles = new Map();

/* ---------- petits utilitaires ---------- */
function codeLibre() {
  for (let essai = 0; essai < 50; essai++) {
    let c = '';
    for (let i = 0; i < 5; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)];
    if (!salles.has(c)) return c;
  }
  return null;
}
function ipDe(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress) || '?';
}
const compteurs = new Map();   // limite de débit très simple : clé -> { n, debut }
function limite(cle, max, fenetreMs) {
  const t = Date.now();
  let c = compteurs.get(cle);
  if (!c || t - c.debut > fenetreMs) { c = { n: 0, debut: t }; compteurs.set(cle, c); }
  c.n++;
  return c.n <= max;
}
setInterval(() => { const t = Date.now(); for (const [k, c] of compteurs) if (t - c.debut > 120000) compteurs.delete(k); }, 60000).unref();

function json(res, code, obj) {
  const corps = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(corps) });
  res.end(corps);
}
function lireJson(req) {
  return new Promise((ok, ko) => {
    let taille = 0; const morceaux = [];
    req.on('data', d => { taille += d.length; if (taille > 4096) { ko(new Error('trop gros')); req.destroy(); } else morceaux.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}')); } catch (e) { ko(new Error('JSON invalide')); } });
    req.on('error', ko);
  });
}

/* ---------- salles ---------- */
function creerSalle() {
  if (salles.size >= MAX_TABLES) return null;
  const code = codeLibre();
  if (!code) return null;
  const salle = { clients: new Map(), coupures: new Map() };
  salle.table = new Table(code, { onChange: () => diffuser(salle) });
  salles.set(code, salle);
  return salle;
}
function diffuser(salle) {
  for (const [id, flux] of salle.clients) {
    if (!flux.size) continue;
    const data = `data: ${JSON.stringify(salle.table.snapshot(id))}\n\n`;
    for (const res of flux) { try { res.write(data); } catch (e) { /* connexion coupée : géré par 'close' */ } }
  }
}
function trouver(code, token) {
  const salle = salles.get(String(code || '').toUpperCase());
  if (!salle) return { erreur: 'Table introuvable. Vérifie le code.' };
  const joueur = salle.table.parToken(String(token || ''));
  return { salle, joueur };
}

/* ---------- routes ---------- */
async function api(req, res, url) {
  const ip = ipDe(req);
  if (req.method === 'GET' && url.pathname === '/api/ping') {   // la session est-elle encore valable ?
    const { joueur, erreur } = trouver(url.searchParams.get('code'), url.searchParams.get('token'));
    return json(res, erreur ? 404 : joueur ? 200 : 401, { ok: !!joueur });
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const { salle, joueur, erreur } = trouver(url.searchParams.get('code'), url.searchParams.get('token'));
    if (erreur || !joueur) return json(res, erreur ? 404 : 401, { error: erreur || 'Session inconnue : rejoins la table à nouveau.' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    let flux = salle.clients.get(joueur.id);
    if (!flux) { flux = new Set(); salle.clients.set(joueur.id, flux); }
    flux.add(res);
    const coupure = salle.coupures.get(joueur.id);
    if (coupure) { clearTimeout(coupure); salle.coupures.delete(joueur.id); }
    salle.table.setConnected(joueur.id, true);
    res.write(`data: ${JSON.stringify(salle.table.snapshot(joueur.id))}\n\n`);
    const battement = setInterval(() => { try { res.write(': ♥\n\n'); } catch (e) { /* rien */ } }, 15000);
    req.on('close', () => {
      clearInterval(battement);
      flux.delete(res);
      if (!flux.size) {   // petit délai : un rechargement de page ne doit pas déconnecter le joueur
        const t = setTimeout(() => { salle.coupures.delete(joueur.id); if (!(salle.clients.get(joueur.id) || new Set()).size) salle.table.setConnected(joueur.id, false); }, 4000);
        salle.coupures.set(joueur.id, t);
      }
    });
    return;
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'Méthode non permise.' });
  let corps;
  try { corps = await lireJson(req); } catch (e) { return json(res, 400, { error: e.message }); }
  if (corps === null || typeof corps !== 'object') return json(res, 400, { error: 'Requête invalide.' });

  if (url.pathname === '/api/create') {
    if (!limite('create:' + ip, 10, 60000)) return json(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' });
    const salle = creerSalle();
    if (!salle) return json(res, 503, { error: 'Le serveur est plein pour le moment, réessaie plus tard.' });
    const r = salle.table.addPlayer(corps.name);
    return json(res, 200, { code: salle.table.code, token: r.player.token, id: r.player.id });
  }
  if (url.pathname === '/api/join') {
    if (!limite('join:' + ip, 40, 60000)) return json(res, 429, { error: 'Trop de tentatives, réessaie dans une minute.' });
    const salle = salles.get(String(corps.code || '').toUpperCase());
    if (!salle) return json(res, 404, { error: 'Table introuvable. Vérifie le code.' });
    const r = salle.table.addPlayer(corps.name);
    if (r.error) return json(res, 409, { error: r.error });
    return json(res, 200, { code: salle.table.code, token: r.player.token, id: r.player.id });
  }

  const { salle, joueur, erreur } = trouver(corps.code, corps.token);
  if (erreur) return json(res, 404, { error: erreur });
  if (!joueur) return json(res, 401, { error: 'Session inconnue : rejoins la table à nouveau.' });
  if (!limite('act:' + joueur.id + salle.table.code, 240, 60000)) return json(res, 429, { error: 'Trop d\'actions, ralentis un peu.' });

  if (url.pathname === '/api/action') {
    const act = corps.action || {};
    if (act.type === 'show') { const r = salle.table.montrer(joueur.id); return json(res, r.error ? 409 : 200, r); }
    const r = salle.table.action(joueur.id, { type: String(act.type || ''), to: act.to });
    return json(res, r.error ? 409 : 200, r);
  }
  if (url.pathname === '/api/settings') {
    const r = salle.table.setSettings(joueur.id, corps.patch || {});
    return json(res, r.error ? 403 : 200, r);
  }
  if (url.pathname === '/api/start') {
    const r = salle.table.start(joueur.id);
    return json(res, r.error ? 409 : 200, r);
  }
  if (url.pathname === '/api/leave') {
    salle.table.removePlayer(joueur.id);
    const flux = salle.clients.get(joueur.id);
    if (flux) for (const r of flux) { try { r.end(); } catch (e) { /* rien */ } }
    salle.clients.delete(joueur.id);
    return json(res, 200, {});
  }
  return json(res, 404, { error: 'Route inconnue.' });
}

const ENTETES_PAGE = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
};

const serveur = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'Erreur du serveur.' }); });
    return;
  }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(PAGE, (err, data) => {
      if (err) { res.writeHead(500); return res.end('Page introuvable'); }
      res.writeHead(200, ENTETES_PAGE); res.end(data);
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Page introuvable');
});

/* ---------- ménage régulier ---------- */
setInterval(() => {
  const t = Date.now();
  for (const [code, salle] of salles) {
    salle.table.purger();
    const connectes = [...salle.clients.values()].reduce((n, s) => n + s.size, 0);
    const inactif = t - salle.table.derniereActivite;
    const trop = connectes === 0 ? inactif > 20 * 60000 : inactif > 6 * 3600000;
    if (trop) { salle.table.gen++; salles.delete(code); }
  }
}, 60000).unref();

if (require.main === module) {
  serveur.listen(PORT, () => console.log(`Poker entre amis : http://localhost:${PORT}`));
}
module.exports = { serveur, salles };
