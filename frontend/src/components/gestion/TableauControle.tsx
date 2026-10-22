import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { requeteApi } from "../../services/api";

interface Props {
  utilisateur: UtilisateurAuthentifie;
  jetonCsrf: string;
}

interface Page<T> { elements: T[]; total: number; limite: number; decalage: number; }
interface OperationControle {
  id: string; type_operation: string; reference: string; intitule: string; statut: string;
  date_operation: string; province_id: string | null; province_nom: string | null;
  partenaire_nom: string | null; partenaire_execution_nom: string | null;
}
interface SyntheseControle {
  operations_en_cours: number; operations_terminees: number; distributions_a_cloturer: number;
  approvisionnements_avec_ecarts: number; observations_ouvertes: number; demandes_correction_ouvertes: number;
}
interface ObservationControle {
  id: string; operation_type: string; operation_id: string; province_id: string; province_nom: string;
  niveau_gravite: "INFO" | "AVERTISSEMENT" | "CRITIQUE"; observation: string;
  reponse_delegue: string | null; statut: "OUVERTE" | "TRAITEE" | "CLASSEE"; cree_le: string;
}
interface DemandeCorrection {
  id: string; distribution_id: string; province_id: string; province_nom: string;
  reference_distribution: string; intitule_distribution: string; motif_retour: string;
  elements_a_corriger: string; statut: "EN_ATTENTE_DELEGUE" | "CORRECTION_SOUMISE" | "VALIDEE_CENTRAL";
  reponse_delegue: string | null;
}
interface DossierCloture {
  id: string; reference_distribution: string; intitule_distribution: string; province_id: string;
  province_nom: string; statut: string; pret: boolean; bloqueurs: string[];
  lots_a_liberer: number; quantite_a_liberer: number;
}
interface EntreeAudit {
  id: string; utilisateur_nom: string | null; utilisateur_id: string; role_utilisateur: string;
  province_id: string | null; province_nom: string | null; action: string; entite_type: string;
  entite_id: string; reference: string; cree_le: string;
}
interface NotificationInterne {
  id: string; titre: string; message: string; type_alerte: string; lien_cible: string | null;
  lue: number; cree_le: string;
}
interface ProvincesApi { elements: Array<{ id: string; nom: string }>; }
type VueControle = "tableau" | "observations" | "corrections" | "fermetures" | "audit" | "notifications";

function construireQuery(valeurs: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (valeur !== undefined && String(valeur).trim() !== "") params.set(cle, String(valeur));
  }
  return params.toString();
}

function pagePrecedente(decalage: number): number { return Math.max(0, decalage - 25); }

