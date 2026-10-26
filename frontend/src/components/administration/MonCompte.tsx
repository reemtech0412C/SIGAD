import { useEffect, useState, type FormEvent } from "react";
import { requeteApi } from "../../services/api";
import {
  SIGADAlert,
  SIGADBadge,
  SIGADButton,
  SIGADCard,
  SIGADCardBody,
  SIGADCardHeader,
  SIGADCardTitle,
  SIGADFormField,
  SIGADInput,
} from "../ui";

interface ComptePersonnel {
  identifiant: string;
  nom_complet: string;
  courriel: string | null;
  courriel_verifie_le: string | null;
  modification_courriel_disponible: boolean;
  telephone: string | null;
  role: string;
  province_id: string | null;
  province: string | null;
  statut: string;
  institution: string | null;
  fonction: string | null;
  perimetre_consultation: string | null;
  cree_le: string;
  double_facteur_actif: number;
  provinces_autorisees: string[];
}

interface SessionPersonnel {
  id: string;
  agent_utilisateur: string | null;
  cree_le: string;
  expire_le: string;
  session_courante: number;
}

interface Props {
  jetonCsrf: string;
}

function formatDate(valeur: string): string {
  const date = new Date(valeur.replace(" ", "T") + (valeur.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? valeur : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Ndjamena" }).format(date);
}

function nomRole(role: string): string {
  const libelles: Record<string, string> = {
    PROPRIETAIRE: "Propriétaire de la plateforme",
    ADMIN_CENTRAL: "Administration centrale",
    DELEGUE_PROVINCIAL: "Délégué provincial",
    CONSULTATION_INSTITUTIONNELLE: "Consultation institutionnelle",
  };
  return libelles[role] ?? role;
}

export function MonCompte({ jetonCsrf }: Props) {
  const [compte, setCompte] = useState<ComptePersonnel | null>(null);
  const [sessions, setSessions] = useState<SessionPersonnel[]>([]);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [ancienMotDePasse, setAncienMotDePasse] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");
  const [nouveauCourriel, setNouveauCourriel] = useState("");
  const [codeCourriel, setCodeCourriel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  async function charger(): Promise<void> {
    setErreur(null);
    try {
      const [profil, listeSessions] = await Promise.all([
        requeteApi<{ compte: ComptePersonnel }>("/api/compte"),
        requeteApi<{ elements: SessionPersonnel[] }>("/api/compte/sessions"),
      ]);
      setCompte(profil.compte);
      setNom(profil.compte.nom_complet);
      setTelephone(profil.compte.telephone ?? "");
      setSessions(listeSessions.elements);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Les informations du compte n’ont pas pu être chargées.");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => { void charger(); }, []);

  async function enregistrerProfil(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/compte", {
        methode: "PATCH", jetonCsrf, corps: { nom_complet: nom, telephone: telephone || null },
      });
      setMessage(resultat.message);
      await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La mise à jour du profil a échoué."); }
  }

  async function changerMotDePasse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/compte/mot-de-passe", {
        methode: "POST", jetonCsrf, corps: { mot_de_passe_actuel: ancienMotDePasse,
          nouveau_mot_de_passe: nouveauMotDePasse, confirmation_mot_de_passe: confirmationMotDePasse },
      });
      setAncienMotDePasse(""); setNouveauMotDePasse(""); setConfirmationMotDePasse("");
      setMessage(resultat.message);
      await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "Le changement de mot de passe a échoué."); }
  }

  async function demanderChangementCourriel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/compte/courriel", {
        methode: "POST", jetonCsrf, corps: { nouveau_courriel: nouveauCourriel, mot_de_passe_actuel: ancienMotDePasse },
      });
      setMessage(resultat.message);
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La demande de changement d’adresse a échoué."); }
  }

  async function confirmerChangementCourriel(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/compte/courriel/verifier", {
        methode: "POST", jetonCsrf, corps: { code: codeCourriel },
      });
      setMessage(resultat.message); setCodeCourriel(""); setNouveauCourriel(""); setAncienMotDePasse("");
      await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La confirmation de l’adresse a échoué."); }
  }

  async function revoquerAutresSessions(): Promise<void> {
    setMessage(null); setErreur(null);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/compte/sessions/revoquer-autres", { methode: "POST", jetonCsrf });
      setMessage(resultat.message); await charger();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : "La révocation des autres sessions a échoué."); }
  }

  if (chargement) return (
    <SIGADCard style={{ maxWidth: "600px", margin: "2rem auto" }}>
      <SIGADCardBody>
        <p style={{ color: "var(--sigad-text-secondary)" }}>Chargement des informations personnelles…</p>
      </SIGADCardBody>
    </SIGADCard>
  );

  if (!compte) return (
    <SIGADCard style={{ maxWidth: "600px", margin: "2rem auto" }}>
      <SIGADCardBody>
        <SIGADAlert type="danger" message={erreur ?? "Le compte n’est pas disponible."} />
      </SIGADCardBody>
    </SIGADCard>
  );

  return (
    <section className="sigad-page-comptes" aria-label="Mon compte">

      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        <SIGADCard as="article">
          <SIGADCardHeader>
            <SIGADCardTitle>Mes informations</SIGADCardTitle>
          </SIGADCardHeader>
          <SIGADCardBody>
            <form onSubmit={(event) => void enregistrerProfil(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <SIGADFormField label="Nom complet" required>
                <SIGADInput id="compte-nom" required maxLength={160} value={nom} onChange={(event) => setNom(event.currentTarget.value)} />
              </SIGADFormField>
              <SIGADFormField label="Adresse e-mail" hint={compte.courriel_verifie_le ? `Adresse vérifiée le ${formatDate(compte.courriel_verifie_le)}.` : "Adresse non vérifiée."}>
                <SIGADInput id="compte-courriel" readOnly value={compte.courriel ?? "Non renseignée"} style={{ background: "var(--sigad-surface-subtle)" }} />
              </SIGADFormField>
              <SIGADFormField label="Numéro de téléphone" optionalTag>
                <SIGADInput id="compte-telephone" type="tel" maxLength={30} value={telephone} onChange={(event) => setTelephone(event.currentTarget.value)} />
              </SIGADFormField>
              <SIGADButton variant="primary" type="submit" style={{ alignSelf: "flex-start" }}>
                Enregistrer mes informations
              </SIGADButton>
            </form>

            <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--sigad-border-subtle)" }}>
              <dl className="sigad-details-compte" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.875rem" }}>
                <div><dt style={{ color: "var(--sigad-text-muted)" }}>Rôle</dt><dd style={{ fontWeight: 600 }}>{nomRole(compte.role)}</dd></div>
                <div><dt style={{ color: "var(--sigad-text-muted)" }}>Province</dt><dd style={{ fontWeight: 600 }}>{compte.province ?? "Aucune"}</dd></div>
                <div><dt style={{ color: "var(--sigad-text-muted)" }}>Institution</dt><dd style={{ fontWeight: 600 }}>{compte.institution ?? "—"}</dd></div>
                <div><dt style={{ color: "var(--sigad-text-muted)" }}>Fonction</dt><dd style={{ fontWeight: 600 }}>{compte.fonction ?? "—"}</dd></div>
                <div>
                  <dt style={{ color: "var(--sigad-text-muted)" }}>Statut</dt>
                  <dd>
                    <SIGADBadge variant={compte.statut === "ACTIF" ? "success" : "danger"} withDot>
                      {compte.statut}
                    </SIGADBadge>
                  </dd>
                </div>
                <div>
                  <dt style={{ color: "var(--sigad-text-muted)" }}>MFA</dt>
                  <dd>
                    <SIGADBadge variant={compte.double_facteur_actif ? "success" : "warning"}>
                      {compte.double_facteur_actif ? "Activée" : "À configurer"}
                    </SIGADBadge>
                  </dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt style={{ color: "var(--sigad-text-muted)" }}>Date de création</dt>
                  <dd>{formatDate(compte.cree_le)}</dd>
                </div>
                {compte.perimetre_consultation && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <dt style={{ color: "var(--sigad-text-muted)" }}>Périmètre</dt>
                    <dd>{compte.perimetre_consultation}</dd>
                  </div>
                )}
              </dl>
            </div>
          </SIGADCardBody>
        </SIGADCard>

        <SIGADCard as="article">
          <SIGADCardHeader>
            <SIGADCardTitle>Sécurité du compte</SIGADCardTitle>
          </SIGADCardHeader>
          <SIGADCardBody>
            <form onSubmit={(event) => void changerMotDePasse(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <SIGADFormField label="Mot de passe actuel" required>
                <SIGADInput id="compte-mot-de-passe-actuel" autoComplete="current-password" required type="password" value={ancienMotDePasse} onChange={(event) => setAncienMotDePasse(event.currentTarget.value)} />
              </SIGADFormField>
              <SIGADFormField label="Nouveau mot de passe" hint="Minimum 12 caractères" required>
                <SIGADInput id="compte-mot-de-passe-nouveau" autoComplete="new-password" minLength={12} required type="password" value={nouveauMotDePasse} onChange={(event) => setNouveauMotDePasse(event.currentTarget.value)} />
              </SIGADFormField>
              <SIGADFormField label="Confirmation du nouveau mot de passe" required>
                <SIGADInput id="compte-mot-de-passe-confirmation" autoComplete="new-password" minLength={12} required type="password" value={confirmationMotDePasse} onChange={(event) => setConfirmationMotDePasse(event.currentTarget.value)} />
              </SIGADFormField>
              <SIGADButton variant="primary" type="submit" style={{ alignSelf: "flex-start" }}>
                Modifier le mot de passe
              </SIGADButton>
            </form>

            <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--sigad-border-subtle)" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>Adresse e-mail</h3>
              {compte.modification_courriel_disponible ? (
                <>
                  <form onSubmit={(event) => void demanderChangementCourriel(event)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    <SIGADFormField label="Nouvelle adresse e-mail" required>
                      <SIGADInput id="compte-nouvel-courriel" autoComplete="email" required type="email" value={nouveauCourriel} onChange={(event) => setNouveauCourriel(event.currentTarget.value)} />
                    </SIGADFormField>
                    <SIGADButton variant="secondary" type="submit" size="sm" style={{ alignSelf: "flex-start" }}>
                      Envoyer un code de vérification
                    </SIGADButton>
                  </form>
                  <form onSubmit={(event) => void confirmerChangementCourriel(event)} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <SIGADFormField label="Code reçu à la nouvelle adresse" hint="6 chiffres" required>
                      <SIGADInput id="compte-code-courriel" autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required value={codeCourriel} onChange={(event) => setCodeCourriel(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))} />
                    </SIGADFormField>
                    <SIGADButton variant="primary" size="sm" disabled={codeCourriel.length !== 6} type="submit" style={{ alignSelf: "flex-start" }}>
                      Confirmer la nouvelle adresse
                    </SIGADButton>
                  </form>
                </>
              ) : (
                <SIGADAlert type="info" message="La modification de l’adresse e-mail est suspendue tant que l’envoi de messages de vérification n’est pas activé. Aucune nouvelle adresse ne peut être déclarée vérifiée sans preuve." />
              )}
            </div>

            <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--sigad-border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>Sessions actives</h3>
                <SIGADButton variant="outline" size="sm" onClick={() => void revoquerAutresSessions()}>
                  Déconnecter autres
                </SIGADButton>
              </div>
              <ul className="sigad-liste-sessions" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {sessions.map((session) => (
                  <li key={session.id} style={{ padding: "0.5rem 0.75rem", background: "var(--sigad-surface-subtle)", borderRadius: "var(--sigad-radius-sm)", fontSize: "0.8125rem" }}>
                    <div style={{ fontWeight: 600, color: session.session_courante ? "var(--sigad-primary)" : "inherit" }}>
                      {session.session_courante ? "Session actuelle (cet appareil)" : session.agent_utilisateur ?? "Navigateur non identifié"}
                    </div>
                    <div style={{ color: "var(--sigad-text-muted)", fontSize: "0.75rem" }}>
                      Connectée le {formatDate(session.cree_le)} · expire le {formatDate(session.expire_le)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </SIGADCardBody>
        </SIGADCard>
      </div>
    </section>
  );
}
