import { useCallback, useEffect, useState } from "react";
import type {
  PrevisualisationImportTerritoire,
  ResultatRechercheTerritoire,
  SimulationFusionTerritoire,
  SimulationRattachementTerritoire,
  TableauDeBordTerritorial,
  TypeUniteTerritoriale,
} from "../../../../shared/types/territoire";
import { requeteApi } from "../../services/api";
import {
  SIGADFormPanel,
  SIGADButton,
  SIGADBadge,
  SIGADTabsList,
  SIGADTab,
  SIGADAlert,
  SIGADStatCard,
} from "../ui";

interface AdministrationTerritorialeProps {
  jetonCsrf: string;
}

export function AdministrationTerritoriale({ jetonCsrf }: AdministrationTerritorialeProps) {
  // Onglet sous-section synchronisé avec l'URL (?vue=...)
  const [vue, setVue] = useState<"dashboard" | "arborescence" | "recherche" | "fusions" | "doublons" | "import_export" | "audits">(() => {
    if (typeof window !== "undefined") {
      const paramVue = new URLSearchParams(window.location.search).get("vue");
      if (paramVue === "sites") return "recherche";
      if (
        paramVue &&
        ["dashboard", "arborescence", "recherche", "fusions", "doublons", "import_export", "audits"].includes(paramVue)
      ) {
        return paramVue as "dashboard" | "arborescence" | "recherche" | "fusions" | "doublons" | "import_export" | "audits";
      }
    }
    return "dashboard";
  });

  // Données
  const [stats, setStats] = useState<TableauDeBordTerritorial | null>(null);
  const [arborescence, setArborescence] = useState<any[]>([]);
  const [resultatsRecherche, setResultatsRecherche] = useState<ResultatRechercheTerritoire[]>([]);
  const [totalRecherche, setTotalRecherche] = useState(0);
  const [audits, setAudits] = useState<any[]>([]);
  const [doublons, setDoublons] = useState<any[]>([]);

  // Filtres de recherche
  const [texteRecherche, setTexteRecherche] = useState("");
  const [filtreType, setFiltreType] = useState<TypeUniteTerritoriale | "">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("vue") === "sites" || params.get("type") === "SITE_HUMANITAIRE") {
        return "SITE_HUMANITAIRE";
      }
    }
    return "";
  });
  const [filtreStatut, setFiltreStatut] = useState<string>("");

  // Modales et formulaires
  const [modaleOuverte, setModaleOuverte] = useState<"creer" | "modifier" | "rattachement" | "fusion" | "supprimer" | null>(null);
  const [uniteSelectionnee, setUniteSelectionnee] = useState<ResultatRechercheTerritoire | null>(null);

  // États de simulation
  const [simulationRattachement, setSimulationRattachement] = useState<SimulationRattachementTerritoire | null>(null);
  const [simulationFusion, setSimulationFusion] = useState<SimulationFusionTerritoire | null>(null);

  // Formulaires locaux
  const [formCreation, setFormCreation] = useState({
    type: "VILLAGE" as TypeUniteTerritoriale,
    nom: "",
    code: "",
    province_id: "prov-batha",
    departement_id: "",
    sous_prefecture_id: "",
    commune_id: "",
    canton_id: "",
    localite_id: "",
    arrondissement_id: "",
    quartier_id: "",
    site_humanitaire_id: "",
    chef_lieu: "",
    source_officielle: "",
    reference_juridique: "",
    statut_validation: "VALIDE" as "VALIDE" | "A_VERIFIER" | "PROPOSE",
  });

  const [formModification, setFormModification] = useState({
    nom: "",
    code: "",
    chef_lieu: "",
    source_officielle: "",
    reference_juridique: "",
    motif: "Mise à jour administrative de l'unité territoriale",
  });

  const [formRattachement, setFormRattachement] = useState({
    nouveau_departement_id: "",
    nouvelle_sous_prefecture_id: "",
    justificatif: "Décret de restructuration territoriale 2026",
    motif: "Réalignement géographique opérationnel",
  });

  const [formFusion, setFormFusion] = useState({
    unite_principale_id: "",
    unite_doublon_id: "",
    type: "VILLAGE" as TypeUniteTerritoriale,
    motif: "Doublon toponymique avéré suite à l'inventaire",
    justificatif: "Revue conjointe avec la délégation provinciale",
  });

  const [confirmationFusionChecked, setConfirmationFusionChecked] = useState(false);

  // Filtres d'audit
  const [filtreAuditType, setFiltreAuditType] = useState<string>("");
  const [filtreAuditAction, setFiltreAuditAction] = useState<string>("");

  // Import CSV / XLSX
  const [texteCsv, setTexteCsv] = useState("");
  const [previsualisationCsv, setPrevisualisationCsv] = useState<PrevisualisationImportTerritoire | null>(null);

  // États génériques
  const [chargement, setChargement] = useState(false);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Charger le tableau de bord
  const chargerTableauDeBord = useCallback(async () => {
    try {
      setChargement(true);
      const data = await requeteApi<TableauDeBordTerritorial>("/api/proprietaire/territoire/tableau-de-bord");
      setStats(data);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement du tableau de bord");
    } finally {
      setChargement(false);
    }
  }, []);

  // Charger l'arborescence
  const chargerArborescence = useCallback(async () => {
    try {
      setChargement(true);
      const data = await requeteApi<any[]>("/api/proprietaire/territoire/arborescence");
      setArborescence(data);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement de l'arborescence");
    } finally {
      setChargement(false);
    }
  }, []);

  // Effectuer une recherche
  const lancerRecherche = useCallback(async () => {
    try {
      setChargement(true);
      setErreur(null);
      const params = new URLSearchParams();
      if (texteRecherche) params.set("recherche", texteRecherche);
      if (filtreType) params.set("type", filtreType);
      if (filtreStatut) params.set("statut_validation", filtreStatut);
      params.set("limite", "50");

      const res = await requeteApi<{ elements: ResultatRechercheTerritoire[]; total: number }>(
        `/api/proprietaire/territoire/recherche?${params.toString()}`
      );
      setResultatsRecherche(res.elements);
      setTotalRecherche(res.total);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de la recherche");
    } finally {
      setChargement(false);
    }
  }, [texteRecherche, filtreType, filtreStatut]);

  // Charger les audits
  const chargerAudits = useCallback(async () => {
    try {
      setChargement(true);
      const params = new URLSearchParams();
      params.set("limite", "50");
      if (filtreAuditType) params.set("type", filtreAuditType);
      if (filtreAuditAction) params.set("action", filtreAuditAction);
      const res = await requeteApi<{ elements: any[]; total: number }>(`/api/proprietaire/territoire/audits?${params.toString()}`);
      setAudits(res.elements);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de chargement des audits");
    } finally {
      setChargement(false);
    }
  }, [filtreAuditType, filtreAuditAction]);

  // Charger les doublons
  const chargerDoublons = useCallback(async () => {
    try {
      setChargement(true);
      const res = await requeteApi<{ doublons: any[] }>("/api/proprietaire/territoire/doublons?type=VILLAGE");
      setDoublons(res.doublons);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de la détection de doublons");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (vue === "dashboard") void chargerTableauDeBord();
    if (vue === "arborescence") void chargerArborescence();
    if (vue === "recherche") void lancerRecherche();
    if (vue === "audits") void chargerAudits();
    if (vue === "doublons") void chargerDoublons();
  }, [vue, chargerTableauDeBord, chargerArborescence, lancerRecherche, chargerAudits, chargerDoublons]);

  // Actions
  async function soumettreCreation() {
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi("/api/proprietaire/territoire/unites", {
        methode: "POST",
        jetonCsrf,
        corps: {
          ...formCreation,
          source_officielle: formCreation.source_officielle || undefined,
          reference_juridique: formCreation.reference_juridique || undefined,
          motif: "Ajout dans le référentiel territorial SIGAD",
        },
      });
      setMessageSucces(`L'unité « ${formCreation.nom} » a été créée avec succès.`);
      setModaleOuverte(null);
      void chargerTableauDeBord();
      if (vue === "recherche") void lancerRecherche();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur de création");
    } finally {
      setChargement(false);
    }
  }

  async function soumettreModification() {
    if (!uniteSelectionnee) return;
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(
        `/api/proprietaire/territoire/unites/${encodeURIComponent(uniteSelectionnee.id)}?type=${encodeURIComponent(uniteSelectionnee.type)}`,
        {
          methode: "PUT",
          jetonCsrf,
          corps: {
            nom: formModification.nom,
            code: formModification.code || null,
            chef_lieu: formModification.chef_lieu || null,
            source_officielle: formModification.source_officielle || undefined,
            reference_juridique: formModification.reference_juridique || undefined,
            motif: formModification.motif,
          },
        }
      );
      setMessageSucces(`L'unité « ${formModification.nom} » a été modifiée avec succès.`);
      setModaleOuverte(null);
      void chargerTableauDeBord();
      if (vue === "recherche") void lancerRecherche();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de la modification de l'unité");
    } finally {
      setChargement(false);
    }
  }

  async function archiverUnite(unite: ResultatRechercheTerritoire) {
    if (!window.confirm(`Confirmez-vous l'archivage de « ${unite.nom} » ?\nL'unité deviendra inactive sans être supprimée de l'historique.`)) {
      return;
    }
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(
        `/api/proprietaire/territoire/unites/${encodeURIComponent(unite.id)}/archiver?type=${encodeURIComponent(unite.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: { motif: "Archivage administratif validé par le Propriétaire" },
        }
      );
      setMessageSucces(`L'unité « ${unite.nom} » a été archivée avec succès.`);
      void lancerRecherche();
      void chargerTableauDeBord();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'archivage");
    } finally {
      setChargement(false);
    }
  }

  async function reactiverUnite(unite: ResultatRechercheTerritoire) {
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(
        `/api/proprietaire/territoire/unites/${encodeURIComponent(unite.id)}/reactiver?type=${encodeURIComponent(unite.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: { motif: "Réactivation administrative par le Propriétaire" },
        }
      );
      setMessageSucces(`L'unité « ${unite.nom} » a été réactivée avec succès.`);
      void lancerRecherche();
      void chargerTableauDeBord();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de la réactivation");
    } finally {
      setChargement(false);
    }
  }

  async function validerUnite(unite: ResultatRechercheTerritoire, nouveauStatut: "VALIDE" | "A_VERIFIER") {
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(`/api/proprietaire/territoire/unites/${encodeURIComponent(unite.id)}/valider?type=${encodeURIComponent(unite.type)}`, {
        methode: "POST",
        jetonCsrf,
        corps: {
          statut_validation: nouveauStatut,
          source_officielle: "Validation contradictoire Propriétaire SIGAD 2026",
          motif: `Statut passé à ${nouveauStatut} par l'autorité propriétaire.`,
        },
      });
      setMessageSucces(`Statut de l'unité « ${unite.nom} » mis à jour : ${nouveauStatut}.`);
      void lancerRecherche();
      void chargerTableauDeBord();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de la mise à jour du statut");
    } finally {
      setChargement(false);
    }
  }

  async function executerSimulationRattachement(unite: ResultatRechercheTerritoire, nouveauDepId: string) {
    try {
      setChargement(true);
      setErreur(null);
      const sim = await requeteApi<SimulationRattachementTerritoire>(
        `/api/proprietaire/territoire/unites/${encodeURIComponent(unite.id)}/simuler-rattachement?type=${encodeURIComponent(unite.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            nouveau_departement_id: nouveauDepId,
            justificatif: formRattachement.justificatif,
            motif: formRattachement.motif,
          },
        }
      );
      setSimulationRattachement(sim);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de simulation du rattachement");
    } finally {
      setChargement(false);
    }
  }

  async function appliquerRattachement() {
    if (!uniteSelectionnee) return;
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(
        `/api/proprietaire/territoire/unites/${encodeURIComponent(uniteSelectionnee.id)}/rattachement?type=${encodeURIComponent(uniteSelectionnee.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: formRattachement,
        }
      );
      setMessageSucces(`Le rattachement de « ${uniteSelectionnee.nom} » a été mis à jour.`);
      setModaleOuverte(null);
      setSimulationRattachement(null);
      void lancerRecherche();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec du rattachement");
    } finally {
      setChargement(false);
    }
  }

  async function simulerFusion() {
    try {
      setChargement(true);
      setErreur(null);
      const sim = await requeteApi<SimulationFusionTerritoire>(
        `/api/proprietaire/territoire/fusions/simulation?type=${encodeURIComponent(formFusion.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            unite_principale_id: formFusion.unite_principale_id,
            unite_doublon_id: formFusion.unite_doublon_id,
            motif: formFusion.motif,
            justificatif: formFusion.justificatif,
          },
        }
      );
      setSimulationFusion(sim);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de simulation de fusion");
    } finally {
      setChargement(false);
    }
  }

  async function executerFusion() {
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(
        `/api/proprietaire/territoire/fusions/executer?type=${encodeURIComponent(formFusion.type)}`,
        {
          methode: "POST",
          jetonCsrf,
          corps: {
            unite_principale_id: formFusion.unite_principale_id,
            unite_doublon_id: formFusion.unite_doublon_id,
            motif: formFusion.motif,
            justificatif: formFusion.justificatif,
          },
        }
      );
      setMessageSucces("Fusion exécutée avec succès. L'historique des distributions physiques est préservé.");
      setSimulationFusion(null);
      void chargerTableauDeBord();
      if (vue === "doublons") void chargerDoublons();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'exécution de la fusion");
    } finally {
      setChargement(false);
    }
  }

  async function supprimerUnite(unite: ResultatRechercheTerritoire) {
    if (!window.confirm(`Confirmez-vous la suppression sécurisée de « ${unite.nom} » ?\nCette opération échouera si l'unité est référencée par des ménages ou des distributions.`)) {
      return;
    }
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi(`/api/proprietaire/territoire/unites/${encodeURIComponent(unite.id)}?type=${encodeURIComponent(unite.type)}`, {
        methode: "DELETE",
        jetonCsrf,
      });
      setMessageSucces(`L'unité « ${unite.nom} » a été supprimée.`);
      void lancerRecherche();
      void chargerTableauDeBord();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de la suppression");
    } finally {
      setChargement(false);
    }
  }

  async function previsualiserCsv() {
    try {
      setChargement(true);
      setErreur(null);
      const res = await requeteApi<PrevisualisationImportTerritoire>("/api/proprietaire/territoire/import/previsualiser", {
        methode: "POST",
        jetonCsrf,
        corps: { csv: texteCsv },
      });
      setPrevisualisationCsv(res);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de prévisualisation CSV");
    } finally {
      setChargement(false);
    }
  }

  async function gererSelectionFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setChargement(true);
      setErreur(null);
      if (file.name.endsWith(".xlsx")) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const arrayBuffer = reader.result as ArrayBuffer;
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i] ?? 0);
            }
            const base64 = btoa(binary);
            const res = await requeteApi<PrevisualisationImportTerritoire>("/api/proprietaire/territoire/import/previsualiser", {
              methode: "POST",
              jetonCsrf,
              corps: { fichier_base64: base64, nom_fichier: file.name },
            });
            setPrevisualisationCsv(res);
          } catch (err) {
            setErreur(err instanceof Error ? err.message : "Erreur de traitement du fichier Excel.");
          } finally {
            setChargement(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const text = reader.result as string;
            setTexteCsv(text);
            const res = await requeteApi<PrevisualisationImportTerritoire>("/api/proprietaire/territoire/import/previsualiser", {
              methode: "POST",
              jetonCsrf,
              corps: { csv: text, nom_fichier: file.name },
            });
            setPrevisualisationCsv(res);
          } catch (err) {
            setErreur(err instanceof Error ? err.message : "Erreur de prévisualisation CSV.");
          } finally {
            setChargement(false);
          }
        };
        reader.readAsText(file);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Erreur lors de la lecture du fichier");
      setChargement(false);
    }
  }

  async function executerImport() {
    if (!previsualisationCsv || previsualisationCsv.lignes_valides.length === 0) return;
    try {
      setChargement(true);
      setErreur(null);
      await requeteApi("/api/proprietaire/territoire/import/executer", {
        methode: "POST",
        jetonCsrf,
        corps: { lignes: previsualisationCsv.lignes_valides },
      });
      setMessageSucces(`${previsualisationCsv.lignes_valides.length} unités importées avec succès.`);
      setPrevisualisationCsv(null);
      setTexteCsv("");
      void chargerTableauDeBord();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'import");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="section-administration-territoriale" style={{ marginTop: "1rem" }}>
      {/* Alertes de statut */}
      {erreur && (
        <div className="message-erreur bandeau-erreur" role="alert" style={{ marginBottom: "1rem" }}>
          <strong>Erreur : </strong> {erreur}
        </div>
      )}
      {messageSucces && (
        <div className="message-succes bandeau-succes" role="status" style={{ marginBottom: "1rem", background: "#ecfdf5", color: "#065f46", padding: "0.75rem", borderRadius: "6px", border: "1px solid #a7f3d0" }}>
          {messageSucces}
        </div>
      )}
      {chargement && (
        <div style={{ marginBottom: "1rem", color: "#0284c7", fontSize: "0.85rem", fontStyle: "italic" }}>
          Traitement territorial en cours...
        </div>
      )}

      {/* Barre de sous-onglets unifiée */}
      <SIGADTabsList ariaLabel="Sous-sections d'administration territoriale">
        <SIGADTab actif={vue === "dashboard"} onClick={() => setVue("dashboard")}>
          Vue d'ensemble & Métriques
        </SIGADTab>
        <SIGADTab actif={vue === "arborescence"} onClick={() => setVue("arborescence")}>
          Arborescence hiérarchique
        </SIGADTab>
        <SIGADTab actif={vue === "recherche"} onClick={() => setVue("recherche")}>
          Recherche & Actions
        </SIGADTab>
        <SIGADTab actif={vue === "fusions"} onClick={() => setVue("fusions")}>
          Fusions & Rapprochements
        </SIGADTab>
        <SIGADTab actif={vue === "doublons"} onClick={() => setVue("doublons")} badge={doublons.length > 0 ? doublons.length : undefined}>
          Détection de doublons
        </SIGADTab>
        <SIGADTab actif={vue === "import_export"} onClick={() => setVue("import_export")}>
          Import / Export
        </SIGADTab>
        <SIGADTab actif={vue === "audits"} onClick={() => setVue("audits")}>
          Journal d'audit
        </SIGADTab>
      </SIGADTabsList>

      {/* 1. TABLEAU DE BORD */}
      {vue === "dashboard" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            <SIGADStatCard
              titre="Provinces"
              valeur={stats.provinces}
              description="100% officielles (23)"
            />
            <SIGADStatCard
              titre="Départements"
              valeur={stats.departements}
              description={`${stats.departements_actifs ?? 112} activés (${stats.departements_certifies ?? 80} certifiés / ${stats.departements_non_certifies ?? 32} candidats)`}
            />
            <SIGADStatCard
              titre="Carrés & Subdivisions"
              valeur={stats.carres}
              description="Subdivisions fines de quartiers"
            />
            <SIGADStatCard
              titre="N'Djaména & Villes"
              valeur={`${stats.arrondissements} / ${stats.quartiers}`}
              description={`${stats.arrondissements} arr. / ${stats.quartiers} qrt. / ${stats.villes} ville(s)`}
            />
            <SIGADStatCard
              titre="Villages, Hameaux & Ferricks"
              valeur={stats.villages + stats.ferricks}
              description={`${stats.villages} village(s)/hameau(x), ${stats.ferricks} ferrick(s)/campement(s)`}
            />
            <SIGADStatCard
              titre="Sous-préfectures & Cantons"
              valeur={`${stats.sous_prefectures} / ${stats.cantons}`}
              description="Enrichissement dynamique progressif"
            />
          </div>

          <SIGADAlert titre="Régime de gouvernance territoriale dynamique SIGAD" variante="info">
            <strong>Socle administratif actif :</strong> Les 23 provinces et les 112 départements constituent le socle opérationnel actif sans obligation de certification juridique ni étape communale. N'Djaména conserve son parcours urbain direct (Province → Arrondissement municipal → Quartier → Carré). Les unités fines (villes, quartiers, carrés, sous-préfectures, cantons, villages, hameaux, ferricks, campements) s'enrichissent dynamiquement et restent soumises au contrôle du Propriétaire.
          </SIGADAlert>
        </div>
      )}

      {/* 2. ARBORESCENCE */}
      {vue === "arborescence" && (
        <div className="carte-section">
          <h2>Arborescence administrative nationale</h2>
          <p style={{ color: "#64748b" }}>Exploration hiérarchique des divisions administratives du Tchad.</p>
          <div style={{ maxHeight: "600px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem" }}>
            {arborescence.map((prov) => (
              <details key={prov.id} style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "#f8fafc", borderRadius: "6px" }}>
                <summary style={{ fontWeight: 600, cursor: "pointer", color: "#0f172a" }}>
                  📍 {prov.nom} ({prov.code}) — {prov.statut_particulier === 1 ? "Régime urbain spécial" : `${prov.departements?.length || 0} départements`}
                </summary>
                <div style={{ marginLeft: "1.5rem", marginTop: "0.5rem" }}>
                  {prov.statut_particulier === 1 ? (
                    <div>
                      <p style={{ fontSize: "0.85rem", color: "#64748b" }}>Ville de N'Djaména (10 Arrondissements communaux) :</p>
                      <ul style={{ listStyle: "circle", paddingLeft: "1.2rem", fontSize: "0.9rem" }}>
                        {prov.arrondissements?.map((arr: any) => (
                          <li key={arr.id}>
                            <strong>{arr.nom}</strong> ({arr.quartiers?.length || 0} quartiers répertoriés)
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div>
                      {prov.departements?.map((dep: any) => (
                        <details key={dep.id} style={{ marginTop: "0.4rem", marginLeft: "1rem" }}>
                          <summary style={{ fontSize: "0.9rem", cursor: "pointer" }}>
                            🏛️ <strong>{dep.nom}</strong> (Chef-lieu : {dep.chef_lieu || "Non spécifié"}) — <span style={{ fontSize: "0.8rem", color: dep.statut_validation === "VALIDE" ? "#16a34a" : "#d97706" }}>[{dep.statut_validation}]</span>
                          </summary>
                          <div style={{ marginLeft: "1.5rem", fontSize: "0.85rem", color: "#475569" }}>
                            <div>Sous-préfectures ({dep.sous_prefectures?.length || 0}) : {dep.sous_prefectures?.map((sp: any) => sp.nom).join(", ") || "Aucune"}</div>
                            <div>Aperçu localités : {dep.localites_apercu?.map((l: any) => l.nom).join(", ") || "Aucune"}</div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* 3. RECHERCHE & ACTIONS UNITAIRES */}
      {vue === "recherche" && (
        <div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 250px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Nom ou code de l'unité</label>
              <input
                type="text"
                placeholder="Ex: Mandoul, Batha, Farcha..."
                value={texteRecherche}
                onChange={(e) => setTexteRecherche(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ width: "180px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Type d'unité</label>
              <select
                value={filtreType}
                onChange={(e) => setFiltreType(e.target.value as TypeUniteTerritoriale | "")}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              >
                <option value="">Tous les types</option>
                <option value="PROVINCE">Province (23)</option>
                <option value="DEPARTEMENT">Département (112)</option>
                <option value="SOUS_PREFECTURE">Sous-préfecture</option>
                <option value="CANTON">Canton / Groupement</option>
                <option value="VILLE">Ville</option>
                <option value="ARRONDISSEMENT">Arrondissement</option>
                <option value="QUARTIER">Quartier</option>
                <option value="CARRE">Carré</option>
                <option value="BLOC">Bloc</option>
                <option value="SECTEUR">Secteur</option>
                <option value="VILLAGE">Village</option>
                <option value="HAMEAU">Hameau</option>
                <option value="FERRICK">Ferrick</option>
                <option value="CAMPEMENT">Campement</option>
                <option value="SITE_HUMANITAIRE">Site humanitaire</option>
              </select>
            </div>
            <div style={{ width: "160px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Statut</label>
              <select
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              >
                <option value="">Tous</option>
                <option value="VALIDE">Validé</option>
                <option value="A_VERIFIER">À vérifier</option>
                <option value="ARCHIVE">Archivé</option>
              </select>
            </div>
            <SIGADButton variante="primary" onClick={() => void lancerRecherche()}>
              🔍 Rechercher
            </SIGADButton>
            <SIGADButton
              variante="secondary"
              onClick={() => setModaleOuverte("creer")}
            >
              ➕ Créer une unité
            </SIGADButton>
          </div>

          <div className="tableau-defilement">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Nom officiel</th>
                  <th>Chef-lieu / Code</th>
                  <th>Rattachement administratif</th>
                  <th>Statut</th>
                  <th>Actions Propriétaire</th>
                </tr>
              </thead>
              <tbody>
                {resultatsRecherche.map((u) => (
                  <tr key={`${u.type}-${u.id}`}>
                    <td><SIGADBadge variante="default">{u.type}</SIGADBadge></td>
                    <td className="texte-gras">{u.nom}</td>
                    <td>{u.chef_lieu || u.code || "—"}</td>
                    <td style={{ fontSize: "0.85rem", color: "#475569" }}>{u.fil_ariane}</td>
                    <td>
                      <SIGADBadge variante={u.statut_validation === "VALIDE" ? "success" : "warning"}>
                        {u.statut_validation}
                      </SIGADBadge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                        <SIGADButton
                          variante="outline"
                          taille="sm"
                          onClick={() => {
                            setUniteSelectionnee(u);
                            setFormModification({
                              nom: u.nom,
                              code: u.code || "",
                              chef_lieu: u.chef_lieu || "",
                              source_officielle: "Décision administrative Propriétaire SIGAD 2026",
                              reference_juridique: "",
                              motif: "Mise à jour administrative de l'unité",
                            });
                            setModaleOuverte("modifier");
                          }}
                          title="Modifier ou renommer l'unité"
                        >
                          ✏️ Modifier
                        </SIGADButton>
                        {u.type !== "PROVINCE" && (
                          <SIGADButton
                            variante="outline"
                            taille="sm"
                            onClick={() => {
                              setUniteSelectionnee(u);
                              setFormRattachement({ ...formRattachement, nouveau_departement_id: "" });
                              setModaleOuverte("rattachement");
                            }}
                            title="Modifier le rattachement"
                          >
                            🔄 Rattacher
                          </SIGADButton>
                        )}
                        {u.statut_validation === "ARCHIVE" || u.statut_validation === "REJETE" ? (
                          <SIGADButton
                            variante="secondary"
                            taille="sm"
                            onClick={() => void reactiverUnite(u)}
                            title="Réactiver l'unité archivée"
                          >
                            ⚡ Réactiver
                          </SIGADButton>
                        ) : (
                          <SIGADButton
                            variante="outline"
                            taille="sm"
                            onClick={() => void archiverUnite(u)}
                            title="Archiver l'unité (conserve l'historique)"
                          >
                            📦 Archiver
                          </SIGADButton>
                        )}
                        {u.statut_validation !== "ARCHIVE" && (
                          u.statut_validation !== "VALIDE" ? (
                            <SIGADButton
                              variante="outline"
                              taille="sm"
                              onClick={() => void validerUnite(u, "VALIDE")}
                              title="Valider l'unité"
                            >
                              ✓ Valider
                            </SIGADButton>
                          ) : (
                            <SIGADButton
                              variante="outline"
                              taille="sm"
                              onClick={() => void validerUnite(u, "A_VERIFIER")}
                              title="Rétrograder à vérifier"
                            >
                              ↺ Rétrograder
                            </SIGADButton>
                          )
                        )}
                        <SIGADButton
                          variante="danger"
                          taille="sm"
                          onClick={() => void supprimerUnite(u)}
                          title="Supprimer (sécurisé, bloqué si dépendances)"
                        >
                          🗑️
                        </SIGADButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {resultatsRecherche.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                      Aucune unité territoriale ne correspond à ces critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#64748b" }}>
            Total trouvé : {totalRecherche} unités.
          </div>
        </div>
      )}

      {/* 4. PANNEAU LATÉRAL CREATION */}
      <SIGADFormPanel
        ouvert={modaleOuverte === "creer"}
        onFermer={() => setModaleOuverte(null)}
        onSoumettre={() => void soumettreCreation()}
        surtitre="Administration du référentiel national"
        titre="Création d'une nouvelle unité territoriale"
        description="Ajoutez une entité administrative ou géographique dans le référentiel national."
        taille="lg"
        libelleSoumettre="Créer l'unité"
        chargement={chargement}
        modifieNonEnregistre={formCreation.nom.trim().length > 0}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Type d'unité territoriale (14 échelons)</label>
            <select
              value={formCreation.type}
              onChange={(e) => setFormCreation({ ...formCreation, type: e.target.value as TypeUniteTerritoriale })}
              className="sigad-select"
            >
              <option value="PROVINCE">Province</option>
              <option value="DEPARTEMENT">Département</option>
              <option value="SOUS_PREFECTURE">Sous-préfecture</option>
              <option value="CANTON">Canton / Groupement</option>
              <option value="VILLE">Ville</option>
              <option value="ARRONDISSEMENT">Arrondissement</option>
              <option value="QUARTIER">Quartier</option>
              <option value="CARRE">Carré</option>
              <option value="BLOC">Bloc</option>
              <option value="SECTEUR">Secteur</option>
              <option value="VILLAGE">Village</option>
              <option value="HAMEAU">Hameau</option>
              <option value="FERRICK">Ferrick</option>
              <option value="CAMPEMENT">Campement</option>
              <option value="SITE_HUMANITAIRE">Site humanitaire</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Nom officiel *</label>
            <input
              type="text"
              value={formCreation.nom}
              onChange={(e) => setFormCreation({ ...formCreation, nom: e.target.value })}
              className="sigad-input"
              placeholder="Nom de l'unité"
            />
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Code d'identification (optionnel)</label>
            <input
              type="text"
              value={formCreation.code}
              onChange={(e) => setFormCreation({ ...formCreation, code: e.target.value })}
              className="sigad-input"
              placeholder="Ex: DEP-KLE, CARRE-04..."
            />
          </div>
          {!["CARRE", "BLOC", "SECTEUR"].includes(formCreation.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Province de rattachement</label>
              <input
                type="text"
                value={formCreation.province_id}
                onChange={(e) => setFormCreation({ ...formCreation, province_id: e.target.value })}
                className="sigad-input"
                placeholder="prov-batha, prov-kanem, prov-ndjamena..."
              />
            </div>
          )}
          {["SOUS_PREFECTURE", "CANTON", "VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT", "SITE_HUMANITAIRE"].includes(formCreation.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Département parent (ID)</label>
              <input
                type="text"
                value={formCreation.departement_id}
                onChange={(e) => setFormCreation({ ...formCreation, departement_id: e.target.value })}
                className="sigad-input"
                placeholder="Ex: dep-fitri, dep-barh-el-gazel-kleta..."
              />
            </div>
          )}
          {["CANTON", "VILLE", "VILLAGE", "HAMEAU", "FERRICK", "CAMPEMENT"].includes(formCreation.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Sous-préfecture parente (ID, optionnel)</label>
              <input
                type="text"
                value={formCreation.sous_prefecture_id}
                onChange={(e) => setFormCreation({ ...formCreation, sous_prefecture_id: e.target.value })}
                className="sigad-input"
                placeholder="Ex: sp-yao, sp-ati..."
              />
            </div>
          )}
          {formCreation.type === "QUARTIER" && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Arrondissement (N'Djaména) ou Localité / Ville parente (ID)</label>
              <input
                type="text"
                value={formCreation.arrondissement_id || formCreation.localite_id}
                onChange={(e) => {
                  if (formCreation.province_id === "prov-ndjamena") {
                    setFormCreation({ ...formCreation, arrondissement_id: e.target.value, localite_id: "" });
                  } else {
                    setFormCreation({ ...formCreation, localite_id: e.target.value, arrondissement_id: "" });
                  }
                }}
                className="sigad-input"
                placeholder="Ex: arr-1-ndjamena ou ville-abeche"
              />
            </div>
          )}
          {["CARRE", "BLOC", "SECTEUR"].includes(formCreation.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Quartier ou Localité parente (ID)</label>
              <input
                type="text"
                value={formCreation.quartier_id}
                onChange={(e) => setFormCreation({ ...formCreation, quartier_id: e.target.value })}
                className="sigad-input"
                placeholder="Ex: qua-farcha-1"
              />
            </div>
          )}
          {["DEPARTEMENT", "SOUS_PREFECTURE", "COMMUNE"].includes(formCreation.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Chef-lieu (optionnel)</label>
              <input
                type="text"
                value={formCreation.chef_lieu}
                onChange={(e) => setFormCreation({ ...formCreation, chef_lieu: e.target.value })}
                className="sigad-input"
                placeholder="Ville chef-lieu"
              />
            </div>
          )}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Source officielle / Document (Optionnel)</label>
            <input
              type="text"
              value={formCreation.source_officielle}
              onChange={(e) => setFormCreation({ ...formCreation, source_officielle: e.target.value })}
              className="sigad-input"
              placeholder="Ordonnance n°002/PR/2024, Arrêté préfectoral, Saisie propriétaire..."
            />
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Référence juridique / Décret / Arrêté (Optionnel)</label>
            <input
              type="text"
              value={formCreation.reference_juridique}
              onChange={(e) => setFormCreation({ ...formCreation, reference_juridique: e.target.value })}
              className="sigad-input"
              placeholder="Ex: Décret n°..., Arrêté n°... (laisser vide si non certifié)"
            />
          </div>
        </div>
      </SIGADFormPanel>

      {/* PANNEAU LATÉRAL MODIFICATION / RENOMMAGE */}
      <SIGADFormPanel
        ouvert={modaleOuverte === "modifier" && !!uniteSelectionnee}
        onFermer={() => setModaleOuverte(null)}
        onSoumettre={() => void soumettreModification()}
        surtitre="Modification d'unité territoriale"
        titre={`Modifier / Renommer : ${uniteSelectionnee?.nom ?? ""}`}
        description={`Type : ${uniteSelectionnee?.type ?? ""} | Identifiant : ${uniteSelectionnee?.id ?? ""}`}
        taille="lg"
        libelleSoumettre="Enregistrer les modifications"
        desactiveSoumettre={!formModification.nom || formModification.motif.length < 3}
        chargement={chargement}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Nom officiel / Toponyme *</label>
            <input
              type="text"
              value={formModification.nom}
              onChange={(e) => setFormModification({ ...formModification, nom: e.target.value })}
              className="sigad-input"
            />
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Code d'identification (optionnel)</label>
            <input
              type="text"
              value={formModification.code}
              onChange={(e) => setFormModification({ ...formModification, code: e.target.value })}
              className="sigad-input"
            />
          </div>
          {uniteSelectionnee && ["DEPARTEMENT", "SOUS_PREFECTURE", "COMMUNE"].includes(uniteSelectionnee.type) && (
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Chef-lieu (optionnel)</label>
              <input
                type="text"
                value={formModification.chef_lieu}
                onChange={(e) => setFormModification({ ...formModification, chef_lieu: e.target.value })}
                className="sigad-input"
              />
            </div>
          )}
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Source officielle justificative (Optionnel)</label>
            <input
              type="text"
              value={formModification.source_officielle}
              onChange={(e) => setFormModification({ ...formModification, source_officielle: e.target.value })}
              className="sigad-input"
              placeholder="Décision administrative, arrêté..."
            />
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Référence juridique (Optionnel)</label>
            <input
              type="text"
              value={formModification.reference_juridique}
              onChange={(e) => setFormModification({ ...formModification, reference_juridique: e.target.value })}
              className="sigad-input"
              placeholder="Décret, arrêté, ordonnance..."
            />
          </div>
          <div>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Motif de la modification (traçabilité d'audit) *</label>
            <input
              type="text"
              value={formModification.motif}
              onChange={(e) => setFormModification({ ...formModification, motif: e.target.value })}
              className="sigad-input"
              placeholder="Ex: Correction orthographique suite au décret n°..."
            />
          </div>
        </div>
      </SIGADFormPanel>

      {/* 5. PANNEAU LATÉRAL RATTACHEMENT */}
      <SIGADFormPanel
        ouvert={modaleOuverte === "rattachement" && !!uniteSelectionnee}
        onFermer={() => setModaleOuverte(null)}
        onSoumettre={() => void appliquerRattachement()}
        surtitre="Réalignement administratif"
        titre={`Modification du rattachement : ${uniteSelectionnee?.nom ?? ""}`}
        description={`Rattachement actuel : ${uniteSelectionnee?.fil_ariane ?? ""}`}
        taille="lg"
        libelleSoumettre="Confirmer le changement de rattachement"
        libelleAnnuler="Fermer"
        desactiveSoumettre={!simulationRattachement?.autorise}
        chargement={chargement}
      >
        <div>
          <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Identifiant du nouveau département parent</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", marginBottom: "0.75rem" }}>
            <input
              type="text"
              placeholder="Ex: dep-batha-ouest"
              value={formRattachement.nouveau_departement_id}
              onChange={(e) => setFormRattachement({ ...formRattachement, nouveau_departement_id: e.target.value })}
              className="sigad-input"
            />
            <SIGADButton
              variante="secondary"
              type="button"
              onClick={() => uniteSelectionnee && void executerSimulationRattachement(uniteSelectionnee, formRattachement.nouveau_departement_id)}
            >
              Simuler
            </SIGADButton>
          </div>

          {simulationRattachement && (
            <SIGADAlert
              variante={simulationRattachement.autorise ? "success" : "danger"}
              titre={simulationRattachement.autorise ? "Rattachement autorisé (même province)" : "Avertissement de conformité"}
            >
              <div>{simulationRattachement.message_avertissement || "Conforme."}</div>
              <div style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                Ménages impactés : <strong>{simulationRattachement.menages_impactes}</strong> | Distributions historiques préservées : <strong>{simulationRattachement.distributions_historiques_preservees}</strong>
              </div>
            </SIGADAlert>
          )}
        </div>
      </SIGADFormPanel>

      {/* 6. FUSIONS */}
      {vue === "fusions" && (
        <div className="carte-section">
          <h2>Fusion contrôlée d'unités territoriales</h2>
          <p style={{ color: "#64748b" }}>
            Permet d'unifier deux unités redondantes ou homonymes au sein de la même province. Les ménages sont réaffectés vers l'unité principale et une correspondance d'audit est conservée pour garantir l'intégrité des distributions historiques.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unité principale cible (conservée)</label>
              <input
                type="text"
                placeholder="ID de l'unité principale"
                value={formFusion.unite_principale_id}
                onChange={(e) => setFormFusion({ ...formFusion, unite_principale_id: e.target.value })}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Unité doublon (absorbée & archivée)</label>
              <input
                type="text"
                placeholder="ID de l'unité doublon"
                value={formFusion.unite_doublon_id}
                onChange={(e) => setFormFusion({ ...formFusion, unite_doublon_id: e.target.value })}
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <SIGADButton variante="secondary" onClick={() => void simulerFusion()}>
              🔍 Simuler la fusion et détecter les conflits
            </SIGADButton>
          </div>

          {simulationFusion && (
            <div style={{ marginTop: "1.5rem", padding: "1.25rem", background: simulationFusion.fusion_autorisee ? "#f8fafc" : "#fef2f2", borderRadius: "8px", border: `1px solid ${simulationFusion.fusion_autorisee ? "#cbd5e1" : "#fca5a5"}` }}>
              <h3 style={{ margin: "0 0 1rem 0", color: simulationFusion.fusion_autorisee ? "#0f172a" : "#991b1b" }}>
                Comparatif contradictoire : {simulationFusion.nom_source} ➔ {simulationFusion.nom_cible}
              </h3>

              {/* Panneau comparatif côte à côte */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div style={{ padding: "0.75rem", background: "#fff", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>
                    Unité doublon (absorbée & archivée)
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.25rem" }}>{simulationFusion.nom_source}</div>
                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Code : <code>{simulationFusion.code_source || "Aucun"}</code></div>
                  <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: "0.25rem" }}>
                    <strong>Rattachement :</strong> {simulationFusion.rattachement_source || "Non renseigné"}
                  </div>
                </div>

                <div style={{ padding: "0.75rem", background: "#fff", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>
                    Unité principale (conservée au référentiel)
                  </div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.25rem" }}>{simulationFusion.nom_cible}</div>
                  <div style={{ fontSize: "0.85rem", color: "#64748b" }}>Code : <code>{simulationFusion.code_cible || "Aucun"}</code></div>
                  <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: "0.25rem" }}>
                    <strong>Rattachement :</strong> {simulationFusion.rattachement_cible || "Non renseigné"}
                  </div>
                </div>
              </div>

              {/* Impact sur les données réelles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ padding: "0.75rem", background: "#eff6ff", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#1e40af" }}>Ménages réaffectés</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e3a8a" }}>{simulationFusion.menages_concernes}</div>
                </div>
                <div style={{ padding: "0.75rem", background: "#eff6ff", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#1e40af" }}>Bénéficiaires touchés</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e3a8a" }}>{simulationFusion.beneficiaires_concernes}</div>
                </div>
                <div style={{ padding: "0.75rem", background: "#f0fdf4", borderRadius: "6px", textAlign: "center" }}>
                  <div style={{ fontSize: "0.75rem", color: "#166534" }}>Distributions préservées (gelées)</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#14532d" }}>{simulationFusion.distributions_historiques_preservees}</div>
                </div>
              </div>

              {/* Avertissements et détection de doublons de ménages */}
              {simulationFusion.avertissements && simulationFusion.avertissements.length > 0 && (
                <div style={{ padding: "0.75rem", background: "#fffbeb", borderRadius: "6px", border: "1px solid #fde68a", marginBottom: "1rem" }}>
                  <div style={{ fontWeight: 600, color: "#92400e", marginBottom: "0.25rem" }}>⚠️ Avertissements toponymiques ou administratifs :</div>
                  <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "#78350f", fontSize: "0.85rem" }}>
                    {simulationFusion.avertissements.map((av, i) => (
                      <li key={i}>{av}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(simulationFusion.menages_doublons_potentiels) && simulationFusion.menages_doublons_potentiels.length > 0 && (
                <div style={{ padding: "0.75rem", background: "#fef3c7", borderRadius: "6px", border: "1px solid #fcd34d", marginBottom: "1rem" }}>
                  <div style={{ fontWeight: 600, color: "#92400e" }}>
                    ⚠️ {simulationFusion.menages_doublons_potentiels.length} ménage(s) portant des noms similaires détectés dans les deux unités :
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#78350f", marginTop: "0.25rem" }}>
                    {simulationFusion.menages_doublons_potentiels.slice(0, 5).join(", ")}
                    {simulationFusion.menages_doublons_potentiels.length > 5 ? "..." : ""}
                  </div>
                </div>
              )}

              {/* Décision et validation */}
              {simulationFusion.fusion_autorisee ? (
                <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem", color: "#0f172a" }}>
                    <input
                      type="checkbox"
                      checked={confirmationFusionChecked}
                      onChange={(e) => setConfirmationFusionChecked(e.target.checked)}
                      style={{ marginTop: "0.2rem" }}
                    />
                    <span>
                      Je confirme après examen contradictoire que les fiches « <strong>{simulationFusion.nom_source}</strong> » et « <strong>{simulationFusion.nom_cible}</strong> » correspondent à la même unité territoriale physique sur le terrain, et que le transfert des ménages est légitime.
                    </span>
                  </label>
                  <div style={{ marginTop: "1rem" }}>
                    <SIGADButton
                      variante="danger"
                      disabled={!confirmationFusionChecked}
                      onClick={() => void executerFusion()}
                    >
                      ⚡ Confirmer et exécuter la fusion irréversible
                    </SIGADButton>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "0.75rem", background: "#fee2e2", borderRadius: "6px", color: "#991b1b", fontWeight: 600 }}>
                  ⛔ Fusion bloquée : {simulationFusion.message_blocage}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 7. DOUBLONS */}
      {vue === "doublons" && (
        <div className="carte-section">
          <h2>Détection proactive des doublons territoriaux</h2>
          <p style={{ color: "#64748b" }}>Unités partageant des noms identiques ou quasi-identiques dans la même province.</p>
          <div className="tableau-defilement">
            <table>
              <thead>
                <tr>
                  <th>Province</th>
                  <th>Unité A (ID / Nom)</th>
                  <th>Unité B (ID / Nom)</th>
                  <th>Action recommandée</th>
                </tr>
              </thead>
              <tbody>
                {doublons.map((d, idx) => (
                  <tr key={idx}>
                    <td>{d.province_nom}</td>
                    <td><strong>{d.nom1}</strong> ({d.id1})</td>
                    <td><strong>{d.nom2}</strong> ({d.id2})</td>
                    <td>
                      <SIGADButton
                        variante="outline"
                        taille="sm"
                        onClick={() => {
                          setFormFusion({
                            ...formFusion,
                            unite_principale_id: d.id1,
                            unite_doublon_id: d.id2,
                          });
                          setVue("fusions");
                        }}
                      >
                        Fusionner
                      </SIGADButton>
                    </td>
                  </tr>
                ))}
                {doublons.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "#16a34a" }}>
                      ✓ Aucun doublon strict non résolu détecté.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. IMPORT / EXPORT CSV & XLSX */}
      {vue === "import_export" && (
        <div className="carte-section">
          <h2>Importation et exportation du référentiel territorial</h2>

          <div style={{ marginBottom: "2rem" }}>
            <h3>Exportation complète certifiée</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Téléchargez l'intégralité du découpage administratif au format CSV ou classeur Excel (XLSX) avec fil d'Ariane, statut de validation et références juridiques.
            </p>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <a
                href="/api/proprietaire/territoire/export"
                download="referentiel_territorial_sigad.csv"
                className="bouton-secondaire"
                style={{ display: "inline-block", textDecoration: "none" }}
              >
                📥 Exporter le référentiel national (CSV UTF-8)
              </a>
              <a
                href="/api/proprietaire/territoire/export-xlsx"
                download="referentiel_territorial_sigad.xlsx"
                className="bouton-secondaire"
                style={{ display: "inline-block", textDecoration: "none", background: "#f0fdf4", color: "#166534", border: "1px solid #86efac" }}
              >
                📊 Exporter le référentiel national (Excel .xlsx)
              </a>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1.5rem" }}>
            <h3>Importation par lot (contrôlée avec prévisualisation)</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
              Vous pouvez charger un fichier CSV ou Excel (.xlsx), ou coller directement du texte CSV ci-dessous.<br />
              Format des colonnes : <code>type,nom,province_id,departement_id,chef_lieu,source</code>
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Fichier d'import (CSV ou Excel .xlsx)
              </label>
              <input
                type="file"
                accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
                onChange={(e) => void gererSelectionFichier(e)}
                style={{ padding: "0.4rem", border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff" }}
              />
            </div>

            <textarea
              rows={6}
              value={texteCsv}
              onChange={(e) => setTexteCsv(e.target.value)}
              placeholder="type,nom,province_id,departement_id,chef_lieu,source&#10;VILLAGE,Kondol,prov-chari-baguirmi,dep-chari,Kondol,Recensement 2026"
              style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace", fontSize: "0.85rem" }}
            />
            <div style={{ marginTop: "0.75rem" }}>
              <SIGADButton variante="secondary" onClick={() => void previsualiserCsv()}>
                📋 Prévisualiser le texte CSV
              </SIGADButton>
            </div>

            {previsualisationCsv && (
              <div style={{ marginTop: "1rem", padding: "1rem", background: "#f8fafc", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                <h4>Rapport de prévisualisation</h4>
                <p>
                  Lignes valides : <strong>{previsualisationCsv.lignes_valides.length}</strong> | Inconnues/Erreurs : {previsualisationCsv.erreurs.length}
                </p>
                {previsualisationCsv.erreurs.length > 0 && (
                  <div style={{ marginTop: "0.5rem", marginBottom: "1rem", padding: "0.5rem", background: "#fef2f2", borderRadius: "4px", border: "1px solid #fecaca", color: "#991b1b", fontSize: "0.85rem" }}>
                    <strong>{previsualisationCsv.erreurs.length} anomalie(s) détectée(s) :</strong>
                    <ul style={{ margin: "0.25rem 0 0 0", paddingLeft: "1.2rem" }}>
                      {previsualisationCsv.erreurs.slice(0, 5).map((err, i) => (
                        <li key={i}>{typeof err === "string" ? err : JSON.stringify(err)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {previsualisationCsv.lignes_valides.length > 0 && (
                  <SIGADButton variante="primary" onClick={() => void executerImport()}>
                    🚀 Confirmer l'importation de {previsualisationCsv.lignes_valides.length} unités
                  </SIGADButton>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. AUDITS */}
      {vue === "audits" && (
        <div className="carte-section">
          <h2>Journal d'audit des mutations territoriales</h2>
          <p style={{ color: "#64748b" }}>Traçabilité complète des créations, modifications, fusions et validations territoriales.</p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "flex-end" }}>
            <div style={{ width: "200px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Type d'entité</label>
              <select
                value={filtreAuditType}
                onChange={(e) => setFiltreAuditType(e.target.value)}
                style={{ width: "100%", padding: "0.4rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              >
                <option value="">Tous les échelons</option>
                <option value="PROVINCE">Province</option>
                <option value="DEPARTEMENT">Département</option>
                <option value="SOUS_PREFECTURE">Sous-préfecture</option>
                <option value="COMMUNE">Commune</option>
                <option value="CANTON">Canton</option>
                <option value="VILLE">Ville</option>
                <option value="ARRONDISSEMENT">Arrondissement</option>
                <option value="QUARTIER">Quartier</option>
                <option value="CARRE">Carré</option>
                <option value="BLOC">Bloc</option>
                <option value="SECTEUR">Secteur</option>
                <option value="VILLAGE">Village</option>
                <option value="FERRICK">Ferrick</option>
                <option value="SITE_HUMANITAIRE">Site humanitaire</option>
              </select>
            </div>
            <div style={{ width: "200px" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600 }}>Action</label>
              <select
                value={filtreAuditAction}
                onChange={(e) => setFiltreAuditAction(e.target.value)}
                style={{ width: "100%", padding: "0.4rem", borderRadius: "4px", border: "1px solid #cbd5e1" }}
              >
                <option value="">Toutes les actions</option>
                <option value="CREATION">Création</option>
                <option value="MODIFICATION">Modification</option>
                <option value="RATTACHEMENT">Rattachement</option>
                <option value="FUSION">Fusion</option>
                <option value="ARCHIVAGE">Archivage</option>
                <option value="REACTIVATION">Réactivation</option>
                <option value="SUPPRESSION">Suppression</option>
                <option value="VALIDATION">Validation</option>
              </select>
            </div>
            <SIGADButton variante="primary" onClick={() => void chargerAudits()}>
              Filtrer l'audit
            </SIGADButton>
          </div>
          <div className="tableau-defilement">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>Auteur</th>
                  <th>Motif / Justificatif</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.cree_le).toLocaleString("fr-FR")}</td>
                    <td><SIGADBadge variante="default">{a.action}</SIGADBadge></td>
                    <td>{a.entite_type} ({a.entite_id})</td>
                    <td>{a.utilisateur_identifiant || a.utilisateur_id}</td>
                    <td style={{ fontSize: "0.85rem" }}>{a.motif || a.justificatif || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
