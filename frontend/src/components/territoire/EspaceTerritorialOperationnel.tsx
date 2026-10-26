/**
 * SIGAD — Espace Territorial Opérationnel
 * Permet à l'Administration centrale (portée nationale : 23 provinces, 112 départements),
 * aux Délégués provinciaux et aux agents habilités (portée provinciale) de :
 * - Consulter les provinces, départements, villes, quartiers, localités et sites humanitaires
 * - Créer directement une unité manquante (+ Ajouter via panneau latéral SIGADFormPanel)
 * - Proposer une correction territoriale via panneau latéral dédié
 */
import { useCallback, useEffect, useState } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import type {
  DepartementTerritorial,
  ElementSelectionLocalisation,
  LocaliteTerritoriale,
  ProvinceTerritoriale,
  SiteHumanitaireTerritorial,
} from "../../../../shared/types/territoire";
import { requeteApi } from "../../services/api";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADCard,
  SIGADCardBody,
  SIGADCardHeader,
  SIGADCardSubtitle,
  SIGADCardTitle,
  SIGADEmptyState,
  SIGADStatCard,
  SIGADTab,
  SIGADTable,
  SIGADTabsList,
} from "../ui";
import { SelecteurLocalisationDynamique } from "./SelecteurLocalisationDynamique";

export type VueTerritoireOperationnel =
  | "dashboard"
  | "arborescence"
  | "recherche"
  | "sites"
  | "corrections";

interface PageApi<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface EspaceTerritorialOperationnelProps {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
  vueInitiale?: VueTerritoireOperationnel;
}

