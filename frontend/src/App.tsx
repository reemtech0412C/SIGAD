import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { UtilisateurAuthentifie } from "../../shared/types/authentification";
import { ChangementMotDePasse } from "./components/connexion/ChangementMotDePasse";
import { ConfigurationMfa } from "./components/connexion/ConfigurationMfa";
import { ConnexionPage } from "./components/connexion/ConnexionPage";
import {
  SIGADAppShell,
  type ModuleAdministration,
  type VueControleAdministration,
} from "./components/administration/SIGADAppShell";
import type { VueTerritoireOperationnel } from "./components/territoire/EspaceTerritorialOperationnel";
import { ErreurApi, chargerJetonCsrf, requeteApi } from "./services/api";
import { adresseDansConsole, consolePourRole, consolesV2Active, retirerPrefixeConsole } from "./consoles/consoles-config";

const TableauBordPilote = lazy(() => import("./components/pilote/TableauBordPilote").then((module) => ({ default: module.TableauBordPilote })));
const TableauOperationsCentrales = lazy(() => import("./components/gestion/TableauOperationsCentrales").then((module) => ({ default: module.TableauOperationsCentrales })));
const TableauGestionBeneficiaires = lazy(() => import("./components/gestion/TableauGestionBeneficiaires").then((module) => ({ default: module.TableauGestionBeneficiaires })));
const TableauGestionStocks = lazy(() => import("./components/gestion/TableauGestionStocks").then((module) => ({ default: module.TableauGestionStocks })));
const TableauApprovisionnements = lazy(() => import("./components/gestion/TableauApprovisionnements").then((module) => ({ default: module.TableauApprovisionnements })));
const TableauDistributions = lazy(() => import("./components/gestion/TableauDistributions").then((module) => ({ default: module.TableauDistributions })));
const TableauControle = lazy(() => import("./components/gestion/TableauControle").then((module) => ({ default: module.TableauControle })));
const TableauRapports = lazy(() => import("./components/gestion/TableauRapports").then((module) => ({ default: module.TableauRapports })));
const TableauProprietaire = lazy(() => import("./components/proprietaire/TableauProprietaire").then((module) => ({ default: module.TableauProprietaire })));
const AdministrationTerritoriale = lazy(() => import("./components/proprietaire/AdministrationTerritoriale").then((module) => ({ default: module.AdministrationTerritoriale })));
const EspaceTerritorialOperationnel = lazy(() => import("./components/territoire/EspaceTerritorialOperationnel").then((module) => ({ default: module.EspaceTerritorialOperationnel })));
const MonCompte = lazy(() => import("./components/administration/MonCompte").then((module) => ({ default: module.MonCompte })));
const AdministrationComptes = lazy(() => import("./components/administration/AdministrationComptes").then((module) => ({ default: module.AdministrationComptes })));

interface ReponseSession {
  utilisateur: UtilisateurAuthentifie;
  expire_le: string;
}

const routes: Record<ModuleAdministration, string> = {
  dashboard: "/tableau-de-bord",
  operations: "/operations-centrales",
  beneficiaires: "/gestion/beneficiaires",
  stocks: "/stocks",
  approvisionnements: "/approvisionnements",
  distributions: "/distributions",
  territoire: "/territoire",
  controle: "/controle",
  rapports: "/rapports",
  comptes: "/administration/comptes",
  "mon-compte": "/mon-compte",
};

function moduleDepuisAdresse(
  adresse: string,
  role: UtilisateurAuthentifie["role"],
): ModuleAdministration {
  const chemin = adresse.split("?", 1)[0] ?? "/";
  if (chemin === "/ui-preview") return "dashboard";
  const module = (Object.entries(routes) as Array<[ModuleAdministration, string]>).find(
    ([, route]) => route === chemin,
  )?.[0];
  return module ?? (role === "PROPRIETAIRE" ? "comptes" : "beneficiaires");
}

function autorise(
  module: ModuleAdministration,
  role: UtilisateurAuthentifie["role"],
): boolean {
  if (module === "mon-compte") return true;
  if (module === "comptes") return role === "PROPRIETAIRE" || role === "ADMIN_CENTRAL";
  if (role === "CONSULTATION_INSTITUTIONNELLE") {
    return module === "dashboard" || module === "operations" || module === "rapports";
  }
  if (module === "beneficiaires") return role !== "PROPRIETAIRE";
  return true;
}

function adresseModule(
  module: ModuleAdministration,
  vueControle?: VueControleAdministration,
): string {
  const adresse = routes[module];
  return module === "controle" && vueControle
    ? `${adresse}?vue=${encodeURIComponent(vueControle)}`
    : adresse;
}

function vueControleDepuisAdresse(adresse: string): VueControleAdministration | null {
  const valeur = new URLSearchParams(adresse.split("?", 2)[1] ?? "").get("vue");
  const vues: VueControleAdministration[] = [
    "tableau",
    "observations",
    "corrections",
    "fermetures",
    "audit",
    "notifications",
  ];
  return valeur && vues.includes(valeur as VueControleAdministration)
    ? (valeur as VueControleAdministration)
    : null;
}

