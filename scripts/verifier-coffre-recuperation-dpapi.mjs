import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

if (process.platform !== "win32") throw new Error("La vérification du coffre exige Windows et DPAPI CurrentUser.");

const parentTemporaire = resolve(tmpdir());
const dossierTemporaire = await mkdtemp(join(parentTemporaire, "sigad-coffre-dpapi-verification-"));
const dossierVerifie = resolve(dossierTemporaire);
assert.ok(dossierVerifie.startsWith(`${parentTemporaire}${sep}`));
const ancienneValeurLocalAppData = process.env.LOCALAPPDATA;
const profilTemporaire = join(dossierTemporaire, "profil-test");
process.env.LOCALAPPDATA = profilTemporaire;

try {
  const moduleDpapi = await import("./coffre-recuperation-dpapi.mjs");
  const dossierCoffre = moduleDpapi.racineCoffre();
  await mkdir(dossierCoffre, { recursive: true });
  const codeSynthétique = Buffer.alloc(32, 0x5a).toString("base64url");
  const expiration = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace("T", " ");
  const chemin = await moduleDpapi.scellerJetonActivation(codeSynthétique, expiration);
  const contenu = await readFile(chemin, "utf8");
  assert.equal(contenu.includes(codeSynthétique), false, "Le coffre ne contient pas le code synthétique en clair.");
  const enregistrement = JSON.parse(contenu);
  assert.equal(enregistrement.portee, "activation-initiale-proprietaire");
  const dechiffre = JSON.parse(moduleDpapi.dechiffrerDpapi(enregistrement.contenuProtegeDpapi));
  assert.equal(dechiffre.compte, "proprietaire");
  assert.equal(dechiffre.code_activation, codeSynthétique);
  assert.equal(dechiffre.expire_le, expiration);
  console.log("PASS — coffre temporaire : scellement DPAPI CurrentUser, relecture, contrôle d’intégrité et ACL appliquée; valeur synthétique non affichée.");
} finally {
  if (ancienneValeurLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = ancienneValeurLocalAppData;
  const cheminVerifie = resolve(dossierVerifie);
  assert.ok(cheminVerifie.startsWith(`${parentTemporaire}${sep}`));
  await rm(cheminVerifie, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
