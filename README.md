# Poker entre amis

Un Texas Hold'em à **2 – 6 joueurs** avec des **jetons virtuels** (aucun argent réel, aucun compte).
Un joueur crée une table, partage le lien, les amis cliquent et jouent — sur téléphone ou ordinateur.

## Ce qu'il y a dans ce dossier

| Fichier | Rôle |
|---|---|
| `server.js` | Le serveur : il met en relation les joueurs |
| `game.js` | Les règles du poker (mélange, mises, pots, abattage…) |
| `public/index.html` | La page du jeu que voient les joueurs |
| `package.json` | Dit à l'hébergeur comment démarrer le serveur |

Le serveur n'a **aucune dépendance** à installer. Il mélange les cartes lui-même et n'envoie à chaque joueur que **ses** cartes : personne ne peut tricher en regardant le code de la page.

## Essayer sur ton ordinateur (facultatif)

1. Installe [Node.js](https://nodejs.org) (version « LTS »).
2. Dans ce dossier, ouvre un terminal et tape : `node server.js`
3. Ouvre <http://localhost:3000> dans plusieurs onglets pour simuler plusieurs joueurs.

## Le mettre en ligne gratuitement (pour jouer avec tes amis)

Pour que tes amis puissent y accéder depuis chez eux, il faut un petit serveur sur Internet. **Render** en propose un gratuit. Compte une vingtaine de minutes la première fois.

### Étape 1 — Mettre les fichiers sur GitHub

1. Crée un compte gratuit sur <https://github.com>.
2. Clique sur **+** (en haut à droite) → **New repository**. Nom : `poker-entre-amis`. Laisse **Public** (ou Private, comme tu veux), puis **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file**.
4. Dézippe le dossier sur ton ordinateur, puis **glisse tout son contenu** dans la page : `server.js`, `game.js`, `package.json`, `README.md` **et le dossier `public`**.
5. Attends la fin du chargement, puis clique sur **Commit changes**.

> Vérifie que `server.js` et `game.js` sont bien à la racine du dépôt, et que `index.html` est bien dans un dossier `public`.

### Étape 2 — Créer le site sur Render

1. Va sur <https://render.com> et clique sur **Get Started** → **GitHub** pour te connecter avec le compte créé à l'étape 1.
2. Dans le tableau de bord : **New +** → **Web Service**, puis choisis ton dépôt `poker-entre-amis` (si tu ne le vois pas, clique sur *Configure GitHub App* et autorise-le).
3. Remplis :
   - **Language** : `Node`
   - **Region** : `Frankfurt (EU Central)` (le plus proche de la France)
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
4. Clique sur **Create Web Service** (ou *Deploy Web Service*). Si Render te demande une carte bancaire, c'est que tu n'as pas choisi **Free**.
5. Après 2 à 4 minutes, Render affiche une adresse du type `https://poker-entre-amis-xxxx.onrender.com`. **C'est le lien de ton jeu.**

### Étape 3 — Jouer

1. Ouvre ton lien, entre ton prénom, clique sur **Créer une table**.
2. Clique sur **Copier** et envoie le lien (`…/?t=ABCDE`) à tes amis par message : ils n'ont qu'à entrer leur prénom et cliquer sur **Rejoindre**.
3. Quand tout le monde est là (2 à 6), tu règles la partie et tu cliques sur **Lancer la partie**.

## À savoir

- **Le serveur gratuit s'endort** après environ 15 minutes sans visite. Le premier chargement peut alors prendre 30 à 60 secondes. Ouvre le lien une minute avant de jouer. Tant qu'un joueur a la page ouverte, la table reste réveillée.
- **Les tables vivent en mémoire** : si le serveur redémarre (mise à jour, panne), les parties en cours disparaissent. Il suffit de recréer une table.
- **On ne peut pas rejoindre une partie déjà commencée.** Un joueur qui perd sa connexion peut revenir avec le même navigateur et reprend sa place ; s'il tarde trop, son tour est joué automatiquement (check ou se coucher).
- **Jetons virtuels uniquement.** Il n'y a ni paiement ni gestion d'argent dans ce projet, et il ne doit pas y en avoir : proposer du poker en ligne avec de l'argent réel est réservé en France aux opérateurs agréés par l'ANJ. Si vous jouez de l'argent entre amis, les comptes se règlent hors de l'application, en vrai.
- À la fin d'une main, un bouton **Montrer mes cartes** permet de les dévoiler aux autres joueurs (même si tu t'es couché).
- Les prénoms sont limités à 16 caractères, une table s'efface après 20 minutes sans joueur connecté.

## Si ça ne marche pas

- **Page blanche ou « Service Unavailable »** juste après avoir ouvert le lien : le serveur se réveille, attends une minute et recharge.
- **Le déploiement échoue sur Render** : ouvre l'onglet **Logs**. Vérifie que `package.json` est bien à la racine du dépôt et que la Start Command est `npm start`.
- **« Table introuvable »** : le code est faux, ou la table a expiré. Crée-en une nouvelle.
