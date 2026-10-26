import { useEffect, useState, type FormEvent } from "react";
import { requeteApi } from "../../services/api";
import { SIGADAlert, SIGADButton, SIGADFormField, SIGADInput, SIGADSelect } from "../ui";

interface ProvinceOption {
  id: string;
  nom: string;
}

interface Props {
  jetonCsrf: string;
  onRetour: () => void;
}

export function InscriptionDelegue({ jetonCsrf, onRetour }: Props) {
  const [provinces, setProvinces] = useState<ProvinceOption[]>([]);
  const [livraisonCourrielActive, setLivraisonCourrielActive] = useState(false);
  const [verificationCourrielActive, setVerificationCourrielActive] = useState(false);
  const [etape, setEtape] = useState<"formulaire" | "demande_existante" | "verification" | "confirmation">("formulaire");
  const [nom, setNom] = useState("");
  const [provinceId, setProvinceId] = useState("");
  const [courriel, setCourriel] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    let actif = true;
    void requeteApi<{ elements: ProvinceOption[]; livraison_courriel_active: boolean; verification_courriel_active: boolean }>("/api/inscriptions/delegues/provinces")
      .then((reponse) => {
        if (actif) {
          setProvinces(reponse.elements);
          setLivraisonCourrielActive(reponse.livraison_courriel_active);
          setVerificationCourrielActive(reponse.verification_courriel_active);
        }
      })
      .catch(() => { if (actif) setErreur("La liste des provinces n’a pas pu être chargée."); });
    return () => { actif = false; };
  }, []);

  async function soumettre(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setMessage(null);
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setChargement(true);
    try {
      const resultat = await requeteApi<{ message: string; reference?: string; verification_requise: boolean }>("/api/inscriptions/delegues", {
        methode: "POST", jetonCsrf,
        corps: { nom_complet: nom, province_id: provinceId, courriel, telephone,
          mot_de_passe: motDePasse, confirmation_mot_de_passe: confirmation },
      });
      if (resultat.verification_requise && resultat.reference) {
        setReference(resultat.reference);
        setEtape("verification");
        setMessage("Si votre adresse peut être utilisée, un code à six chiffres a été envoyé. Il expire dans cinq minutes.");
      } else {
        setEtape("confirmation");
        setMessage(resultat.message);
      }
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La demande n’a pas pu être enregistrée.");
    } finally {
      setChargement(false);
    }
  }

  async function verifier(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/inscriptions/delegues/verifier-courriel", {
        methode: "POST", jetonCsrf,
        corps: reference ? { inscription_id: reference, code } : { courriel, code },
      });
      setMessage(resultat.message);
      setEtape("confirmation");
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "La vérification n’a pas abouti.");
    } finally {
      setChargement(false);
    }
  }

  async function renvoyerCode(): Promise<void> {
    setErreur(null);
    setChargement(true);
    try {
      const resultat = await requeteApi<{ message: string }>("/api/inscriptions/delegues/renvoyer-code", {
        methode: "POST", jetonCsrf, corps: { courriel },
      });
      setMessage(resultat.message);
      setReference("");
      setCode("");
      setEtape("verification");
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Le code n’a pas pu être renvoyé.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <section className="carte-connexion" aria-labelledby="titre-inscription">
      <div className="marque-sigad"><img src="/images/sigad-logo.png" alt="SIGAD" /></div>
      <h1 id="titre-inscription" style={{ color: "var(--sigad-primary-dark)", marginBottom: "0.5rem" }}>
        {etape === "formulaire" ? "Créer un compte délégué" : etape === "demande_existante" || etape === "verification" ? "Vérifier votre adresse e-mail" : "Demande enregistrée"}
      </h1>
      <p className="texte-secondaire" style={{ marginBottom: "1rem" }}>
        L’accès aux données provinciales reste soumis à l’approbation de l’administration centrale.
      </p>

      {etape === "formulaire" && !livraisonCourrielActive && (
        <SIGADAlert
          type="info"
          message="L’envoi d’e-mails est temporairement désactivé. Votre adresse restera non vérifiée et l’administration centrale procédera à une vérification indépendante de votre identité avant toute approbation."
          style={{ marginBottom: "1rem" }}
        />
      )}
      {etape === "formulaire" && livraisonCourrielActive && !verificationCourrielActive && (
        <SIGADAlert
          type="danger"
          message="La vérification par e-mail est activée mais sa configuration n’est pas complète. Aucune inscription ne peut être envoyée pour le moment."
          style={{ marginBottom: "1rem" }}
        />
      )}

      {erreur && <SIGADAlert type="danger" message={erreur} style={{ marginBottom: "1rem" }} />}
      {message && <SIGADAlert type="success" message={message} style={{ marginBottom: "1rem" }} />}

      {etape === "formulaire" ? (
        <form onSubmit={(event) => void soumettre(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SIGADFormField label="Nom complet du délégué" required>
            <SIGADInput id="inscription-nom" autoComplete="name" maxLength={160} required value={nom} onChange={(event) => setNom(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Province d'affectation" required>
            <SIGADSelect id="inscription-province" required value={provinceId} onChange={(event) => setProvinceId(event.currentTarget.value)}>
              <option value="">Sélectionner une province</option>
              {provinces.map((province) => <option key={province.id} value={province.id}>{province.nom}</option>)}
            </SIGADSelect>
          </SIGADFormField>
          <SIGADFormField label="Adresse e-mail institutionnelle" required>
            <SIGADInput id="inscription-courriel" autoComplete="email" maxLength={254} required type="email" value={courriel} onChange={(event) => setCourriel(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Numéro de téléphone" required>
            <SIGADInput id="inscription-telephone" autoComplete="tel" maxLength={30} required type="tel" value={telephone} onChange={(event) => setTelephone(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Mot de passe" hint="12 caractères minimum, avec majuscule, minuscule et chiffre." required>
            <SIGADInput id="inscription-mot-de-passe" autoComplete="new-password" minLength={12} required type="password" value={motDePasse} onChange={(event) => setMotDePasse(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADFormField label="Confirmation du mot de passe" required>
            <SIGADInput id="inscription-confirmation" autoComplete="new-password" minLength={12} required type="password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} />
          </SIGADFormField>

          <SIGADButton
            variant="primary"
            size="lg"
            disabled={provinces.length === 0 || (livraisonCourrielActive && !verificationCourrielActive)}
            loading={chargement}
            type="submit"
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {chargement ? "Envoi en cours…" : "Continuer"}
          </SIGADButton>

          {verificationCourrielActive && (
            <SIGADButton
              variant="ghost"
              size="sm"
              disabled={chargement}
              onClick={() => { setErreur(null); setMessage(null); setCourriel(""); setReference(""); setEtape("demande_existante"); }}
              style={{ width: "100%" }}
            >
              J’ai déjà une demande et souhaite vérifier mon adresse
            </SIGADButton>
          )}
        </form>
      ) : etape === "demande_existante" ? (
        <form onSubmit={(event) => { event.preventDefault(); void renvoyerCode(); }} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="texte-secondaire">
            Saisissez l’adresse utilisée pour votre demande. Si une demande admissible existe, un code de vérification sera envoyé. Cette vérification ne vaut pas approbation administrative.
          </p>
          <SIGADFormField label="Adresse e-mail de la demande" required>
            <SIGADInput id="inscription-courriel-existant" autoComplete="email" maxLength={254} required type="email" value={courriel} onChange={(event) => setCourriel(event.currentTarget.value)} />
          </SIGADFormField>
          <SIGADButton
            variant="primary"
            size="lg"
            loading={chargement}
            type="submit"
            style={{ width: "100%" }}
          >
            {chargement ? "Envoi en cours…" : "Envoyer un code"}
          </SIGADButton>
        </form>
      ) : etape === "verification" ? (
        <form onSubmit={(event) => void verifier(event)} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p className="texte-secondaire">
            Si une demande admissible existe, un code a été envoyé à <strong>{courriel}</strong>. La vérification de l’adresse ne donne pas accès à SIGAD et ne remplace pas l’approbation administrative.
          </p>
          <SIGADFormField label="Code de vérification (6 chiffres)" required>
            <SIGADInput
              id="inscription-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={code}
              onChange={(event) => setCode(event.currentTarget.value.replace(/\D/gu, "").slice(0, 6))}
              style={{ letterSpacing: "4px", fontSize: "1.25rem", textAlign: "center" }}
            />
          </SIGADFormField>
          <SIGADButton
            variant="primary"
            size="lg"
            disabled={code.length !== 6}
            loading={chargement}
            type="submit"
            style={{ width: "100%" }}
          >
            {chargement ? "Vérification en cours…" : "Vérifier l’adresse"}
          </SIGADButton>
          <SIGADButton
            variant="outline"
            size="md"
            disabled={chargement}
            onClick={() => void renvoyerCode()}
            style={{ width: "100%" }}
          >
            Renvoyer le code
          </SIGADButton>
        </form>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SIGADAlert type="success" message={message ?? "Votre demande est enregistrée."} />
          {!livraisonCourrielActive && (
            <p className="texte-secondaire">
              L’adresse e-mail est <strong>non vérifiée</strong>. La demande ne donne aucun accès à SIGAD avant la décision de l’administration centrale.
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <SIGADButton variant="ghost" size="sm" onClick={onRetour}>
          ← Retour à la connexion
        </SIGADButton>
      </div>
    </section>
  );
}