export function TableauControle({ utilisateur, jetonCsrf }: Props) {
  const estCentral = utilisateur.role === "ADMIN_CENTRAL";
  const estDelegue = utilisateur.role === "DELEGUE_PROVINCIAL";
  const estProprietaire = utilisateur.role === "PROPRIETAIRE";
  const [vue, setVue] = useState<VueControle>(estCentral ? "tableau" : estDelegue ? "observations" : "audit");
  const [decalage, setDecalage] = useState(0);
  const [provinceId, setProvinceId] = useState(estDelegue ? (utilisateur.province_id ?? "") : "");
  const [statut, setStatut] = useState("");
  const [typeOperation, setTypeOperation] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [recherche, setRecherche] = useState("");
  const [partenaireId, setPartenaireId] = useState("");
  const [actionAudit, setActionAudit] = useState("");
  const [entiteAudit, setEntiteAudit] = useState("");
  const [referenceAudit, setReferenceAudit] = useState("");
  const [utilisateurAudit, setUtilisateurAudit] = useState("");
  const [synthese, setSynthese] = useState<SyntheseControle | null>(null);
  const [operations, setOperations] = useState<Page<OperationControle> | null>(null);
  const [observations, setObservations] = useState<Page<ObservationControle> | null>(null);
  const [corrections, setCorrections] = useState<Page<DemandeCorrection> | null>(null);
  const [fermetures, setFermetures] = useState<Page<DossierCloture> | null>(null);
  const [audit, setAudit] = useState<Page<EntreeAudit> | null>(null);
  const [notifications, setNotifications] = useState<Page<NotificationInterne> & { non_lues: number } | null>(null);
  const [provinces, setProvinces] = useState<ProvincesApi["elements"]>([]);
  const [idOperation, setIdOperation] = useState("");
  const [provinceObservation, setProvinceObservation] = useState("");
  const [typeObservation, setTypeObservation] = useState("DISTRIBUTION_PROVINCIALE");
  const [gravite, setGravite] = useState("INFO");
  const [texteObservation, setTexteObservation] = useState("");
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [correctionsSaisies, setCorrectionsSaisies] = useState<Record<string, Record<string, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [actualisation, setActualisation] = useState(0);

  const baseApi = estCentral ? "/api/central" : "/api/provincial";
  const filtres = useMemo(() => ({
    limite: 25, decalage, province_id: provinceId, statut,
    type_operation: typeOperation, date_debut: dateDebut, date_fin: dateFin, recherche,
  }), [decalage, provinceId, statut, typeOperation, dateDebut, dateFin, recherche]);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      if (estCentral && vue === "tableau") {
        const filtresOperations = construireQuery({ ...filtres, partenaire_id: partenaireId });
        const [indicateurs, page] = await Promise.all([
          requeteApi<SyntheseControle>(`/api/central/controle/synthese?${filtresOperations}`),
          requeteApi<Page<OperationControle>>(`/api/central/controle/operations?${filtresOperations}`),
        ]);
        setSynthese(indicateurs);
        setOperations(page);
      } else if (vue === "observations") {
        const filtresObservations = construireQuery({ limite: 25, decalage, province_id: provinceId,
          statut, operation_type: typeOperation, date_debut: dateDebut, date_fin: dateFin });
        setObservations(await requeteApi<Page<ObservationControle>>(`${baseApi}${estCentral ? "/controle/observations" : "/observations"}?${filtresObservations}`));
      } else if (vue === "corrections") {
        const filtresCorrections = construireQuery({ limite: 25, decalage, province_id: provinceId,
          statut, recherche, date_debut: dateDebut, date_fin: dateFin });
        setCorrections(await requeteApi<Page<DemandeCorrection>>(`${baseApi}${estCentral ? "/controle/corrections" : "/corrections"}?${filtresCorrections}`));
      } else if (vue === "fermetures" && estCentral) {
        const filtresFermetures = construireQuery({ limite: 25, decalage, province_id: provinceId });
        setFermetures(await requeteApi<Page<DossierCloture>>(`/api/central/controle/fermetures?${filtresFermetures}`));
      } else if (vue === "audit") {
        const queryAudit = construireQuery({
          limite: 25, decalage, province_id: provinceId, utilisateur_id: utilisateurAudit,
          action: actionAudit, entite_type: entiteAudit, reference: referenceAudit,
          date_debut: dateDebut, date_fin: dateFin,
        });
        const route = estProprietaire ? "/api/proprietaire/audit" : `${baseApi}/audit`;
        setAudit(await requeteApi<Page<EntreeAudit>>(`${route}?${queryAudit}`));
      } else if (vue === "notifications") {
        setNotifications(await requeteApi<Page<NotificationInterne> & { non_lues: number }>(`/api/notifications?limite=25&decalage=${decalage}`));
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le tableau de contrôle n’a pas pu être chargé.");
    } finally {
      setChargement(false);
    }
  }, [filtres, vue, baseApi, estCentral, estProprietaire, decalage, provinceId, utilisateurAudit, actionAudit, entiteAudit, referenceAudit, dateDebut, dateFin, statut, typeOperation, recherche, partenaireId]);

  useEffect(() => { void charger(); }, [charger, actualisation]);
  useEffect(() => {
    let actif = true;
    void requeteApi<ProvincesApi>(`/api/territoire/provinces?limite=100&decalage=0${estDelegue ? `&province_id=${encodeURIComponent(utilisateur.province_id ?? "")}` : ""}`)
      .then((reponse) => { if (actif) setProvinces(reponse.elements); })
      .catch(() => { if (actif && estDelegue && utilisateur.province_id) setProvinces([{ id: utilisateur.province_id, nom: utilisateur.province_id }]); });
    return () => { actif = false; };
  }, [estDelegue, utilisateur.province_id]);

  async function actionApi<T>(chemin: string, corps?: unknown): Promise<T> {
    return requeteApi<T>(chemin, {
      methode: "POST", jetonCsrf, ...(corps === undefined ? {} : { corps }),
      cleIdempotence: crypto.randomUUID(),
    });
  }

  async function soumettreObservation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); setErreur(null); setMessage(null);
    try {
      await actionApi("/api/central/controle/observations", {
        operation_type: typeObservation, operation_id: idOperation,
        ...(provinceObservation ? { province_id: provinceObservation } : {}),
        niveau_gravite: gravite, observation: texteObservation,
      });
      setIdOperation(""); setTexteObservation(""); setMessage("L’observation a été enregistrée et transmise à la délégation concernée.");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La création de l’observation a échoué."); }
  }

  async function repondreObservation(item: ObservationControle): Promise<void> {
    setErreur(null); setMessage(null);
    try {
      await actionApi(`${baseApi}/observations/${encodeURIComponent(item.id)}/reponse`, { reponse_delegue: reponses[item.id] ?? "" });
      setMessage("Votre réponse a été transmise à l’administration centrale.");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La réponse n’a pas été enregistrée."); }
  }

  async function cloturerObservation(item: ObservationControle): Promise<void> {
    setErreur(null); setMessage(null);
    try {
      await actionApi(`/api/central/controle/observations/${encodeURIComponent(item.id)}/cloture`, {
        statut: "TRAITEE", decision: "Réponse examinée par le contrôle central.",
      });
      setMessage("L’observation a été clôturée après examen de la réponse.");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La clôture de l’observation a échoué."); }
  }

  function lireChampsModifiables(item: DemandeCorrection): string[] {
    try {
      const contenu: unknown = JSON.parse(item.elements_a_corriger);
      if (typeof contenu !== "object" || contenu === null) return [];
      const champs: unknown = Reflect.get(contenu, "champs_modifiables");
      return Array.isArray(champs) ? champs.filter((champ): champ is string => typeof champ === "string") : [];
    } catch { return []; }
  }

  async function soumettreCorrection(item: DemandeCorrection): Promise<void> {
    setErreur(null); setMessage(null);
    const valeurs = correctionsSaisies[item.id] ?? {};
    try {
      await actionApi(`/api/distributions/${encodeURIComponent(item.distribution_id)}/corrections`, {
        reponse_delegue: reponses[item.id] ?? "Correction soumise avec les éléments demandés.",
        corrections: Object.fromEntries(Object.entries(valeurs).map(([cle, valeur]) => [cle, valeur || null])),
      });
      setMessage("La correction a été soumise au contrôle central.");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La correction n’a pas été enregistrée."); }
  }

  async function validerCorrection(item: DemandeCorrection): Promise<void> {
    setErreur(null); setMessage(null);
    try {
      await actionApi(`/api/central/distributions/${encodeURIComponent(item.distribution_id)}/corrections/${encodeURIComponent(item.id)}/validation`, {});
      setMessage("La correction a été validée. Les remises et mouvements de stock restent inchangés.");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La validation de la correction a échoué."); }
  }

  async function cloturerDistribution(item: DossierCloture): Promise<void> {
    setErreur(null); setMessage(null);
    try {
      await actionApi(`/api/central/distributions/${encodeURIComponent(item.id)}/cloture`, { observations_finales: null });
      setMessage(`La distribution ${item.reference_distribution} a été clôturée.`);
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La clôture de la distribution a échoué."); }
  }

  async function marquerNotification(item: NotificationInterne): Promise<void> {
    setErreur(null);
    try {
      await actionApi(`/api/notifications/${encodeURIComponent(item.id)}/lecture`);
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La notification n’a pas pu être marquée comme lue."); }
  }

  async function toutMarquerLu(): Promise<void> {
    setErreur(null);
    try {
      await actionApi("/api/notifications/lecture-toutes");
      setActualisation((valeur) => valeur + 1);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "Les notifications n’ont pas pu être mises à jour."); }
  }

  const vues: Array<{ id: VueControle; titre: string }> = [
    ...(estCentral ? [{ id: "tableau" as const, titre: "Tableau national" }] : []),
    ...(estCentral || estDelegue ? [{ id: "observations" as const, titre: "Observations" }] : []),
    ...(estCentral || estDelegue ? [{ id: "corrections" as const, titre: "Demandes de correction" }] : []),
    ...(estCentral ? [{ id: "fermetures" as const, titre: "Dossiers à clôturer" }] : []),
    { id: "audit", titre: "Journal d’audit" },
    { id: "notifications", titre: "Notifications" },
  ];

  return (
    <section className="contenu-tableau module-controle">
      <div className="entete-section">
        <div><p className="surtitre">Suivi et traçabilité</p><h1>{estCentral ? "Contrôle central" : estDelegue ? "Contrôle provincial" : "Consultation d’audit"}</h1>
          <p>Consultez les opérations, traitez les observations et suivez les notifications de votre périmètre.</p></div>
      </div>
      <div className="onglets-controle" role="tablist" aria-label="Modules de contrôle">
        {vues.map((item) => <button key={item.id} type="button" role="tab" aria-selected={vue === item.id}
          className={vue === item.id ? "onglet-controle actif" : "onglet-controle"}
          onClick={() => { setVue(item.id); setDecalage(0); }}>{item.titre}</button>)}
      </div>
      {erreur && <p className="message-erreur" role="alert">{erreur}</p>}
      {message && <p className="message-succes" role="status">{message}</p>}

      {(vue === "tableau" || vue === "fermetures" || vue === "observations" || vue === "corrections") && (
        <div className="carte-section">
          <div className="filtres-controle">
            <label>Province
              <select value={provinceId} onChange={(event) => { setProvinceId(event.target.value); setDecalage(0); }} disabled={estDelegue}>
                <option value="">Toutes les provinces</option>
                {provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}
              </select>
            </label>
            {(vue === "tableau" || vue === "observations" || vue === "corrections") && <>
              <label>Statut<select value={statut} onChange={(event) => setStatut(event.target.value)}>
                <option value="">Tous les statuts</option>
                {vue === "tableau" && ["BROUILLON", "VALIDEE", "EN_EXPEDITION", "PARTIELLEMENT_RECEPTIONNEE", "RECEPTIONNEE", "EN_RAPPROCHEMENT", "CLOTUREE", "PLANIFIEE", "RECEPTIONNEE_AVEC_ECART", "EN_ECART", "EN_PREPARATION", "VALIDEE_PROVINCE", "EN_EXECUTION", "TERMINEE_PROVINCE", "RETOURNEE_POUR_CORRECTION", "CLOTUREE_CENTRAL", "RESERVATION", "RECEPTION", "ENTREE", "SORTIE_DISTRIBUTION", "AJUSTEMENT_POSITIF", "AJUSTEMENT_NEGATIF", "TRANSFERT_ENTRANT", "TRANSFERT_SORTANT", "PERTE"].map((valeur) => <option key={valeur} value={valeur}>{valeur}</option>)}
                {vue === "observations" && ["OUVERTE", "TRAITEE", "CLASSEE"].map((valeur) => <option key={valeur} value={valeur}>{valeur}</option>)}
                {vue === "corrections" && ["EN_ATTENTE_DELEGUE", "CORRECTION_SOUMISE", "VALIDEE_CENTRAL"].map((valeur) => <option key={valeur} value={valeur}>{valeur}</option>)}
              </select></label>
            </>}
            {vue === "tableau" && <>
              <label>Type d’opération<select value={typeOperation} onChange={(event) => setTypeOperation(event.target.value)}>
                <option value="">Tous les types</option><option value="APPROVISIONNEMENT_CENTRAL">Approvisionnement central</option>
                <option value="DISTRIBUTION_PROVINCIALE">Distribution provinciale</option><option value="STOCK_PROVINCIAL">Mouvement de stock</option>
              </select></label>
              <label>Partenaire (identifiant)<input value={partenaireId} onChange={(event) => setPartenaireId(event.target.value)} placeholder="Identifiant du partenaire" /></label>
              <label>Recherche<input value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Référence, intitulé, province" /></label>
            </>}
            {vue === "corrections" && <label>Recherche<input value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Référence, distribution, motif" /></label>}
            {vue === "observations" && <label>Type d’opération<select value={typeOperation} onChange={(event) => setTypeOperation(event.target.value)}>
              <option value="">Tous les types</option><option value="APPROVISIONNEMENT_CENTRAL">Approvisionnement central</option>
              <option value="DISTRIBUTION_PROVINCIALE">Distribution provinciale</option><option value="STOCK_PROVINCIAL">Mouvement de stock</option>
            </select></label>}
            <label>Du<input type="date" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} /></label>
            <label>Au<input type="date" value={dateFin} onChange={(event) => setDateFin(event.target.value)} /></label>
            <button className="bouton bouton-secondaire" type="button" onClick={() => { setDecalage(0); setActualisation((valeur) => valeur + 1); }}>Appliquer</button>
          </div>
        </div>
      )}

      {chargement && <p className="etat-vide">Chargement des données de contrôle…</p>}

      {vue === "tableau" && estCentral && synthese && (
        <>
          <div className="indicateurs-controle">
            <div><strong>{synthese.operations_en_cours}</strong><span>Opérations en cours</span></div>
            <div><strong>{synthese.operations_terminees}</strong><span>Opérations terminées</span></div>
            <div><strong>{synthese.distributions_a_cloturer}</strong><span>Distributions à clôturer</span></div>
            <div><strong>{synthese.approvisionnements_avec_ecarts}</strong><span>Approvisionnements avec écarts</span></div>
            <div><strong>{synthese.observations_ouvertes}</strong><span>Observations ouvertes</span></div>
            <div><strong>{synthese.demandes_correction_ouvertes}</strong><span>Corrections ouvertes</span></div>
          </div>
          <div className="carte-section">
            <div className="entete-section"><div><h2>Opérations suivies</h2><p>{operations?.total ?? 0} résultat(s)</p></div></div>
            {operations?.elements.length ? <div className="tableau-defilement"><table><thead><tr><th>Référence</th><th>Opération</th><th>Province</th><th>Partenaire</th><th>Statut</th><th>Date</th></tr></thead>
              <tbody>{operations.elements.map((item) => <tr key={`${item.type_operation}-${item.id}-${item.province_id ?? "national"}`}>
                <td>{item.reference}</td><td>{item.intitule}</td><td>{item.province_nom ?? "National"}</td>
                <td>{item.partenaire_execution_nom ?? item.partenaire_nom ?? "—"}</td><td><span className="badge-statut">{item.statut}</span></td><td>{item.date_operation}</td>
              </tr>)}</tbody></table></div> : <p className="etat-vide">Aucune opération ne correspond aux filtres.</p>}
          </div>
          {operations && <Pagination total={operations.total} decalage={decalage} onChange={setDecalage} />}
        </>
      )}

      {vue === "observations" && (
        <>
          {estCentral && <form className="formulaire-controle" onSubmit={(event) => void soumettreObservation(event)}>
            <h2>Nouvelle observation de contrôle</h2>
            <label>Type d’opération<select value={typeObservation} onChange={(event) => setTypeObservation(event.target.value)}>
              <option value="DISTRIBUTION_PROVINCIALE">Distribution provinciale</option><option value="APPROVISIONNEMENT_CENTRAL">Approvisionnement central</option><option value="STOCK_PROVINCIAL">Mouvement de stock provincial</option>
            </select></label>
            <label>Identifiant de l’opération<input required value={idOperation} onChange={(event) => setIdOperation(event.target.value)} /></label>
            {typeObservation === "APPROVISIONNEMENT_CENTRAL" && <label>Province destinataire<select required value={provinceObservation} onChange={(event) => setProvinceObservation(event.target.value)}>
              <option value="">Choisir une province</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}
            </select></label>}
            <label>Gravité<select value={gravite} onChange={(event) => setGravite(event.target.value)}><option value="INFO">Information</option><option value="AVERTISSEMENT">Avertissement</option><option value="CRITIQUE">Critique</option></select></label>
            <label className="largeur-complete">Observation<textarea required minLength={5} maxLength={4000} value={texteObservation} onChange={(event) => setTexteObservation(event.target.value)} /></label>
            <button className="bouton bouton-principal" type="submit">Enregistrer et notifier</button>
          </form>}
          <div className="liste-controle">{observations?.elements.map((item) => <article className="carte-controle" key={item.id}>
            <div className="ligne-controle"><strong>{item.province_nom}</strong><span className={`badge-gravite gravite-${item.niveau_gravite.toLowerCase()}`}>{item.niveau_gravite}</span><span className="badge-statut">{item.statut}</span><time>{item.cree_le}</time></div>
            <p>{item.observation}</p><small>{item.operation_type} · {item.operation_id}</small>
            {item.reponse_delegue && <blockquote><strong>Réponse provinciale</strong><br />{item.reponse_delegue}</blockquote>}
            {estDelegue && item.statut === "OUVERTE" && !item.reponse_delegue && <div className="actions-controle">
              <textarea aria-label="Votre réponse" placeholder="Rédigez votre réponse" value={reponses[item.id] ?? ""} onChange={(event) => setReponses((valeur) => ({ ...valeur, [item.id]: event.target.value }))} />
              <button className="bouton bouton-principal" type="button" disabled={(reponses[item.id] ?? "").trim().length < 5} onClick={() => void repondreObservation(item)}>Transmettre la réponse</button>
            </div>}
            {estCentral && item.statut === "OUVERTE" && item.reponse_delegue && <button className="bouton bouton-secondaire" type="button" onClick={() => void cloturerObservation(item)}>Clôturer après examen</button>}
          </article>)}</div>
          {observations && <Pagination total={observations.total} decalage={decalage} onChange={setDecalage} />}
        </>
      )}

      {vue === "corrections" && <>
        <div className="liste-controle">{corrections?.elements.map((item) => {
          const champs = lireChampsModifiables(item);
          return <article className="carte-controle" key={item.id}>
            <div className="ligne-controle"><strong>{item.reference_distribution} — {item.province_nom}</strong><span className="badge-statut">{item.statut}</span></div>
            <p>{item.motif_retour}</p>
            {item.reponse_delegue && <blockquote>{item.reponse_delegue}</blockquote>}
            {estDelegue && item.statut === "EN_ATTENTE_DELEGUE" && <div className="formulaire-correction-controle">
              {champs.map((champ) => <label key={champ}>{champ.replaceAll("_", " ")}
                {champ === "observations" ? <textarea value={correctionsSaisies[item.id]?.[champ] ?? ""} onChange={(event) => setCorrectionsSaisies((valeur) => ({ ...valeur, [item.id]: { ...valeur[item.id], [champ]: event.target.value } }))} />
                  : <input type={champ === "date_prevue" ? "date" : "text"} value={correctionsSaisies[item.id]?.[champ] ?? ""} onChange={(event) => setCorrectionsSaisies((valeur) => ({ ...valeur, [item.id]: { ...valeur[item.id], [champ]: event.target.value } }))} />}
              </label>)}
              <label className="largeur-complete">Réponse à l’administration<textarea minLength={5} value={reponses[item.id] ?? ""} onChange={(event) => setReponses((valeur) => ({ ...valeur, [item.id]: event.target.value }))} /></label>
              <button className="bouton bouton-principal" type="button" disabled={(reponses[item.id] ?? "").trim().length < 5 || champs.some((champ) => !correctionsSaisies[item.id]?.[champ]?.trim())} onClick={() => void soumettreCorrection(item)}>Soumettre les corrections</button>
            </div>}
            {estCentral && item.statut === "CORRECTION_SOUMISE" && <button className="bouton bouton-principal" type="button" onClick={() => void validerCorrection(item)}>Valider la correction</button>}
          </article>;
        })}</div>
        {corrections && <Pagination total={corrections.total} decalage={decalage} onChange={setDecalage} />}
      </>}

      {vue === "fermetures" && estCentral && <>
        <div className="liste-controle">{fermetures?.elements.map((item) => <article className="carte-controle" key={item.id}>
          <div className="ligne-controle"><strong>{item.reference_distribution} — {item.province_nom}</strong><span className={item.pret ? "badge-statut statut-pret" : "badge-statut statut-bloque"}>{item.pret ? "Prête" : "Bloquée"}</span></div>
          <p>{item.intitule_distribution}</p><p>Reliquats à libérer : {item.lots_a_liberer} lot(s), {item.quantite_a_liberer}</p>
          {item.bloqueurs.length > 0 && <ul>{item.bloqueurs.map((bloqueur) => <li key={bloqueur}>{bloqueur}</li>)}</ul>}
          <button className="bouton bouton-principal" type="button" disabled={!item.pret} onClick={() => void cloturerDistribution(item)}>Clôturer centralement</button>
        </article>)}</div>
        {fermetures && <Pagination total={fermetures.total} decalage={decalage} onChange={setDecalage} />}
      </>}

      {vue === "audit" && <>
        <div className="carte-section filtres-audit">
          <label>Identifiant utilisateur<input value={utilisateurAudit} onChange={(event) => setUtilisateurAudit(event.target.value)} /></label>
          {!estDelegue && <label>Province<select value={provinceId} onChange={(event) => setProvinceId(event.target.value)}><option value="">Toutes</option>{provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}</select></label>}
          <label>Action<input value={actionAudit} onChange={(event) => setActionAudit(event.target.value)} /></label>
          <label>Type d’entité<input value={entiteAudit} onChange={(event) => setEntiteAudit(event.target.value)} /></label>
          <label>Référence<input value={referenceAudit} onChange={(event) => setReferenceAudit(event.target.value)} /></label>
          <label>Du<input type="date" value={dateDebut} onChange={(event) => setDateDebut(event.target.value)} /></label>
          <label>Au<input type="date" value={dateFin} onChange={(event) => setDateFin(event.target.value)} /></label>
          <button className="bouton bouton-secondaire" type="button" onClick={() => { setDecalage(0); setActualisation((valeur) => valeur + 1); }}>Filtrer le journal</button>
        </div>
        <div className="carte-section"><div className="tableau-defilement"><table><thead><tr><th>Date</th><th>Utilisateur</th><th>Province</th><th>Action</th><th>Type d’entité</th><th>Référence</th></tr></thead>
          <tbody>{audit?.elements.map((item) => <tr key={item.id}><td>{item.cree_le}</td><td>{item.utilisateur_nom ?? item.utilisateur_id}</td><td>{item.province_nom ?? item.province_id ?? "National"}</td><td>{item.action}</td><td>{item.entite_type}</td><td>{item.reference}</td></tr>)}</tbody></table></div>
          {!audit?.elements.length && <p className="etat-vide">Aucune entrée d’audit ne correspond aux filtres.</p>}</div>
        {audit && <Pagination total={audit.total} decalage={decalage} onChange={setDecalage} />}
      </>}

      {vue === "notifications" && <>
        <div className="ligne-notifications"><span>{notifications?.non_lues ?? 0} notification(s) non lue(s)</span><button className="bouton bouton-secondaire" type="button" onClick={() => void toutMarquerLu()} disabled={!notifications?.non_lues}>Tout marquer comme lu</button></div>
        <div className="liste-controle">{notifications?.elements.map((item) => <article className={item.lue ? "carte-controle notification-lue" : "carte-controle notification-non-lue"} key={item.id}>
          <div className="ligne-controle"><strong>{item.titre}</strong><span className="badge-statut">{item.type_alerte}</span><time>{item.cree_le}</time></div>
          <p>{item.message}</p>
          {!item.lue && <button className="bouton bouton-secondaire" type="button" onClick={() => void marquerNotification(item)}>Marquer comme lue</button>}
        </article>)}</div>
        {notifications && <Pagination total={notifications.total} decalage={decalage} onChange={setDecalage} />}
      </>}
    </section>
  );
}

function Pagination({ total, decalage, onChange }: { total: number; decalage: number; onChange: (valeur: number) => void }) {
  const limite = 25;
  const premiere = total === 0 ? 0 : decalage + 1;
  const derniere = Math.min(total, decalage + limite);
  return <div className="pagination"><span>{premiere}–{derniere} sur {total}</span><div>
    <button className="bouton bouton-secondaire" type="button" disabled={decalage === 0} onClick={() => onChange(pagePrecedente(decalage))}>Précédent</button>
    <button className="bouton bouton-secondaire" type="button" disabled={derniere >= total} onClick={() => onChange(decalage + limite)}>Suivant</button>
  </div></div>;
}