function vueTerritoireDepuisAdresse(adresse: string): VueTerritoireOperationnel {
  const valeur = new URLSearchParams(adresse.split("?", 2)[1] ?? "").get("vue");
  const vues: VueTerritoireOperationnel[] = [
    "dashboard",
    "arborescence",
    "recherche",
    "sites",
    "corrections",
  ];
  return valeur && vues.includes(valeur as VueTerritoireOperationnel)
    ? (valeur as VueTerritoireOperationnel)
    : "dashboard";
}

export default function App() {
  const [jetonCsrf, setJetonCsrf] = useState<string | null>(null);
  const [utilisateur, setUtilisateur] = useState<UtilisateurAuthentifie | null>(null);
  const [erreurDemarrage, setErreurDemarrage] = useState<string | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [adresseCourante, setAdresseCourante] = useState(
    () => `${window.location.pathname}${window.location.search}`,
  );
  const consolesV2 = consolesV2Active();
  // Avec consoles_v2, l'adresse du navigateur porte le préfixe de console; la logique interne reste historique.
  const adresseLogique = consolesV2 ? retirerPrefixeConsole(adresseCourante) : adresseCourante;
  const moduleDemande = moduleDepuisAdresse(
    adresseLogique,
    utilisateur?.role ?? "DELEGUE_PROVINCIAL",
  );
  const moduleActif =
    utilisateur && autorise(moduleDemande, utilisateur.role)
      ? moduleDemande
      : utilisateur?.role === "PROPRIETAIRE"
        ? "comptes"
        : utilisateur?.role === "CONSULTATION_INSTITUTIONNELLE"
          ? "dashboard"
          : "beneficiaires";

  useEffect(() => {
    let actif = true;
    async function initialiser(): Promise<void> {
      try {
        const jeton = await chargerJetonCsrf();
        if (actif) setJetonCsrf(jeton);
        try {
          const session = await requeteApi<ReponseSession>("/api/auth/session");
          if (actif) setUtilisateur(session.utilisateur);
        } catch (cause) {
          if (!(cause instanceof ErreurApi) || cause.statutHttp !== 401) {
            if (actif) {
              setErreurDemarrage(
                cause instanceof Error ? cause.message : "La session n’a pas pu être chargée.",
              );
            }
          }
        }
      } catch (cause) {
        if (actif) {
          setErreurDemarrage(
            cause instanceof Error ? cause.message : "Le service est momentanément indisponible.",
          );
        }
      } finally {
        if (actif) setChargement(false);
      }
    }
    void initialiser();
    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    if (consolesV2 && utilisateur) {
      const cible = adresseDansConsole(adresseCourante, utilisateur.role);
      if (cible !== adresseCourante && !utilisateur.doit_changer_mot_de_passe) {
        window.history.replaceState(null, "", cible);
        setAdresseCourante(cible);
        return;
      }
    }
    if (adresseLogique.split("?", 1)[0] === "/mon-compte") return;
    if (
      !utilisateur ||
      moduleDemande === moduleActif ||
      utilisateur.doit_changer_mot_de_passe ||
      ((utilisateur.role === "PROPRIETAIRE" || utilisateur.role === "ADMIN_CENTRAL") &&
        !utilisateur.double_facteur_actif)
    ) {
      return;
    }
    const destination = consolesV2 ? adresseDansConsole(routes[moduleActif], utilisateur.role) : routes[moduleActif];
    window.history.replaceState(null, "", destination);
    setAdresseCourante(destination);
  }, [adresseCourante, adresseLogique, consolesV2, moduleActif, moduleDemande, utilisateur]);

  useEffect(() => {
    function suivreHistorique(): void {
      setAdresseCourante(`${window.location.pathname}${window.location.search}`);
    }
    window.addEventListener("popstate", suivreHistorique);
    return () => window.removeEventListener("popstate", suivreHistorique);
  }, []);

  async function deconnexion(): Promise<void> {
    if (!jetonCsrf) return;
    setErreurAction(null);
    try {
      await requeteApi<{ message: string }>("/api/auth/deconnexion", {
        methode: "POST",
        jetonCsrf,
      });
      setUtilisateur(null);
      setJetonCsrf(await chargerJetonCsrf());
      window.history.replaceState(null, "", "/");
      setAdresseCourante("/");
    } catch (cause) {
      setErreurAction(cause instanceof Error ? cause.message : "La déconnexion a échoué.");
    }
  }

  function naviguer(
    module: ModuleAdministration,
    vueControle?: VueControleAdministration,
    cheminExplicite?: string,
  ): void {
    const historique = cheminExplicite ?? adresseModule(module, vueControle);
    const destination = consolesV2 && utilisateur ? adresseDansConsole(historique, utilisateur.role) : historique;
    if (`${window.location.pathname}${window.location.search}` !== destination) {
      window.history.pushState(null, "", destination);
    }
    setAdresseCourante(destination);
  }

  function ouvrirMonCompte(): void {
    const destination = consolesV2 && utilisateur ? adresseDansConsole("/mon-compte", utilisateur.role) : "/mon-compte";
    if (`${window.location.pathname}${window.location.search}` !== destination) {
      window.history.pushState(null, "", destination);
    }
    setAdresseCourante(destination);
  }

  if (chargement) {
    return (
      <main className="ecran-attente">
        <p>Chargement de votre espace sécurisé…</p>
      </main>
    );
  }
  if (erreurDemarrage) {
    return (
      <main className="ecran-attente">
        <p className="message-erreur">{erreurDemarrage}</p>
      </main>
    );
  }
  if (!jetonCsrf) {
    return (
      <main className="ecran-attente">
        <p className="message-erreur">Le contrôle de sécurité n’a pas pu être initialisé.</p>
      </main>
    );
  }
  if (!utilisateur) return <ConnexionPage jetonCsrf={jetonCsrf} onConnexion={setUtilisateur} />;
  if (utilisateur.doit_changer_mot_de_passe) {
    return (
      <ChangementMotDePasse
        jetonCsrf={jetonCsrf}
        onModification={() => setUtilisateur({ ...utilisateur, doit_changer_mot_de_passe: false })}
      />
    );
  }
  if (
    (utilisateur.role === "PROPRIETAIRE" ||
      utilisateur.role === "ADMIN_CENTRAL" ||
      utilisateur.role === "CONSULTATION_INSTITUTIONNELLE") &&
    !utilisateur.double_facteur_actif
  ) {
    return (
      <ConfigurationMfa
        jetonCsrf={jetonCsrf}
        onActivation={() => setUtilisateur({ ...utilisateur, double_facteur_actif: true })}
      />
    );
  }

  if (adresseLogique.split("?", 1)[0] === "/mon-compte") {
    return (
      <SIGADAppShell
        adresseCourante={adresseLogique}
        erreur={erreurAction}
        moduleActif="mon-compte"
        consoleActive={consolesV2 ? consolePourRole(utilisateur.role) : undefined}
      onDeconnexion={deconnexion}
        onMonCompte={ouvrirMonCompte}
        onNaviguer={naviguer}
        utilisateur={utilisateur}
      >
        <Suspense fallback={<p className="sigad-admin__attente">Chargement de votre compte…</p>}>
          <MonCompte jetonCsrf={jetonCsrf} />
        </Suspense>
      </SIGADAppShell>
    );
  }

  const vueControleInitiale = vueControleDepuisAdresse(adresseLogique) ?? undefined;
  let contenu: ReactNode;
  switch (moduleActif) {
    case "dashboard":
      contenu = <TableauBordPilote utilisateur={utilisateur} />;
      break;
    case "operations":
      contenu = <TableauOperationsCentrales utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "beneficiaires":
      contenu = <TableauGestionBeneficiaires utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "stocks":
      contenu = <TableauGestionStocks utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "approvisionnements":
      contenu = <TableauApprovisionnements utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "distributions":
      contenu = <TableauDistributions utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "territoire":
      contenu =
        utilisateur.role === "PROPRIETAIRE" ? (
          <div className="contenu-tableau">
            <AdministrationTerritoriale jetonCsrf={jetonCsrf} />
          </div>
        ) : (
          <EspaceTerritorialOperationnel
            utilisateur={utilisateur}
            jetonCsrf={jetonCsrf}
            vueInitiale={vueTerritoireDepuisAdresse(adresseLogique)}
          />
        );
      break;
    case "controle":
      contenu = (
        <TableauControle
          utilisateur={utilisateur}
          jetonCsrf={jetonCsrf}
          vueInitiale={vueControleInitiale}
        />
      );
      break;
    case "rapports":
      contenu = <TableauRapports utilisateur={utilisateur} jetonCsrf={jetonCsrf} />;
      break;
    case "comptes":
    case "mon-compte":
      contenu =
        utilisateur.role === "PROPRIETAIRE" ? (
          <TableauProprietaire jetonCsrf={jetonCsrf} />
        ) : (
          <AdministrationComptes jetonCsrf={jetonCsrf} />
        );
      break;
  }

  const cleInterface = `${moduleActif}:${adresseCourante}`;
  return (
    <SIGADAppShell
      adresseCourante={adresseLogique}
      erreur={erreurAction}
      key={cleInterface}
      moduleActif={moduleActif}
      consoleActive={consolesV2 ? consolePourRole(utilisateur.role) : undefined}
      onDeconnexion={deconnexion}
      onMonCompte={ouvrirMonCompte}
      onNaviguer={naviguer}
      utilisateur={utilisateur}
    >
      <Suspense fallback={<p className="sigad-admin__attente" role="status">Chargement du module…</p>}>
        {contenu}
      </Suspense>
    </SIGADAppShell>
  );
}
