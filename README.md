# SIGAD — Gestion intégrée des aides et des distributions

Application de gestion des aides et des distributions pour la République du Tchad. L’interface, les messages et les données de référence sont rédigés en français.

## Environnement local

Prérequis : Node.js 22.12 ou une version ultérieure et npm.

```powershell
npm install
npm run db:migrate:local
npm run dev
```

L’interface de développement est disponible sur `http://127.0.0.1:5173`. L’API locale est servie par Wrangler sur `http://127.0.0.1:8787`.

En développement, les identifiants de démonstration sont `proprietaire`, `central` et les 23 identifiants provinciaux de la spécification. Chaque compte reçoit un code d’activation aléatoire distinct et doit changer son mot de passe à la première connexion. Ces comptes sont limités à la base locale.

La commande `npm run db:migrate:local` sélectionne explicitement le mode de développement, génère le seed à partir du tableau des provinces de `sigad_v3_0.md`, puis applique les migrations D1 locales. Le fichier des codes d’activation en clair est créé hors du dépôt dans le répertoire temporaire sécurisé du système. Le seed contient uniquement leurs empreintes PBKDF2 et impose le changement du mot de passe à la première connexion.

## Initialisation d’une base de production

Générez les comptes de production et leur fichier de codes hors du dépôt :

```powershell
node scripts/generer-seed-initial.mjs --mode=production --fichier-codes="C:\chemin-securise\codes-activation.json"
```

Le fichier SQL produit contient uniquement les empreintes des codes. Le fichier de codes d’activation en clair est créé une seule fois hors du dépôt avec les permissions restreintes du système. Remplacez les identifiants D1 et les noms de compartiments R2 dans `wrangler.toml` par ceux des ressources de production avant toute commande distante.

## Contrôles

```powershell
npm run typecheck
npm run build
npm run test:unit
```

Les ressources D1 et R2 configurées dans `wrangler.toml` sont utilisées localement par Wrangler. Aucune ressource distante n’est sélectionnée par les commandes de développement.