export function EspaceTerritorialOperationnel({
  utilisateur,
  jetonCsrf,
  vueInitiale = "dashboard",
}: EspaceTerritorialOperationnelProps) {
  const [vue, setVue] = useState<VueTerritoireOperationnel>(vueInitiale);
  const [provinces, setProvinces] = useState<ProvinceTerritoriale[]>([]);
  const [provinceFiltre, setProvinceFiltre] = useState<string>(
    utilisateur.province_id ?? "prov-batha",
  );
  const [departements, setDepartements] = useState<DepartementTerritorial[]>([]);
  const [localites, setLocalites] = useState<LocaliteTerritoriale[]>([]);
  const [sites, setSites] = useState<SiteHumanitaireTerritorial[]>([]);
  const [selectionActive, setSelectionActive] = useState<ElementSelectionLocalisation | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (vueInitiale) setVue(vueInitiale);
  }, [vueInitiale]);

  const chargerReferentiel = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const repProvinces = await requeteApi<PageApi<ProvinceTerritoriale>>(
        "/api/territoire/provinces?limite=50",
      );
      setProvinces(repProvinces.elements);
      const provCible =
        utilisateur.province_id ??
        (repProvinces.elements.some((p) => p.id === provinceFiltre)
          ? provinceFiltre
          : repProvinces.elements[0]?.id ?? "prov-batha");

      if (provCible) {
        const [repDeps, repLocs, repSites] = await Promise.all([
          requeteApi<PageApi<DepartementTerritorial>>(
            `/api/territoire/departements?province_id=${encodeURIComponent(provCible)}&limite=100`,
          ),
          requeteApi<PageApi<LocaliteTerritoriale>>(
            `/api/territoire/localites?province_id=${encodeURIComponent(provCible)}&limite=50`,
          ),
          requeteApi<PageApi<SiteHumanitaireTerritorial>>(
            `/api/territoire/sites-humanitaires?province_id=${encodeURIComponent(provCible)}&limite=50`,
          ),
        ]);
        setDepartements(repDeps.elements);
        setLocalites(repLocs.elements);
        setSites(repSites.elements);
      }
    } catch (cause) {
      setErreur(
        cause instanceof Error
          ? cause.message
          : "Impossible de charger les données territoriales.",
      );
    } finally {
      setChargement(false);
    }
  }, [provinceFiltre, utilisateur.province_id]);

  useEffect(() => {
    void chargerReferentiel();
  }, [chargerReferentiel]);

  const estNational =
    utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL";

  function changerVue(nouvelleVue: VueTerritoireOperationnel) {
    setVue(nouvelleVue);
    const url = `/territoire?vue=${encodeURIComponent(nouvelleVue)}`;
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="contenu-tableau" aria-label="Référentiel territorial">
      <div className="sigad-compact-meta sigad-territoire-meta">
        <SIGADBadge variant="info">
          {estNational ? "23 provinces · 112 départements" : `Périmètre ${utilisateur.province_id}`}
        </SIGADBadge>
        <p className="sigad-territoire-meta__description">
          {estNational
            ? "Portée nationale. Création directe des unités manquantes et propositions de correction territoriale."
            : `Portée provinciale (${utilisateur.province_id}). Création locale et propositions de correction.`}
        </p>
      </div>

      {erreur && <SIGADAlert variante="danger" style={{ marginBottom: "1rem" }}>{erreur}</SIGADAlert>}

      <SIGADTabsList ariaLabel="Sections du référentiel territorial">
        <SIGADTab actif={vue === "dashboard"} onClick={() => changerVue("dashboard")}>
          Référentiel territorial
        </SIGADTab>
        <SIGADTab
          actif={vue === "arborescence"}
          badge={departements.length}
          onClick={() => changerVue("arborescence")}
        >
          Provinces et départements
        </SIGADTab>
        <SIGADTab
          actif={vue === "recherche"}
          badge={localites.length}
          onClick={() => changerVue("recherche")}
        >
          Villes, quartiers et localités
        </SIGADTab>
        <SIGADTab
          actif={vue === "sites"}
          badge={sites.length}
          onClick={() => changerVue("sites")}
        >
          Sites humanitaires
        </SIGADTab>
        <SIGADTab actif={vue === "corrections"} onClick={() => changerVue("corrections")}>
          Corrections territoriales
        </SIGADTab>
      </SIGADTabsList>

      {vue === "dashboard" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            <SIGADStatCard
              titre="Provinces actives"
              valeur={estNational ? 23 : provinces.length}
              description={estNational ? "Couverture nationale complète" : "Province rattachée"}
            />
            <SIGADStatCard
              titre="Départements actifs"
              valeur={estNational ? 112 : departements.length}
              description="Socle administratif opérationnel"
            />
            <SIGADStatCard
              titre="Localités (province sélectionnée)"
              valeur={localites.length}
              description="Villes, villages, hameaux, ferricks"
            />
            <SIGADStatCard
              titre="Sites humanitaires"
              valeur={sites.length}
              description="Camps et sites enregistrés"
            />
          </div>

          <SelecteurLocalisationDynamique
            utilisateur={utilisateur}
            jetonCsrf={jetonCsrf}
            onSelectionChange={(sel) => {
              setSelectionActive(sel);
              if (sel?.province_id && sel.province_id !== provinceFiltre) {
                setProvinceFiltre(sel.province_id);
              }
            }}
          />
        </div>
      )}

      {vue === "arborescence" && (
        <SIGADCard>
          <SIGADCardHeader>
            <div>
              <SIGADCardTitle>Provinces et départements actifs</SIGADCardTitle>
              <SIGADCardSubtitle>
                Consultez les départements par province ou utilisez le sélecteur ci-dessous pour ajouter un département (Administration centrale / Propriétaire).
              </SIGADCardSubtitle>
            </div>
            {estNational && (
              <div style={{ minWidth: "240px" }}>
                <select
                  aria-label="Filtrer par province"
                  className="sigad-select"
                  value={provinceFiltre}
                  onChange={(e) => setProvinceFiltre(e.target.value)}
                >
                  {provinces.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.nom} ({prov.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </SIGADCardHeader>
          <SIGADCardBody>
            <SIGADTable>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Département</th>
                  <th>Chef-lieu</th>
                  <th>Province</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {departements.map((dep) => (
                  <tr key={dep.id}>
                    <td className="sigad-tabular-nums">{dep.code}</td>
                    <td className="texte-gras">{dep.nom}</td>
                    <td>{dep.chef_lieu ?? "—"}</td>
                    <td>
                      {provinces.find((p) => p.id === dep.province_id)?.nom ?? dep.province_id}
                    </td>
                    <td>
                      <SIGADBadge variant="success">
                        ACTIF
                      </SIGADBadge>
                    </td>
                  </tr>
                ))}
                {!chargement && departements.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <SIGADEmptyState
                        titre="Statut particulier (N'Djaména)"
                        description="La ville de N'Djaména est structurée directement en 10 arrondissements municipaux et quartiers."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}

      {vue === "recherche" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <SelecteurLocalisationDynamique
            utilisateur={utilisateur}
            jetonCsrf={jetonCsrf}
            onSelectionChange={(sel) => {
              setSelectionActive(sel);
              if (sel?.province_id && sel.province_id !== provinceFiltre) {
                setProvinceFiltre(sel.province_id);
              }
            }}
          />

          <SIGADCard>
            <SIGADCardHeader>
              <div>
                <SIGADCardTitle>Villes et localités enregistrées dans la province</SIGADCardTitle>
                <SIGADCardSubtitle>
                  Utilisez les boutons « + Ajouter » du sélecteur ci-dessus pour créer directement une ville, un quartier, un village, un hameau ou un ferrick manquant.
                </SIGADCardSubtitle>
              </div>
              <SIGADBadge variant="neutral">{localites.length} unités</SIGADBadge>
            </SIGADCardHeader>
            <SIGADCardBody>
              <SIGADTable>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Nature</th>
                    <th>Découpage urbain</th>
                    <th>Identifiant</th>
                  </tr>
                </thead>
                <tbody>
                  {localites.map((loc) => (
                    <tr key={loc.id}>
                      <td className="texte-gras">{loc.nom}</td>
                      <td>
                        <SIGADBadge variant={loc.type_localite === "VILLE" ? "info" : "neutral"}>
                          {loc.type_localite}
                        </SIGADBadge>
                      </td>
                      <td>{loc.mode_decoupage_urbain}</td>
                      <td className="sigad-tabular-nums">{loc.id}</td>
                    </tr>
                  ))}
                  {!chargement && localites.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <SIGADEmptyState
                          titre="Aucune localité enregistrée dans cette province"
                          description="Utilisez le bouton « + Ajouter » dans le sélecteur de localisation ci-dessus pour créer une ville ou une localité rurale."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </SIGADTable>
            </SIGADCardBody>
          </SIGADCard>
        </div>
      )}

      {vue === "sites" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <SelecteurLocalisationDynamique
            utilisateur={utilisateur}
            jetonCsrf={jetonCsrf}
            onSelectionChange={(sel) => {
              setSelectionActive(sel);
              if (sel?.province_id && sel.province_id !== provinceFiltre) {
                setProvinceFiltre(sel.province_id);
              }
            }}
          />

          <SIGADCard>
            <SIGADCardHeader>
              <div>
                <SIGADCardTitle>Sites humanitaires et camps d'accueil</SIGADCardTitle>
                <SIGADCardSubtitle>
                  Sélectionnez le milieu Rural puis « Site humanitaire » dans le sélecteur ci-dessus pour ajouter un nouveau site via le panneau latéral.
                </SIGADCardSubtitle>
              </div>
              <SIGADBadge variant="info">{sites.length} sites</SIGADBadge>
            </SIGADCardHeader>
            <SIGADCardBody>
              <SIGADTable>
                <thead>
                  <tr>
                    <th>Nom du site</th>
                    <th>Catégorie</th>
                    <th>Code</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id}>
                      <td className="texte-gras">{site.nom}</td>
                      <td>
                        <SIGADBadge variant="warning">{site.categorie_site}</SIGADBadge>
                      </td>
                      <td>{site.code_site ?? "—"}</td>
                      <td>
                        <SIGADBadge variant="success">
                          ACTIF
                        </SIGADBadge>
                      </td>
                    </tr>
                  ))}
                  {!chargement && sites.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <SIGADEmptyState
                          titre="Aucun site humanitaire enregistré dans cette province"
                          description="Pour créer un site humanitaire manquant, choisissez le milieu Rural puis « Site humanitaire » et cliquez sur « + Ajouter »."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </SIGADTable>
            </SIGADCardBody>
          </SIGADCard>
        </div>
      )}

      {vue === "corrections" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          <SIGADAlert
            variante="info"
            titre="Procédure de proposition de modification territoriale"
          >
            Sélectionnez ci-dessous l'unité territoriale existante à corriger, puis cliquez sur le bouton{" "}
            <strong>« Proposer une modification territoriale »</strong> en haut à droite du sélecteur pour ouvrir le panneau latéral de correction.
          </SIGADAlert>

          <SelecteurLocalisationDynamique
            utilisateur={utilisateur}
            jetonCsrf={jetonCsrf}
            onSelectionChange={setSelectionActive}
          />

          {selectionActive && (
            <SIGADCard>
              <SIGADCardHeader>
                <div>
                  <SIGADCardTitle>Sélection territoriale active</SIGADCardTitle>
                  <SIGADCardSubtitle>
                    Province : {selectionActive.province_id}
                    {selectionActive.departement_id
                      ? ` · Département : ${selectionActive.departement_id}`
                      : ""}
                    {selectionActive.localite_id
                      ? ` · Localité : ${selectionActive.localite_id}`
                      : ""}
                  </SIGADCardSubtitle>
                </div>
                <SIGADBadge variant="success">Prêt pour opération</SIGADBadge>
              </SIGADCardHeader>
            </SIGADCard>
          )}
        </div>
      )}
    </div>
  );
}
