'use strict';
/* Moteur de poker Texas Hold'em multijoueur (2 à 6 joueurs) — aucune dépendance, tourne sous Node.js.
   Le serveur est le seul à connaître le paquet : chaque joueur ne reçoit que ses propres cartes. */
const crypto = require('crypto');

/* ===================== RÉGLAGES ===================== */
const MAX_JOUEURS = 6;
const NIVEAUX = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000]];
const BLINDES_CLASSIQUE = [10, 20];
const DUREE_PREMIER_NIVEAU = 180;   // secondes : le niveau 1 dure 3 minutes
const DUREE_NIVEAU = 150;           // puis 2 min 30 par niveau
const CHOIX = { mode: ['tournoi', 'classique'], stack: [200, 500, 1000, 2000], clock: [30, 45, 60, 90] };
const DELAI_DECO_TOUR = 8;          // secondes pour jouer quand on est déconnecté

/* ===================== CARTES ===================== */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_NAMES = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
const rankName = v => RANK_NAMES[v] || String(v);
const cardText = c => rankName(c.v) + SUITS[c.s];
const fmt = n => Math.round(n).toLocaleString('fr-FR');
function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let v = 2; v <= 14; v++) d.push({ v, s });
  return d;
}
function shuffle(a) {   // mélange équitable avec le générateur sécurisé de Node
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===================== ÉVALUATION DES MAINS ===================== */
// Une main de 5 cartes devient un tableau [catégorie, détails...] ; on compare deux mains avec cmp().
function eval5(cs) {
  const vals = cs.map(c => c.v).sort((a, b) => b - a);
  const flush = cs[0].s === cs[1].s && cs[1].s === cs[2].s && cs[2].s === cs[3].s && cs[3].s === cs[4].s;
  let straight = false, high = vals[0];
  if (vals[0] !== vals[1] && vals[1] !== vals[2] && vals[2] !== vals[3] && vals[3] !== vals[4]) {
    if (vals[0] - vals[4] === 4) straight = true;
    else if (vals[0] === 14 && vals[1] === 5 && vals[4] === 2) { straight = true; high = 5; }
  }
  const count = {};
  for (const v of vals) count[v] = (count[v] || 0) + 1;
  const groups = Object.keys(count).map(k => [+k, count[k]]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(g => g[1]).join('');
  const order = groups.map(g => g[0]);
  if (straight && flush) return [8, high];
  if (shape[0] === '4') return [7, ...order];
  if (shape === '32') return [6, ...order];
  if (flush) return [5, ...vals];
  if (straight) return [4, high];
  if (shape[0] === '3') return [3, ...order];
  if (shape === '221') return [2, ...order];
  if (shape[0] === '2') return [1, ...order];
  return [0, ...vals];
}
function cmp(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
function combos(n, k) {
  const out = [];
  (function rec(start, cur) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < n; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
  })(0, []);
  return out;
}
const COMBOS = { 5: combos(5, 5), 6: combos(6, 5), 7: combos(7, 5) };
function bestHand(cards) {
  let best = null;
  for (const idx of COMBOS[cards.length]) {
    const sc = eval5(idx.map(i => cards[i]));
    if (best === null || cmp(sc, best) > 0) best = sc;
  }
  return best;
}

// Nom lisible de la meilleure main (avec 2 à 7 cartes), pour l'afficher à côté de la main du joueur
const NOM_RANG = { 11: 'Valets', 12: 'Dames', 13: 'Rois', 14: 'As' };
const nomRang = v => NOM_RANG[v] || String(v);                      // « Rois », « 7 »
const deRang = v => (v === 14 ? "d'As" : 'de ' + nomRang(v));       // « de Rois », « d'As »
const AU_RANG = { 11: 'au Valet', 12: 'à la Dame', 13: 'au Roi', 14: "à l'As" };
function nomMain(cartes) {
  if (!cartes || cartes.length < 2) return '';
  const vals = cartes.map(c => c.v).sort((a, b) => b - a);
  if (cartes.length === 2) return vals[0] === vals[1] ? `Paire ${deRang(vals[0])}` : `Carte haute : ${rangSingulier(vals[0])}`;
  const sc = bestHand(cartes);
  switch (sc[0]) {
    case 8: return sc[1] === 14 ? 'Quinte flush royale' : `Quinte flush ${AU_RANG[sc[1]] || 'au ' + sc[1]}`;
    case 7: return `Carré ${deRang(sc[1])}`;
    case 6: return `Full aux ${nomRang(sc[1])} par ${nomRang(sc[2])}`;
    case 5: return 'Couleur';
    case 4: return `Suite ${AU_RANG[sc[1]] || 'au ' + sc[1]}`;
    case 3: return `Brelan ${deRang(sc[1])}`;
    case 2: return `Double paire : ${nomRang(sc[1])} et ${nomRang(sc[2])}`;
    case 1: return `Paire ${deRang(sc[1])}`;
    default: return `Carte haute : ${rangSingulier(sc[1])}`;
  }
}
const rangSingulier = v => ({ 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' }[v] || String(v));


/* ===================== LA TABLE ===================== */
const nettoyerNom = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

class Table {
  constructor(code, opts = {}) {
    this.code = code;
    this.now = opts.now || Date.now;
    this.setT = opts.setTimeout || setTimeout;
    this.clearT = opts.clearTimeout || clearTimeout;
    this.vitesse = opts.vitesse === undefined ? 1 : opts.vitesse;   // multiplie tous les délais (0 = instantané, pour les tests)
    this.onChange = opts.onChange || (() => {});
    this.players = [];
    this.hostId = null;
    this.settings = { mode: 'tournoi', stack: 500, clock: opts.clock === undefined ? 45 : opts.clock };
    this.phase = 'lobby';        // lobby | hand | between | over
    this.log = [];
    this.nextId = 1;
    this.gen = 0;                // change à chaque nouvelle main : les anciens minuteurs sont ignorés
    this.turnToken = 0;
    this.board = [];
    this.street = 0;
    this.dealerIdx = -1;
    this.toAct = -1;
    this.deadline = null;
    this.currentBet = 0;
    this.minRaise = 20;
    this.sb = 10; this.bb = 20;
    this.niveau = 0;
    this.finNiveau = 0;
    this.handNo = 0;
    this.result = null;
    this.runout = false;
    this.nextHandAt = null;
    this.winnerId = null;
    this.winnerIds = [];
    this.sbIdx = -1; this.bbIdx = -1;
    this.derniereActivite = this.now();
  }

  /* ---------- utilitaires ---------- */
  timer(fn, ms) {
    const g = this.gen;
    return this.setT(() => { if (g === this.gen) fn(); }, ms * this.vitesse);
  }
  emit() { this.derniereActivite = this.now(); this.onChange(this); }
  m(n) { return fmt(n); }
  parId(id) { return this.players.find(p => p.id === id); }
  parToken(token) { return this.players.find(p => p.token === token); }
  suivant(depuis, pred) {   // premier joueur après « depuis » (dans l'ordre des sièges) qui vérifie pred
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const k = (depuis + i + n * 2) % n;
      if (pred(this.players[k])) return k;
    }
    return -1;
  }
  actif(p) { return !p.out && p.stack > 0; }
  besoin(p) {
    if (p.folded || p.allIn) return false;
    if (p.bet < this.currentBet) return true;      // il y a une mise à suivre
    if (p.acted) return false;
    // pas encore parlé et mise égalisée (ex. la grosse blind) : il parle seulement si un autre joueur peut encore miser
    return this.players.some(o => o !== p && !o.folded && !o.allIn);
  }
  pot() { return this.players.reduce((s, p) => s + p.total, 0); }

  /* ---------- salon ---------- */
  addPlayer(nom) {
    if (this.phase !== 'lobby') return { error: 'La partie a déjà commencé.' };
    if (this.players.length >= MAX_JOUEURS) return { error: `La table est pleine (${MAX_JOUEURS} joueurs).` };
    let base = nettoyerNom(nom) || `Joueur ${this.players.length + 1}`;
    let n = base, k = 2;
    while (this.players.some(p => p.name.toLowerCase() === n.toLowerCase())) n = `${base.slice(0, 13)} ${k++}`;
    const p = {
      id: 'p' + this.nextId++, token: crypto.randomBytes(16).toString('hex'), name: n,
      stack: 0, bet: 0, total: 0, folded: false, allIn: false, out: false, connected: true, lastSeen: this.now(),
      hole: [], acted: false, canRaise: true, bubble: '', won: 0, revealed: false
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.emit();
    return { player: p };
  }
  removePlayer(id) {
    if (this.phase !== 'lobby') return;
    this.players = this.players.filter(p => p.id !== id);
    if (this.hostId === id) this.hostId = this.players.length ? this.players[0].id : null;
    this.emit();
  }
  setConnected(id, etat) {
    const p = this.parId(id);
    if (!p || p.connected === etat) { if (p) p.lastSeen = this.now(); return; }
    p.connected = etat; p.lastSeen = this.now();
    if (!etat && this.hostId === id) {   // l'organisateur est parti : un autre joueur connecté reprend le rôle
      const autre = this.players.find(q => q.connected && q.id !== id);
      if (autre) this.hostId = autre.id;
    }
    this.emit();
  }
  purger() {   // retire du salon ceux qui sont partis depuis plus d'une minute
    if (this.phase !== 'lobby') return;
    const t = this.now();
    for (const p of this.players.slice()) if (!p.connected && t - p.lastSeen > 60000) this.removePlayer(p.id);
  }
  setSettings(id, patch) {
    if (id !== this.hostId) return { error: "Seul l'organisateur peut changer les réglages." };
    if (this.phase === 'hand' || this.phase === 'between') return { error: 'Pas pendant la partie.' };
    for (const k of Object.keys(CHOIX)) {
      if (patch && patch[k] !== undefined && CHOIX[k].includes(patch[k])) this.settings[k] = patch[k];
    }
    this.emit();
    return {};
  }
  start(id) {
    if (id !== this.hostId) return { error: "Seul l'organisateur peut lancer la partie." };
    if (this.phase === 'hand' || this.phase === 'between') return { error: 'La partie est déjà en cours.' };
    const prets = this.players.filter(p => p.connected);
    if (prets.length < 2) return { error: 'Il faut au moins 2 joueurs connectés.' };
    this.gen++;
    this.players = prets;   // ceux qui ne sont plus là ne jouent pas
    for (const p of this.players) { p.stack = this.settings.stack; p.out = false; p.won = 0; }
    this.log = [];
    this.handNo = 0;
    this.niveau = 0;
    this.finNiveau = this.now() + DUREE_PREMIER_NIVEAU * 1000;
    this.dealerIdx = crypto.randomInt(this.players.length);
    this.winnerId = null;
    this.result = null;
    this.startHand();
    return {};
  }

  /* ---------- une main ---------- */
  startHand() {
    this.gen++;
    this.turnToken++;
    const actifs = this.players.filter(p => this.actif(p));
    if (actifs.length < 2) return this.finPartie();
    this.handNo++;
    let monte = false;
    if (this.settings.mode === 'tournoi' && this.niveau < NIVEAUX.length - 1 && this.now() >= this.finNiveau) {
      this.niveau++; monte = true;
      this.finNiveau = this.now() + DUREE_NIVEAU * 1000;
    }
    [this.sb, this.bb] = this.settings.mode === 'tournoi' ? NIVEAUX[this.niveau] : BLINDES_CLASSIQUE;
    this.dealerIdx = this.suivant(this.dealerIdx, p => this.actif(p));
    this.board = []; this.street = 0; this.runout = false; this.result = null; this.nextHandAt = null; this.winnerId = null; this.winnerIds = [];
    const paquet = (this.melangeur || shuffle)(newDeck());
    this.deck = paquet;
    for (const p of this.players) {
      p.hole = []; p.bet = 0; p.total = 0; p.allIn = false; p.acted = false; p.canRaise = true; p.bubble = ''; p.won = 0; p.revealed = false;
      p.folded = !this.actif(p);
      if (!p.folded) p.hole = [paquet.pop(), paquet.pop()];
    }
    this.log.push({ t: `Main ${this.handNo} · blindes ${this.m(this.sb)} / ${this.m(this.bb)}`, head: true });
    if (monte) this.log.push({ t: `Les blindes montent : ${this.m(this.sb)} / ${this.m(this.bb)}.` });
    const heads = actifs.length === 2;
    this.sbIdx = heads ? this.dealerIdx : this.suivant(this.dealerIdx, p => !p.folded);
    this.bbIdx = this.suivant(this.sbIdx, p => !p.folded);
    const poster = (p, montant) => {
      const a = Math.min(montant, p.stack);
      p.stack -= a; p.bet += a; p.total += a;
      if (p.stack === 0) p.allIn = true;
      return a;
    };
    const psb = this.players[this.sbIdx], pbb = this.players[this.bbIdx];
    const a1 = poster(psb, this.sb), a2 = poster(pbb, this.bb);
    this.log.push({ t: `${psb.name} poste la petite blind (${this.m(a1)}), ${pbb.name} la grosse blind (${this.m(a2)}).` });
    this.currentBet = Math.max(psb.bet, pbb.bet);
    this.minRaise = this.bb;
    this.phase = 'hand';
    // Premier à parler : en tête à tête c'est le donneur (petite blind), sinon le joueur après la grosse blind
    const premier = heads ? this.sbIdx : this.suivant(this.bbIdx, p => !p.folded && !p.allIn);
    // premier joueur (à partir de « premier ») qui a vraiment une décision à prendre ; personne = tapis immédiat
    let choisi = -1;
    for (let k = 0; k < this.players.length && premier !== -1; k++) {
      const i = (premier + k) % this.players.length;
      if (this.besoin(this.players[i])) { choisi = i; break; }
    }
    if (choisi === -1) { this.toAct = -1; this.finTourEncheres(); return; }
    this.toAct = choisi;
    this.armerChrono();
    this.emit();
  }

  armerChrono() {
    this.turnToken++;
    const token = this.turnToken;
    const p = this.players[this.toAct];
    if (!p) { this.deadline = null; return; }
    const secondes = p.connected ? this.settings.clock : Math.min(DELAI_DECO_TOUR, this.settings.clock);
    if (!secondes) { this.deadline = null; return; }
    this.deadline = this.now() + secondes * 1000;
    const g = this.gen, idx = this.toAct;
    this.setT(() => {
      if (g !== this.gen || token !== this.turnToken || this.toAct !== idx || this.phase !== 'hand') return;
      this.log.push({ t: `Temps écoulé : ${p.name} ${p.bet >= this.currentBet ? 'checke' : 'se couche'}.` });
      this.appliquer(p, p.bet >= this.currentBet ? { type: 'call' } : { type: 'fold' });
    }, secondes * 1000 * this.vitesse);
  }

  /* ---------- actions d'un joueur ---------- */
  action(id, act) {
    if (this.phase !== 'hand') return { error: "Ce n'est pas le moment de jouer." };
    const p = this.players[this.toAct];
    if (!p || p.id !== id) return { error: "Ce n'est pas ton tour." };
    if (!act || typeof act !== 'object') return { error: 'Action invalide.' };
    const r = this.appliquer(p, act);
    return r || {};
  }

  appliquer(p, act) {
    if (act.type === 'check') act = { ...act, type: 'call' };
    const toCall = this.currentBet - p.bet;
    if (act.type === 'fold') {
      if (toCall <= 0) return { error: 'Inutile de te coucher : tu peux checker.' };
      p.folded = true; p.bubble = 'Se couche';
      this.log.push({ t: `${p.name} se couche.` });
    } else if (act.type === 'call') {
      const a = Math.min(toCall, p.stack);
      p.stack -= a; p.bet += a; p.total += a;
      if (p.stack === 0) p.allIn = true;
      p.acted = true;
      p.bubble = toCall <= 0 ? 'Check' : `Suit ${this.m(a)}` + (p.allIn ? ' · Tapis' : '');
      this.log.push({ t: toCall <= 0 ? `${p.name} checke.` : `${p.name} suit (${this.m(a)})${p.allIn ? ' — tapis !' : ''}.` });
    } else if (act.type === 'raise') {
      if (!p.canRaise) return { error: 'Tu ne peux plus relancer à ce tour.' };
      const maxTo = p.bet + p.stack;
      if (maxTo <= this.currentBet) return { error: 'Pas assez de jetons pour relancer : tu peux suivre.' };
      let to = Math.floor(Number(act.to));
      if (!Number.isFinite(to)) return { error: 'Montant invalide.' };
      const minTo = Math.min(this.currentBet + this.minRaise, maxTo);
      to = Math.max(minTo, Math.min(maxTo, to));
      const premiere = this.currentBet === 0;
      const delta = to - p.bet;
      p.stack -= delta; p.bet = to; p.total += delta;
      if (p.stack === 0) p.allIn = true;
      const increment = to - this.currentBet;
      const complete = increment >= this.minRaise;
      this.currentBet = to;
      for (const o of this.players) {
        if (o === p || o.folded || o.allIn) continue;
        if (complete) { o.acted = false; o.canRaise = true; }
        else { if (o.acted) o.canRaise = false; o.acted = false; }
      }
      if (complete) this.minRaise = increment;
      p.acted = true;
      p.bubble = (premiere ? `Mise ${this.m(to)}` : `Relance à ${this.m(to)}`) + (p.allIn ? ' · Tapis' : '');
      this.log.push({ t: `${p.name} ${premiere ? 'mise' : 'relance à'} ${this.m(to)}${p.allIn ? ' — tapis !' : ''}.` });
    } else {
      return { error: 'Action inconnue.' };
    }
    this.turnToken++;     // annule le chrono de ce tour
    this.deadline = null;
    this.avancer();
    return {};
  }

  avancer() {
    const enJeu = this.players.filter(p => !p.folded);
    if (enJeu.length === 1) return this.finParCoucher(enJeu[0]);
    const s = this.suivant(this.toAct, p => this.besoin(p));
    if (s !== -1) {
      this.toAct = s;
      this.armerChrono();
      this.emit();
      return;
    }
    this.finTourEncheres();
  }

  finTourEncheres() {
    for (const p of this.players) { p.bet = 0; p.acted = false; p.canRaise = true; p.bubble = ''; }
    this.currentBet = 0; this.minRaise = this.bb;
    this.deadline = null; this.toAct = -1;
    const peuvent = this.players.filter(p => !p.folded && !p.allIn);
    if (this.street === 3) return this.abattage();
    if (peuvent.length <= 1) {   // plus personne ne peut miser : on retourne les cartes et on déroule le tableau
      this.runout = true;
      for (const p of this.players) if (!p.folded) p.revealed = true;
      this.log.push({ t: `Tapis ! Les cartes sont retournées : ${this.players.filter(p => !p.folded).map(p => `${p.name} ${p.hole.map(cardText).join(' ')}`).join(' · ')}.` });
      this.emit();
      this.timer(() => this.etapeRunout(), 1800);
      return;
    }
    this.donnerTableau();
    this.toAct = this.suivant(this.dealerIdx, p => !p.folded && !p.allIn);
    this.armerChrono();
    this.emit();
  }

  donnerTableau() {
    this.street++;
    const n = this.street === 1 ? 3 : 1;
    const nouvelles = [];
    for (let i = 0; i < n; i++) nouvelles.push(this.deck.pop());
    this.board.push(...nouvelles);
    this.log.push({ t: `${['', 'Flop', 'Turn', 'River'][this.street]} : ${nouvelles.map(cardText).join(' ')}` });
  }

  etapeRunout() {
    if (this.street === 3) return this.abattage();
    this.donnerTableau();
    this.emit();
    this.timer(() => this.etapeRunout(), this.street === 3 ? 2600 : 2000);
  }

  /* ---------- pots et fin de main ---------- */
  calculerPots() {
    const contributeurs = this.players.filter(p => p.total > 0);
    const niveaux = [...new Set(contributeurs.filter(p => !p.folded).map(p => p.total))].sort((a, b) => a - b);
    const pots = [];
    let prec = 0;
    for (const L of niveaux) {
      let montant = 0;
      for (const p of contributeurs) montant += Math.max(0, Math.min(p.total, L) - prec);
      pots.push({ montant, eligibles: this.players.filter(p => !p.folded && p.total >= L) });
      prec = L;
    }
    const reste = contributeurs.reduce((s, p) => s + Math.max(0, p.total - prec), 0);   // jetons de joueurs couchés au-dessus du dernier niveau
    if (reste > 0 && pots.length) pots[pots.length - 1].montant += reste;
    return pots;
  }

  abattage() {
    const restants = this.players.filter(p => !p.folded);
    for (const p of restants) {
      p.revealed = true;
      p.score = bestHand(p.hole.concat(this.board));
      p.nom = nomMain(p.hole.concat(this.board));
    }
    const pots = this.calculerPots();
    const gagnantsTotal = new Set();
    const lignes = [];
    pots.forEach((pot, i) => {
      if (pot.montant <= 0) return;
      let meilleurs = [pot.eligibles[0]];
      for (const p of pot.eligibles.slice(1)) {
        const c = cmp(p.score, meilleurs[0].score);
        if (c > 0) meilleurs = [p]; else if (c === 0) meilleurs.push(p);
      }
      const part = Math.floor(pot.montant / meilleurs.length);
      let reste = pot.montant - part * meilleurs.length;
      // les jetons impairs vont au premier gagnant après le donneur
      meilleurs.sort((a, b) => ((this.players.indexOf(a) - this.dealerIdx + 99) % this.players.length) - ((this.players.indexOf(b) - this.dealerIdx + 99) % this.players.length));
      for (const w of meilleurs) {
        const g = part + (reste > 0 ? 1 : 0); if (reste > 0) reste--;
        w.stack += g; w.won += g; gagnantsTotal.add(w.id);
      }
      const noms = meilleurs.map(w => w.name).join(' et ');
      const etiquette = pots.length > 1 ? (i === 0 ? 'le pot principal' : `le pot secondaire ${i}`) : 'le pot';
      if (pot.eligibles.length === 1 && i > 0) lignes.push(`${noms} récupère ${this.m(pot.montant)} (mise non suivie).`);
      else lignes.push(`${noms} gagne${meilleurs.length > 1 ? 'nt' : ''} ${etiquette} (${this.m(pot.montant)}) avec ${meilleurs[0].nom}.`);
    });
    for (const l of lignes) this.log.push({ t: l });
    const gagnants = this.players.filter(p => gagnantsTotal.has(p.id));
    const principal = gagnants.slice().sort((a, b) => b.won - a.won)[0];
    this.result = {
      titre: gagnants.length > 1 ? `${gagnants.map(g => g.name).join(' & ')} se partagent le pot` : `${principal.name} gagne ${this.m(principal.won)}`,
      sous: pots.length > 1 ? 'Plusieurs pots : voir le journal' : principal.nom
    };
    this.winnerIds = gagnants.map(g => g.id);
    this.finMain(4500);
  }

  montrer(id) {   // après la main, un joueur peut montrer ses cartes aux autres
    if (this.phase !== 'between' && this.phase !== 'over') return { error: 'Tu pourras montrer tes cartes à la fin de la main.' };
    const p = this.parId(id);
    if (!p || !p.hole.length) return { error: "Tu n'as pas de cartes à montrer." };
    if (p.revealed) return {};
    p.revealed = true;
    this.log.push({ t: `${p.name} montre ses cartes : ${p.hole.map(cardText).join(' ')}.` });
    this.emit();
    return {};
  }
  finParCoucher(gagnant) {
    const total = this.pot();
    gagnant.stack += total; gagnant.won = total;
    this.log.push({ t: `${gagnant.name} remporte ${this.m(total)} : tous les autres se sont couchés.` });
    this.result = { titre: `${gagnant.name} gagne ${this.m(total)}`, sous: 'Tous les autres se sont couchés' };
    this.winnerIds = [gagnant.id];
    this.finMain(4500);   // le temps de décider de montrer ses cartes
  }

  finMain(delai) {
    this.turnToken++;
    this.deadline = null; this.toAct = -1;
    this.phase = 'between';
    for (const p of this.players) {
      if (p.stack <= 0 && !p.out) { p.out = true; this.log.push({ t: `${p.name} est éliminé.` }); }
    }
    const restants = this.players.filter(p => !p.out);
    if (restants.length <= 1) { this.finPartie(); return; }
    this.nextHandAt = this.now() + delai * this.vitesse;
    this.emit();
    this.timer(() => this.startHand(), delai);
  }

  finPartie() {
    this.gen++;
    this.turnToken++;
    this.deadline = null; this.toAct = -1;
    const restants = this.players.filter(p => !p.out && p.stack > 0);
    this.phase = 'over';
    this.winnerId = restants.length === 1 ? restants[0].id : null;
    if (this.winnerId) this.log.push({ t: `${restants[0].name} remporte la partie !` });
    this.emit();
  }

  /* ---------- ce que voit un joueur ---------- */
  secondesAvantHausse() {
    if (this.settings.mode !== 'tournoi' || this.niveau >= NIVEAUX.length - 1) return null;
    return Math.max(0, Math.ceil((this.finNiveau - this.now()) / 1000));
  }

  snapshot(forId) {
    const me = this.parId(forId);
    const enMain = this.phase === 'hand' || this.phase === 'between';
    const aMoi = me && this.phase === 'hand' && this.players[this.toAct] === me;
    const maxTo = me ? me.bet + me.stack : 0;
    const joueurs = this.players.map((p, i) => {
      const voit = p.id === forId || p.revealed;
      const cartes = voit && p.hole.length ? p.hole : null;
      return {
        id: p.id, name: p.name, seat: i, stack: p.stack, bet: p.bet, folded: p.folded && !p.out, out: p.out, allIn: p.allIn,
        connected: p.connected, isHost: p.id === this.hostId,
        isDealer: enMain && i === this.dealerIdx, isSB: this.phase === 'hand' && i === this.sbIdx, isBB: this.phase === 'hand' && i === this.bbIdx,
        bubble: p.bubble, won: p.won, shown: p.revealed,
        cards: cartes,
        hasCards: !p.folded && !p.out && p.hole.length > 0,
        nom: cartes && !p.folded ? nomMain(cartes.concat(this.board)) : ''
      };
    });
    return {
      code: this.code, serverNow: this.now(), phase: this.phase, hostId: this.hostId, you: forId,
      settings: this.settings, handNo: this.handNo, street: this.street,
      players: joueurs, board: this.board,
      pot: enMain ? (this.phase === 'hand' ? this.players.reduce((s, p) => s + (p.total - p.bet), 0) : 0) : 0,
      toAct: this.toAct >= 0 && this.players[this.toAct] ? this.players[this.toAct].id : null,
      deadline: this.deadline, runout: this.runout,
      you_can: aMoi ? {
        toCall: Math.min(this.currentBet - me.bet, me.stack),
        canRaise: me.canRaise && maxTo > this.currentBet,
        minTo: Math.min(this.currentBet + this.minRaise, maxTo), maxTo, currentBet: this.currentBet, bet: me.bet
      } : null,
      level: { sb: this.sb, bb: this.bb, niveau: this.niveau, secondes: this.secondesAvantHausse() },
      log: this.log.slice(-60), result: this.phase === 'between' || this.phase === 'over' ? this.result : null,
      nextHandAt: this.nextHandAt, winnerIds: this.winnerIds || [], winnerId: this.winnerId
    };
  }
}

module.exports = { Table, nomMain, bestHand, eval5, cmp, MAX_JOUEURS, NIVEAUX, CHOIX, cardText, nettoyerNom };
