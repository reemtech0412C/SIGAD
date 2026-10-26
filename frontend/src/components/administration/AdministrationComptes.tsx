import { useCallback, useEffect, useState, type FormEvent } from "react";
import { requeteApi } from "../../services/api";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADButton,
  SIGADCard,
  SIGADCardBody,
  SIGADCardHeader,
  SIGADCardSubtitle,
  SIGADCardTitle,
  SIGADEmptyState,
  SIGADFormField,
  SIGADFormPanel,
  SIGADInput,
  SIGADSelect,
  SIGADTab,
  SIGADTable,
  SIGADTabsList,
  SIGADTextarea,
} from "../ui";

interface Province {
  id: string;
  nom: string;
}

interface DemandeDelegue {
  id: string;
  nom_complet: string;
  province_id: string;
  province: string;
  courriel: string;
  telephone: string;
  statut: string;
  courriel_verifie_le: string | null;
  conflit_delegation: number;
  delegue_actif_id: string | null;
  cree_le: string;
}

interface Delegue {
  id: string;
  identifiant: string;
  nom_complet: string;
  courriel: string | null;
  courriel_verifie_le: string | null;
  telephone: string | null;
  province: string;
  statut: string;
  derniere_connexion: string | null;
}

interface Consultation {
  id: string;
  utilisateur_id: string;
  identifiant: string;
  nom_complet: string;
  courriel: string | null;
  courriel_verifie_le: string | null;
  institution: string;
  fonction: string;
  perimetre: "NATIONAL" | "PROVINCIAL" | "MULTI_PROVINCIAL";
  statut: string;
  provinces: Array<{ province_id: string; province: string }>;
  derniere_connexion: string | null;
}

interface EditionPerimetre {
  perimetre: Consultation["perimetre"];
  provinces: string[];
}

interface Decision {
  id: string;
  action: string;
  motif: string;
  acteur: string;
  cree_le: string;
}

interface Page<T> {
  elements: T[];
  total: number;
  limite: number;
  decalage: number;
}

interface Props {
  jetonCsrf: string;
}

const MOTIF_PAR_DEFAUT = "Décision administrative motivée après examen du dossier.";

