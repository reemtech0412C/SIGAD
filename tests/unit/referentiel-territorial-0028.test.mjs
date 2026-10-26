import { describe, expect, it } from "vitest";
import { schemaMenage, MILIEUX_INTERVENTION } from "../../shared/validations/beneficiaires";
import { schemaPropositionLocalite, schemaPropositionSiteHumanitaire } from "../../shared/validations/territoire";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Chantier 01 — Référentiel Territorial SIGAD", () => {
  it("valide les 4 milieux d’intervention réglementaires", () => {
    expect(MILIEUX_INTERVENTION).toEqual([
      "URBAIN",
      "RURAL_SEDENTAIRE",
      "NOMADE_PASTORAL",
      "SITE_HUMANITAIRE",
    ]);
  });

  it("accepte un ménage dans N’Djaména sans département", () => {
    const payload = {
      province_id: "prov-ndjamena",
      departement_id: null,
      milieu_intervention: "URBAIN",
      localite_id: "loc-ndjamena-ville",
      arrondissement_id: "arr-ndj-1",
      quartier_id: "qrt-ndj-1-farcha",
      nom_chef_menage: "Mahamat Hassan",
      sexe_chef: "M",
      nombre_personnes: 5,
      telephone: "+23566001122",
      categorie_population_id: "cat-pop-hote-vulnerable",
      criteres_vulnerabilite: ["FEMME_CHEF_MENAGE"],
      date_enregistrement: "2026-10-25",
    };
    const res = schemaMenage.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("accepte un ménage en province rurale avec département candidat", () => {
    const payload = {
      province_id: "prov-sila",
      departement_id: "dep-sila-abdi",
      milieu_intervention: "RURAL_SEDENTAIRE",
      nom_chef_menage: "Mariam Idriss",
      sexe_chef: "F",
      nombre_personnes: 6,
      telephone: "+23566112233",
      categorie_population_id: "cat-pop-refugie",
      criteres_vulnerabilite: ["FEMME_CHEF_MENAGE"],
      date_enregistrement: "2026-10-25",
    };
    const res = schemaMenage.safeParse(payload);
    expect(res.success).toBe(true);
  });

  it("permet de proposer une localité ou un site avec département optionnel", () => {
    const propLocalite = {
      nom: "Village Test",
      type_localite: "VILLAGE",
      source_documentation: "Rapport terrain délégation 2026",
    };
    expect(schemaPropositionLocalite.safeParse(propLocalite).success).toBe(true);

    const propSite = {
      nom: "Camp Réfugiés Test",
      categorie_site: "CAMP_REFUGIES",
      source_documentation: "Coordination humanitaire 2026",
    };
    expect(schemaPropositionSiteHumanitaire.safeParse(propSite).success).toBe(true);
  });

  it("vérifie l'intégrité SQLite de la migration 0028 et des 112 départements candidats", () => {
    const db = new DatabaseSync(":memory:");
    const dir = resolve(process.cwd(), "migrations");
    const sqlFiles = readdirSync(dir)
      .filter((f) => /^\d{4}_.*\.sql$/u.test(f))
      .sort((a, b) => a.localeCompare(b));

    for (const f of sqlFiles) {
      db.exec(readFileSync(resolve(dir, f), "utf8"));
    }

    const fkCheck = db.prepare("PRAGMA foreign_key_check").all();
    expect(fkCheck.length).toBe(0);

    const nbDep = db.prepare("SELECT COUNT(*) AS total FROM departements").get().total;
    expect(nbDep).toBe(112);

    const depSila = db.prepare("SELECT nom, statut_validation FROM departements WHERE id = 'dep-sila-abdi'").get();
    expect(depSila.nom).toBe("Abdi");
    expect(["VALIDE", "A_VERIFIER"]).toContain(depSila.statut_validation);

    const depKleta = db.prepare("SELECT nom, statut_validation, statut_operationnel, certification_juridique FROM departements WHERE id = 'dep-barh-el-gazel-kleta'").get();
    expect(depKleta.statut_validation).toBe("VALIDE");
    expect(depKleta.statut_operationnel).toBe("ACTIF");
    expect(depKleta.certification_juridique).toBe("NON_CERTIFIE");

    const ndj = db.prepare("SELECT nom, mode_decoupage_urbain FROM localites WHERE id = 'loc-ndjamena-ville'").get();
    expect(ndj.nom).toBe("Ville de N'Djamena");
    expect(ndj.mode_decoupage_urbain).toBe("AVEC_ARRONDISSEMENTS");

    const nbArr = db.prepare("SELECT COUNT(*) AS total FROM arrondissements WHERE localite_id = 'loc-ndjamena-ville'").get().total;
    expect(nbArr).toBe(10);

    const nbQrt = db.prepare("SELECT COUNT(*) AS total FROM quartiers WHERE localite_id = 'loc-ndjamena-ville'").get().total;
    expect(nbQrt).toBe(19);

    db.close();
  });
});
