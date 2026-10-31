// Prépare (sans l'exécuter) la création d'un second propriétaire. Voir docs/architecture-modernization/10-procedure-second-proprietaire.md.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparerProprietaireSecondaire } from "../backend/src/services/proprietaire-secondaire.ts";

function lireArguments(argv) {
  const valeurs = {};
  for (let index = 0; index < argv.length; index += 2) {
    const nom = argv[index];
    if (!nom?.startsWith("--") || argv[index + 1] === undefined) throw new Error(`Argument invalide: ${nom ?? ""}`);
    valeurs[nom.slice(2)] = argv[index + 1];
  }
  return valeurs;
}

const arguments_ = lireArguments(process.argv.slice(2));
for (const requis of ["identifiant", "nom", "operateur", "motif"]) {
  if (!arguments_[requis]) {
    console.error("Usage: node scripts/preparer-proprietaire-secondaire.mjs --identifiant <id> --nom \"<nom complet>\" --operateur \"<identité>\" --motif \"<motif ≥ 20 caractères>\" [--sortie <fichier.sql>]");
    process.exit(2);
  }
}

const resultat = await preparerProprietaireSecondaire({
  identifiant: arguments_.identifiant,
  nomComplet: arguments_.nom,
  operateur: arguments_.operateur,
  motif: arguments_.motif,
});
const sortie = arguments_.sortie ?? join(mkdtempSync(join(tmpdir(), "sigad-proprietaire2-")), "creation-proprietaire-secondaire.sql");
writeFileSync(sortie, resultat.sql, { encoding: "utf8", mode: 0o600, flag: "wx" });

console.error(`Fichier SQL écrit: ${sortie}`);
console.error("Rien n'a été exécuté. Étapes suivantes (par l'opérateur, sur l'environnement visé):");
console.error(`  npx wrangler d1 execute DB --remote --config wrangler.staging.toml --file="${sortie}"`);
console.error("  puis supprimer le fichier. Le code ci-dessous est affiché une seule fois et expire le " + resultat.expireLe + " (UTC).");
console.error("  Il se saisit comme mot de passe à la première connexion; MFA et nouveau mot de passe sont obligatoires.");
console.log(resultat.codeActivation);