function dateFr(valeur: string | null): string {
  if (!valeur) return "Jamais";
  const date = new Date(valeur.replace(" ", "T") + (valeur.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? valeur : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Africa/Ndjamena" }).format(date);
}

export function AdministrationComptes({ jetonCsrf }: Props) {
  const lireOngletDepuisUrl = useCallback((): "demandes" | "delegues" | "consultation" | "decisions" => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("onglet");
      if (param === "demandes" || param === "delegues" || param === "consultation" || param === "decisions") {
        return param;
      }
    }
    return "demandes";
  }, []);

  const [onglet, setOnglet] = useState<"demandes" | "delegues" | "consultation" | "decisions">(lireOngletDepuisUrl);

  useEffect(() => {
    const sync = () => setOnglet(lireOngletDepuisUrl());
    window.addEventListener("popstate", sync);
    const interval = window.setInterval(sync, 250);
    return () => {
      window.removeEventListener("popstate", sync);
      window.clearInterval(interval);
    };
  }, [lireOngletDepuisUrl]);
  const [demandes, setDemandes] = useState<Page<DemandeDelegue> | null>(null);
  const [delegues, setDelegues] = useState<Page<Delegue> | null>(null);
  const [consultations, setConsultations] = useState<Page<Consultation> | null>(null);
  const [editionsPerimetre, setEditionsPerimetre] = useState<Record<string, EditionPerimetre>>({});
  const [decisions, setDecisions] = useState<Page<Decision> | null>(null);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [verificationCourrielActive, setVerificationCourrielActive] = useState(false);
  const [verificationIdentiteAdministrative, setVerificationIdentiteAdministrative] = useState(false);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [motif, setMotif] = useState(MOTIF_PAR_DEFAUT);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [institution, setInstitution] = useState("");
  const [fonction, setFonction] = useState("");
  const [courriel, setCourriel] = useState("");
  const [telephone, setTelephone] = useState("");
  const [perimetre, setPerimetre] = useState<"NATIONAL" | "PROVINCIAL" | "MULTI_PROVINCIAL">("NATIONAL");
  const [provincesChoisies, setProvincesChoisies] = useState<string[]>([]);
  const [codeActivationRemise, setCodeActivationRemise] = useState<string | null>(null);

  async function charger(): Promise<void> {
    setChargement(true); setErreur(null);
    try {
      const [listeDemandes, listeDelegues, listeConsultations, listeDecisions] = await Promise.all([
        requeteApi<Page<DemandeDelegue>>("/api/administration/comptes/delegues?limite=50&decalage=0"),
        requeteApi<Page<Delegue>>("/api/administration/comptes/delegues/comptes?limite=50&decalage=0"),
        requeteApi<Page<Consultation>>("/api/administration/comptes/consultation?limite=50&decalage=0"),
        requeteApi<Page<Decision>>("/api/administration/comptes/decisions?limite=50&decalage=0"),
      ]);
      setDemandes(listeDemandes); setDelegues(listeDelegues); setConsultations(listeConsultations); setDecisions(listeDecisions);
      setEditionsPerimetre(Object.fromEntries(listeConsultations.elements.map((compte) => [compte.id, {
        perimetre: compte.perimetre,
        provinces: compte.provinces.map((province) => province.province_id),
      }])));
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "Les comptes n’ont pas pu être chargés."); }
    finally { setChargement(false); }
  }

  useEffect(() => {
    let actif = true;
    void Promise.all([
      requeteApi<{ elements: Province[]; verification_courriel_active: boolean }>("/api/inscriptions/delegues/provinces"),
      charger(),
    ]).then(([reponse]) => {
      if (actif) {
        setProvinces(reponse.elements);
        setVerificationCourrielActive(reponse.verification_courriel_active);
      }
    })
      .catch(() => { if (actif) setErreur("Les référentiels de comptes n’ont pas pu être chargés."); });
    return () => { actif = false; };
  }, []);

  async function executerAction(chemin: string, corps: unknown, confirmation: boolean): Promise<void> {
    if (confirmation && !window.confirm("Confirmez-vous cette décision administrative ?")) return;
    setMessage(null); setErreur(null); setCodeActivationRemise(null);
    try {
      const resultat = await requeteApi<{ message: string; code_activation?: string }>(chemin, { methode: "POST", jetonCsrf, corps });
      setMessage(resultat.message);
      setCodeActivationRemise(resultat.code_activation ?? null);
      if (chemin.includes("/delegues/") && (chemin.endsWith("/approuver") || chemin.includes("/remplacer/"))) {
        setVerificationIdentiteAdministrative(false);
      }
      await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "L’opération n’a pas abouti."); }
  }

  function modifierPerimetre(compte: Consultation, modification: Partial<EditionPerimetre>): void {
    const courant = editionsPerimetre[compte.id] ?? {
      perimetre: compte.perimetre,
      provinces: compte.provinces.map((province) => province.province_id),
    };
    setEditionsPerimetre({ ...editionsPerimetre, [compte.id]: { ...courant, ...modification } });
  }

  async function enregistrerPerimetre(compte: Consultation): Promise<void> {
    const edition = editionsPerimetre[compte.id] ?? {
      perimetre: compte.perimetre,
      provinces: compte.provinces.map((province) => province.province_id),
    };
    const motifPerimetre = window.prompt("Motif de la modification du périmètre (10 à 500 caractères)", motif);
    if (motifPerimetre === null) return;
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>(`/api/administration/comptes/consultation/${compte.id}/perimetre`, {
        methode: "PATCH", jetonCsrf,
        corps: { ...edition, motif: motifPerimetre },
      });
      setMessage(resultat.message);
      await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "Le périmètre n’a pas pu être modifié."); }
  }

  async function creerCompteConsultation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setErreur(null); setMessage(null);
    try {
      const resultat = await requeteApi<{ message: string; code_activation?: string }>("/api/administration/comptes/consultation", {
        methode: "POST", jetonCsrf,
        corps: { nom_complet: nom, institution, fonction, courriel, telephone: telephone || null,
          perimetre, provinces: perimetre === "NATIONAL" ? [] : provincesChoisies, motif },
      });
      setMessage(resultat.message); setCodeActivationRemise(resultat.code_activation ?? null); setFormulaireOuvert(false); setNom(""); setInstitution(""); setFonction("");
      setCourriel(""); setTelephone(""); setProvincesChoisies([]); await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "L’invitation n’a pas pu être créée."); }
  }

  const onglets: Array<{ id: typeof onglet; libelle: string; total: number }> = [
    { id: "demandes", libelle: "Demandes d’inscription", total: demandes?.total ?? 0 },
    { id: "delegues", libelle: "Délégués provinciaux", total: delegues?.total ?? 0 },
    { id: "consultation", libelle: "Comptes de consultation", total: consultations?.total ?? 0 },
    { id: "decisions", libelle: "Historique des décisions", total: decisions?.total ?? 0 },
  ];

  return (
    <section className="sigad-page-comptes" aria-label="Gestion des comptes">

      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}

      {codeActivationRemise && (
        <SIGADCard as="aside" ariaLabelledby="titre-code-remise" style={{ marginBottom: "1.5rem", borderLeft: "4px solid var(--sigad-warning)" }}>
          <SIGADCardHeader>
            <div>
              <SIGADCardTitle id="titre-code-remise">Code d’activation temporaire</SIGADCardTitle>
              <SIGADCardSubtitle>Remettez ce code directement au destinataire par un canal privé. Il ne sera plus affiché après fermeture ou actualisation de cette page.</SIGADCardSubtitle>
            </div>
          </SIGADCardHeader>
          <SIGADCardBody>
            <output className="sigad-code-activation" aria-label="Code d’activation à remettre en privé" style={{ display: "block", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "2px", margin: "1rem 0", color: "var(--sigad-primary)" }}>
              {codeActivationRemise}
            </output>
            <SIGADButton variant="outline" size="sm" onClick={() => setCodeActivationRemise(null)}>
              Masquer le code
            </SIGADButton>
          </SIGADCardBody>
        </SIGADCard>
      )}

      <SIGADFormPanel
        open={formulaireOuvert && onglet === "consultation"}
        onClose={() => setFormulaireOuvert(false)}
        title="Nouvelle invitation de consultation"
        subtitle={
          !verificationCourrielActive
            ? "Sans service d’e-mail, l’adresse restera non vérifiée. Le code d’activation sera affiché une seule fois à l’administration pour remise privée."
            : "Renseignez les coordonnées et le périmètre institutionnel du responsable invité."
        }
        size="standard"
        isDirty={Boolean(nom.trim() || institution.trim() || fonction.trim() || courriel.trim())}
        isSubmitting={chargement}
        errorMessage={erreur}
        submitLabel={verificationCourrielActive ? "Créer et envoyer l’invitation" : "Créer et préparer l’activation"}
        onSubmit={(event) => void creerCompteConsultation(event)}
      >
        <div className="sigad-formulaire-consultation__grille" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
          <SIGADFormField label="Nom complet" required>
            <SIGADInput autoComplete="name" maxLength={160} required value={nom} onChange={(event) => setNom(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Institution ou service" required>
            <SIGADInput maxLength={180} required value={institution} onChange={(event) => setInstitution(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Fonction" required>
            <SIGADInput maxLength={180} required value={fonction} onChange={(event) => setFonction(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Adresse e-mail" required>
            <SIGADInput autoComplete="email" required type="email" value={courriel} onChange={(event) => setCourriel(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Téléphone" optionalTag>
            <SIGADInput autoComplete="tel" type="tel" value={telephone} onChange={(event) => setTelephone(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Périmètre" required>
            <SIGADSelect value={perimetre} onChange={(event) => setPerimetre(event.currentTarget.value as typeof perimetre)}>
              <option value="NATIONAL">National</option>
              <option value="PROVINCIAL">Provincial</option>
              <option value="MULTI_PROVINCIAL">Multi-provincial</option>
            </SIGADSelect>
          </SIGADFormField>
          {perimetre !== "NATIONAL" && (
            <SIGADFormField label="Provinces autorisées" hint="Maintenez la touche Ctrl ou Cmd pour sélectionner plusieurs provinces." required>
              <SIGADSelect multiple value={provincesChoisies} style={{ minHeight: "110px" }} onChange={(event) => setProvincesChoisies(Array.from(event.currentTarget.selectedOptions, (option) => option.value))}>
                {provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}
              </SIGADSelect>
            </SIGADFormField>
          )}
          <SIGADFormField label="Motif administratif" hint="10 à 500 caractères" required>
            <SIGADTextarea required minLength={10} maxLength={500} value={motif} onChange={(event) => setMotif(event.currentTarget.value)} />
          </SIGADFormField>
        </div>
      </SIGADFormPanel>

      <div className="sigad-compact-toolbar sigad-comptes-toolbar">
        <SIGADTabsList ariaLabel="Gestion des comptes">
          {onglets.map((item) => (
            <SIGADTab
              key={item.id}
              active={onglet === item.id}
              badgeCount={item.total}
              onClick={() => setOnglet(item.id)}
            >
              {item.libelle}
            </SIGADTab>
          ))}
        </SIGADTabsList>
        {onglet === "consultation" && (
          <SIGADButton
            variant="primary"
            onClick={() => setFormulaireOuvert((ouvert) => !ouvert)}
          >
            {formulaireOuvert ? "Fermer le formulaire" : "Inviter un responsable institutionnel"}
          </SIGADButton>
        )}
      </div>

      {chargement && <p role="status" style={{ color: "var(--sigad-text-secondary)" }}>Actualisation des comptes…</p>}

      {onglet === "demandes" && (
        <SIGADCard>
          <SIGADCardBody>
            <div style={{ padding: "0.75rem 1rem", background: "var(--sigad-surface-subtle)", borderRadius: "var(--sigad-radius-md)", marginBottom: "1rem" }}>
              <label htmlFor="verification-identite-administrative" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                <input
                  id="verification-identite-administrative"
                  type="checkbox"
                  checked={verificationIdentiteAdministrative}
                  onChange={(event) => setVerificationIdentiteAdministrative(event.currentTarget.checked)}
                />
                Je confirme avoir vérifié l’identité du demandeur par une procédure administrative indépendante de la vérification de son adresse e-mail.
              </label>
            </div>
            <SIGADTable>
              <thead>
                <tr>
                  <th>Nom complet</th>
                  <th>Province</th>
                  <th>E-mail vérifié</th>
                  <th>Téléphone</th>
                  <th>Inscrite le</th>
                  <th>État</th>
                  <th>Décision</th>
                </tr>
              </thead>
              <tbody>
                {(demandes?.elements ?? []).map((demande) => (
                  <tr key={demande.id}>
                    <td className="texte-gras">{demande.nom_complet}</td>
                    <td>{demande.province}</td>
                    <td>
                      <SIGADBadge variant={demande.courriel_verifie_le ? "success" : "warning"} withDot>
                        {demande.courriel_verifie_le ? "Oui" : "Non (procédure requise)"}
                      </SIGADBadge>
                    </td>
                    <td>{demande.telephone}</td>
                    <td>{dateFr(demande.cree_le)}</td>
                    <td>
                      <SIGADBadge variant={demande.conflit_delegation ? "danger" : "info"}>
                        {demande.statut}{demande.conflit_delegation ? " · conflit" : ""}
                      </SIGADBadge>
                    </td>
                    <td>
                      {demande.statut === "EN_ATTENTE_APPROBATION" && (
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {!demande.delegue_actif_id && (
                            <SIGADButton
                              variant="primary"
                              size="sm"
                              disabled={!verificationIdentiteAdministrative}
                              onClick={() => void executerAction(`/api/administration/comptes/delegues/${demande.id}/approuver`, { motif, verification_identite_administrative: true }, true)}
                            >
                              Approuver
                            </SIGADButton>
                          )}
                          {demande.delegue_actif_id && (
                            <SIGADButton
                              variant="secondary"
                              size="sm"
                              disabled={!verificationIdentiteAdministrative}
                              onClick={() => void executerAction(`/api/administration/comptes/delegues/${demande.id}/remplacer/${demande.delegue_actif_id}`, { motif, verification_identite_administrative: true }, true)}
                            >
                              Remplacer
                            </SIGADButton>
                          )}
                          <SIGADButton
                            variant="danger"
                            size="sm"
                            onClick={() => void executerAction(`/api/administration/comptes/delegues/${demande.id}/refuser`, { motif }, true)}
                          >
                            Refuser
                          </SIGADButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!demandes?.elements.length && (
                  <tr>
                    <td colSpan={7}>
                      <SIGADEmptyState title="Aucune demande" description="Aucune demande d’inscription en attente." />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}

      {onglet === "delegues" && (
        <SIGADCard>
          <SIGADCardBody>
            <SIGADTable>
              <thead>
                <tr>
                  <th>Nom complet</th>
                  <th>Province</th>
                  <th>Identifiant</th>
                  <th>E-mail</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(delegues?.elements ?? []).map((delegue) => (
                  <tr key={delegue.id}>
                    <td className="texte-gras">{delegue.nom_complet}</td>
                    <td>{delegue.province}</td>
                    <td>{delegue.identifiant}</td>
                    <td>
                      <div>{delegue.courriel ?? "—"}</div>
                      <small style={{ color: delegue.courriel_verifie_le ? "var(--sigad-success)" : "var(--sigad-text-muted)" }}>
                        {delegue.courriel_verifie_le ? "Vérifiée" : "Non vérifiée"}
                      </small>
                    </td>
                    <td>
                      <SIGADBadge variant={delegue.statut === "ACTIF" ? "success" : "danger"} withDot>
                        {delegue.statut}
                      </SIGADBadge>
                    </td>
                    <td>{dateFr(delegue.derniere_connexion)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {delegue.statut === "ACTIF" ? (
                          <SIGADButton
                            variant="danger"
                            size="sm"
                            onClick={() => void executerAction(`/api/administration/comptes/delegues/${delegue.id}/suspendre`, { motif }, true)}
                          >
                            Suspendre
                          </SIGADButton>
                        ) : (
                          <SIGADButton
                            variant="primary"
                            size="sm"
                            onClick={() => void executerAction(`/api/administration/comptes/delegues/${delegue.id}/reactiver`, { motif }, true)}
                          >
                            Réactiver
                          </SIGADButton>
                        )}
                        <SIGADButton
                          variant="outline"
                          size="sm"
                          onClick={() => void executerAction(`/api/administration/comptes/delegues/${delegue.id}/revoquer-sessions`, { motif }, true)}
                        >
                          Révoquer sessions
                        </SIGADButton>
                      </div>
                    </td>
                  </tr>
                ))}
                {!delegues?.elements.length && (
                  <tr>
                    <td colSpan={7}>
                      <SIGADEmptyState title="Aucun délégué" description="Aucun compte délégué provincial configuré." />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}

      {onglet === "consultation" && (
        <SIGADCard>
          <SIGADCardBody>
            <SIGADTable>
              <thead>
                <tr>
                  <th>Responsable</th>
                  <th>Institution / fonction</th>
                  <th>E-mail</th>
                  <th>Périmètre</th>
                  <th>Statut</th>
                  <th>Dernière connexion</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(consultations?.elements ?? []).map((compte) => {
                  const edition = editionsPerimetre[compte.id] ?? {
                    perimetre: compte.perimetre,
                    provinces: compte.provinces.map((province) => province.province_id),
                  };
                  return (
                    <tr key={compte.id}>
                      <td className="texte-gras">
                        {compte.nom_complet}
                        <div style={{ fontSize: "0.75rem", color: "var(--sigad-text-muted)" }}>{compte.identifiant}</div>
                      </td>
                      <td>
                        {compte.institution}
                        <div style={{ fontSize: "0.75rem", color: "var(--sigad-text-muted)" }}>{compte.fonction}</div>
                      </td>
                      <td>
                        <div>{compte.courriel ?? "—"}</div>
                        <small style={{ color: compte.courriel_verifie_le ? "var(--sigad-success)" : "var(--sigad-text-muted)" }}>
                          {compte.courriel_verifie_le ? "Vérifiée" : "Non vérifiée"}
                        </small>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: "260px" }}>
                          <SIGADSelect
                            aria-label={`Périmètre de ${compte.nom_complet}`}
                            value={edition.perimetre}
                            onChange={(event) =>
                              modifierPerimetre(compte, {
                                perimetre: event.currentTarget.value as Consultation["perimetre"],
                                provinces: event.currentTarget.value === "NATIONAL" ? [] : edition.provinces,
                              })
                            }
                          >
                            <option value="NATIONAL">National</option>
                            <option value="PROVINCIAL">Provincial</option>
                            <option value="MULTI_PROVINCIAL">Multi-provincial</option>
                          </SIGADSelect>
                          {edition.perimetre !== "NATIONAL" && (
                            <SIGADSelect
                              aria-label={`Provinces autorisées pour ${compte.nom_complet}`}
                              multiple
                              value={edition.provinces}
                              style={{ minHeight: "80px" }}
                              onChange={(event) =>
                                modifierPerimetre(compte, {
                                  provinces: Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                                })
                              }
                            >
                              {provinces.map((province) => (
                                <option key={province.id} value={province.id}>
                                  {province.nom}
                                </option>
                              ))}
                            </SIGADSelect>
                          )}
                          <small style={{ color: "var(--sigad-text-muted)", fontSize: "0.75rem" }}>
                            {compte.provinces.map((province) => province.province).join(", ") || "Toutes les provinces"}
                          </small>
                          <SIGADButton variant="outline" size="sm" onClick={() => void enregistrerPerimetre(compte)}>
                            Enregistrer le périmètre
                          </SIGADButton>
                        </div>
                      </td>
                      <td>
                        <SIGADBadge variant={compte.statut === "ACTIF" ? "success" : "danger"} withDot>
                          {compte.statut}
                        </SIGADBadge>
                      </td>
                      <td>{dateFr(compte.derniere_connexion)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          {compte.statut === "SUSPENDU" ? (
                            <SIGADButton
                              variant="primary"
                              size="sm"
                              onClick={() => void executerAction(`/api/administration/comptes/consultation/${compte.id}/reactiver`, { motif }, true)}
                            >
                              Réactiver
                            </SIGADButton>
                          ) : (
                            <SIGADButton
                              variant="danger"
                              size="sm"
                              onClick={() => void executerAction(`/api/administration/comptes/consultation/${compte.id}/suspendre`, { motif }, true)}
                            >
                              Suspendre
                            </SIGADButton>
                          )}
                          <SIGADButton
                            variant="outline"
                            size="sm"
                            onClick={() => void executerAction(`/api/administration/comptes/consultation/${compte.id}/revoquer-sessions`, { motif }, true)}
                          >
                            Révoquer
                          </SIGADButton>
                          <SIGADButton
                            variant="outline"
                            size="sm"
                            onClick={() => void executerAction(`/api/administration/comptes/consultation/${compte.id}/renvoyer-invitation`, { motif }, true)}
                          >
                            Renvoyer invitation
                          </SIGADButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!consultations?.elements.length && (
                  <tr>
                    <td colSpan={7}>
                      <SIGADEmptyState title="Aucun compte de consultation" description="Aucun compte institutionnel de consultation." />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}

      {onglet === "decisions" && (
        <SIGADCard>
          <SIGADCardBody>
            <SIGADTable>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opérateur</th>
                  <th>Décision</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {(decisions?.elements ?? []).map((decision) => (
                  <tr key={decision.id}>
                    <td>{dateFr(decision.cree_le)}</td>
                    <td className="texte-gras">{decision.acteur}</td>
                    <td>
                      <SIGADBadge variant="info">{decision.action}</SIGADBadge>
                    </td>
                    <td>{decision.motif}</td>
                  </tr>
                ))}
                {!decisions?.elements.length && (
                  <tr>
                    <td colSpan={4}>
                      <SIGADEmptyState title="Aucune décision" description="Aucune décision administrative enregistrée." />
                    </td>
                  </tr>
                )}
              </tbody>
            </SIGADTable>
          </SIGADCardBody>
        </SIGADCard>
      )}
    </section>
  );
}
