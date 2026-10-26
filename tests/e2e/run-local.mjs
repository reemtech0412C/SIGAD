import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const racine = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const runner = resolve(racine, "tests/integration/run-auth-worker.mjs");
const titreInscriptionSansCourriel = "inscription avec livraison e-mail désactivée sans OTP simulé";

function lancerSuite(environnement) {
  const resultat = spawnSync(process.execPath, [runner], {
    cwd: racine,
    env: environnement,
    stdio: "inherit",
    windowsHide: true,
  });
  if (resultat.error) {
    console.error(resultat.error);
    process.exitCode = 1;
    return;
  }
  if (resultat.status !== 0) process.exitCode = resultat.status ?? 1;
}

const environnementBase = { ...process.env, SIGAD_RUN_PLAYWRIGHT: "1" };
const executionPlaywrightCiblee = Boolean(
  process.env.SIGAD_PLAYWRIGHT_GREP || process.env.SIGAD_PLAYWRIGHT_GREP_INVERT,
);

if (executionPlaywrightCiblee) {
  lancerSuite(environnementBase);
} else {
  const environnementCourrielActif = {
    ...environnementBase,
    SIGAD_PLAYWRIGHT_GREP_INVERT: titreInscriptionSansCourriel,
    SIGAD_PLAYWRIGHT_OUTPUT_DIR: process.env.SIGAD_PLAYWRIGHT_OUTPUT_DIR ?? "test-results/e2e-email-active",
    SIGAD_PLAYWRIGHT_REPORT_DIR: process.env.SIGAD_PLAYWRIGHT_REPORT_DIR ?? "playwright-report/e2e-email-active",
  };
  delete environnementCourrielActif.SIGAD_EMAIL_DELIVERY_ENABLED;
  delete environnementCourrielActif.SIGAD_PLAYWRIGHT_GREP;
  console.log("=== Suite complète avec livraison e-mail active; scénario sans e-mail exécuté dans sa configuration dédiée ===");
  lancerSuite(environnementCourrielActif);

  const environnementSansCourriel = {
    ...environnementBase,
    SIGAD_EMAIL_DELIVERY_ENABLED: "false",
    SIGAD_INTEGRATION_TESTS: "comptes-sans-courriel-worker.test.mjs",
    SIGAD_PLAYWRIGHT_GREP: titreInscriptionSansCourriel,
    SIGAD_PLAYWRIGHT_OUTPUT_DIR: process.env.SIGAD_PLAYWRIGHT_OUTPUT_DIR ?? "test-results/e2e-email-disabled",
    SIGAD_PLAYWRIGHT_REPORT_DIR: process.env.SIGAD_PLAYWRIGHT_REPORT_DIR ?? "playwright-report/e2e-email-disabled",
  };
  delete environnementSansCourriel.SIGAD_PLAYWRIGHT_GREP_INVERT;
  console.log("=== Scénario d’inscription sans e-mail et son intégration dans la configuration dédiée ===");
  lancerSuite(environnementSansCourriel);
}
