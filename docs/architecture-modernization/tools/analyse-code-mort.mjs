// Analyse statique en lecture seule : fichiers orphelins, exports non référencés, dépendances npm utilisées.
// Usage : node docs/architecture-modernization/tools/analyse-code-mort.mjs > sortie.json
// Ne modifie aucun fichier. Résultats = CANDIDATS uniquement (voir 02-audit-code-mort.md pour la classification).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, extname, basename } from "node:path";

const racine = resolve(import.meta.dirname, "..", "..", "..");
const EXT_CODE = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs", ".css"]);
const IGNORES = new Set(["node_modules", ".git", ".wrangler", "dist", "playwright-report", "test-results", "private", "fixtures", "screenshots"]);

function parcourir(dossier, acc = []) {
  for (const nom of readdirSync(dossier)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    const st = statSync(chemin);
    if (st.isDirectory()) {
      if (relative(racine, chemin).replaceAll("\\", "/") === "docs") continue;
      parcourir(chemin, acc);
    } else acc.push(chemin);
  }
  return acc;
}

const fichiers = parcourir(racine).filter((f) => EXT_CODE.has(extname(f)) && statSync(f).size < 3_000_000 && basename(f) !== "worker-configuration.d.ts");
const contenu = new Map(fichiers.map((f) => [f, readFileSync(f, "utf8")]));
const rel = (f) => relative(racine, f).replaceAll("\\", "/");

function resoudre(depuis, spec) {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(depuis), spec);
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}.js`, `${base}.css`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const reImport = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|new URL\(\s*["']([^"']+)["']/g;
const entrants = new Map(); // fichier -> Set(importeurs)
const paquets = new Map(); // paquet -> Set(fichiers)
for (const [f, txt] of contenu) {
  for (const m of txt.matchAll(reImport)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec) continue;
    const cible = resoudre(f, spec);
    if (cible) {
      if (!entrants.has(cible)) entrants.set(cible, new Set());
      entrants.get(cible).add(f);
    } else if (!spec.startsWith(".") && !spec.startsWith("node:") && !spec.startsWith("/")) {
      const nom = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!paquets.has(nom)) paquets.set(nom, new Set());
      paquets.get(nom).add(rel(f));
    }
  }
}

// Références « texte » à un nom de fichier (scripts npm, docs, config, tests)
const corpusTexte = [...contenu.values()].join("\n") + "\n" + readFileSync(join(racine, "package.json"), "utf8");
const docsTexte = (() => {
  const d = join(racine, "docs");
  const acc = [];
  try { for (const f of parcourir(d)) if (f.endsWith(".md")) acc.push(readFileSync(f, "utf8")); } catch { /* absent */ }
  // parcourir() ignore docs : relire explicitement
  const rec = (dir) => { for (const n of readdirSync(dir)) { const p = join(dir, n); const s = statSync(p); if (s.isDirectory()) { if (!["screenshots"].includes(n)) rec(p); } else if (n.endsWith(".md")) acc.push(readFileSync(p, "utf8")); } };
  rec(d);
  return acc.join("\n");
})();

const orphelins = [];
for (const f of fichiers) {
  const r = rel(f);
  if (!/^(backend|frontend|shared|scripts)\//u.test(r)) continue;
  const importeurs = entrants.get(f) ?? new Set();
  if (importeurs.size > 0) continue;
  const nom = basename(f);
  const refTexteCode = corpusTexte.includes(nom) && [...contenu].some(([g, t]) => g !== f && t.includes(nom));
  const refDocs = docsTexte.includes(nom);
  orphelins.push({ fichier: r, taille: statSync(f).size, reference_texte_code: refTexteCode, reference_docs: refDocs });
}

// Exports non référencés ailleurs (mot entier)
const exportsInutilises = [];
const reExport = /export\s+(?:async\s+)?(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
for (const [f, txt] of contenu) {
  const r = rel(f);
  if (!/^(backend|frontend|shared)\//u.test(r)) continue;
  for (const m of txt.matchAll(reExport)) {
    const nom = m[1];
    const re = new RegExp(`(?<![\\w$])${nom.replace(/\$/g, "\\$")}(?![\\w$])`, "g");
    let utiliseAilleurs = false;
    for (const [g, t] of contenu) {
      if (g === f) continue;
      if (re.test(t)) { utiliseAilleurs = true; break; }
      re.lastIndex = 0;
    }
    if (utiliseAilleurs) continue;
    const occurrencesLocales = (txt.match(re) ?? []).length;
    exportsInutilises.push({ fichier: r, symbole: nom, usage_local: occurrencesLocales > 1 });
  }
}

// Dépendances npm
const pkg = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
const dependances = {};
for (const [section, liste] of [["dependencies", pkg.dependencies], ["devDependencies", pkg.devDependencies]]) {
  for (const nom of Object.keys(liste ?? {})) {
    const fichiersUsage = [...(paquets.get(nom) ?? [])];
    const mentionConfigOuScript = pkg.scripts && Object.values(pkg.scripts).some((s) => s.includes(nom.replace(/^@[^/]+\//u, "")));
    dependances[nom] = { section, version: liste[nom], importe_dans: fichiersUsage.length, exemples: fichiersUsage.slice(0, 3), script_npm: Boolean(mentionConfigOuScript) };
  }
}

// Scripts/ non référencés
const scriptsNonReferences = [];
for (const f of fichiers.filter((x) => rel(x).startsWith("scripts/"))) {
  const nom = basename(f);
  const dansPkg = JSON.stringify(pkg.scripts).includes(nom);
  const dansAutresCode = [...contenu].some(([g, t]) => g !== f && t.includes(nom));
  const dansDocs = docsTexte.includes(nom);
  if (!dansPkg && !dansAutresCode) scriptsNonReferences.push({ script: rel(f), taille: statSync(f).size, documente: dansDocs });
}

console.log(JSON.stringify({
  genere_le: new Date().toISOString(),
  nombre_fichiers_analyses: fichiers.length,
  orphelins_modules: orphelins,
  exports_non_references: exportsInutilises,
  dependances,
  scripts_non_references_par_package_ou_code: scriptsNonReferences,
}, null, 2));
