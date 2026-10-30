/**
 * SIGAD — AppShell institutionnel à navigation supérieure exclusive.
 * Les groupes et leurs routes sont fournis par navigation-config et filtrés par rôle.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { UtilisateurAuthentifie } from "../../../../shared/types/authentification";
import { SIGADIcon } from "../ui/SIGADIcon";
import {
  construireNavigationParRole,
  trouverContexteNavigation,
  type GroupeMenuNavigation,
  type ModuleAdministration,
  type SousMenuNavigation,
  type VueControleAdministration,
} from "./navigation-config";
import "../pilote/tableau-bord-pilote.css";
import "./sigad-app-shell.css";
import "../../consoles/consoles.css";
import { LIBELLES_CONSOLES, type ConsoleSIGAD } from "../../consoles/consoles-config";
import { SIGADPwaUpdateNotice } from "./SIGADPwaUpdateNotice";

export type { ModuleAdministration, VueControleAdministration };

interface ElementMenu {
  libelle: string;
  module: ModuleAdministration;
  vueControle?: VueControleAdministration;
  chemin?: string;
}

interface Props {
  utilisateur: UtilisateurAuthentifie;
  moduleActif: ModuleAdministration;
  adresseCourante?: string;
  consoleActive?: ConsoleSIGAD | undefined;
  onNaviguer: (
    module: ModuleAdministration,
    vueControle?: VueControleAdministration,
    cheminExplicite?: string,
  ) => void;
  onDeconnexion: () => Promise<void>;
  onMonCompte: () => void;
  erreur?: string | null;
  children: ReactNode;
}

function roleLibelle(role: UtilisateurAuthentifie["role"]): string {
  if (role === "PROPRIETAIRE") return "Propriétaire";
  if (role === "ADMIN_CENTRAL") return "Administration centrale";
  if (role === "CONSULTATION_INSTITUTIONNELLE") return "Consultation institutionnelle";
  if (role === "RESPONSABLE_STOCK") return "Responsable des stocks";
  if (role === "SUPERVISEUR_TERRAIN") return "Superviseur de terrain";
  if (role === "AGENT_DISTRIBUTION") return "Agent de distribution";
  return "Délégation provinciale";
}

export function SIGADAppShell({
  utilisateur,
  moduleActif,
  adresseCourante: adresseProp,
  consoleActive,
  onNaviguer,
  onDeconnexion,
  onMonCompte,
  erreur,
  children,
}: Props) {
  const adresseCourante = adresseProp ??
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/tableau-de-bord");
  const [modeSombre, setModeSombre] = useState(() => {
    try { return window.localStorage.getItem("sigad-theme") !== "clair"; }
    catch { return true; }
  });
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const [groupeMenuOuvert, setGroupeMenuOuvert] = useState<GroupeMenuNavigation["id"] | null>(null);
  const [menuNotificationsOuvert, setMenuNotificationsOuvert] = useState(false);
  const [menuProfilOuvert, setMenuProfilOuvert] = useState(false);

  const racineRef = useRef<HTMLDivElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const declencheurMobileRef = useRef<HTMLButtonElement>(null);
  const declencheursGroupesRef = useRef(new Map<string, HTMLButtonElement>());
  const panneauxGroupesRef = useRef(new Map<string, HTMLDivElement>());
  const groupeARefocaliserRef = useRef<string | null>(null);
  const ancreNotificationsRef = useRef<HTMLDivElement>(null);
  const declencheurNotificationsRef = useRef<HTMLButtonElement>(null);
  const ancreProfilRef = useRef<HTMLDivElement>(null);
  const declencheurProfilRef = useRef<HTMLButtonElement>(null);

  const groupesNavigation = useMemo(
    () => construireNavigationParRole(utilisateur.role, { consolePlateforme: consoleActive === "plateforme" }),
    [utilisateur.role, consoleActive],
  );
  const groupesPrincipaux = groupesNavigation.filter((groupe) => groupe.id !== "mon-espace");
  const groupeCompte = groupesNavigation.find((groupe) => groupe.id === "mon-espace");
  const { groupeActif, sousMenuActif } = useMemo(
    () => trouverContexteNavigation(groupesNavigation, adresseCourante, moduleActif),
    [groupesNavigation, adresseCourante, moduleActif],
  );
  const peutVoirNotifications = groupesNavigation.some((groupe) =>
    groupe.sousMenus.some((sousMenu) => sousMenu.id === "ctrl-notifications"),
  );

  useLayoutEffect(() => {
    const id = groupeARefocaliserRef.current;
    if (!id || groupeMenuOuvert !== id) return;
    groupeARefocaliserRef.current = null;
    panneauxGroupesRef.current.get(id)?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [groupeMenuOuvert]);
  const libellePerimetre = utilisateur.role === "CONSULTATION_INSTITUTIONNELLE"
    ? utilisateur.perimetre_consultation === "NATIONAL"
      ? "Consultation nationale autorisée"
      : utilisateur.perimetre_consultation === "PROVINCIAL"
        ? "Consultation provinciale autorisée"
        : `Consultation de ${utilisateur.provinces_autorisees?.length ?? 0} provinces autorisées`
    : utilisateur.province_id
      ? `Périmètre provincial · ${utilisateur.province_id}`
      : "Périmètre national autorisé";

  useEffect(() => {
    try { window.localStorage.setItem("sigad-theme", modeSombre ? "sombre" : "clair"); }
    catch { /* Le thème reste utilisable lorsque le stockage local est indisponible. */ }
  }, [modeSombre]);

  function fermerMenus(): void {
    setMenuMobileOuvert(false);
    setGroupeMenuOuvert(null);
    setMenuNotificationsOuvert(false);
    setMenuProfilOuvert(false);
  }

  useEffect(() => {
    function fermerAuClicExterieur(event: PointerEvent): void {
      if (!(event.target instanceof Node)) return;
      const cible = event.target;
      if (!racineRef.current?.contains(cible)) {
        fermerMenus();
        return;
      }
      if (!navigationRef.current?.contains(cible) && !declencheurMobileRef.current?.contains(cible)) {
        setGroupeMenuOuvert(null);
        setMenuMobileOuvert(false);
      }
      if (!ancreNotificationsRef.current?.contains(cible)) setMenuNotificationsOuvert(false);
      if (!ancreProfilRef.current?.contains(cible)) setMenuProfilOuvert(false);
    }
    document.addEventListener("pointerdown", fermerAuClicExterieur);
    return () => document.removeEventListener("pointerdown", fermerAuClicExterieur);
  }, []);

  function naviguer(element: ElementMenu): void {
    fermerMenus();
    if (element.module === "mon-compte" && !element.chemin) {
      onMonCompte();
      return;
    }
    onNaviguer(element.module, element.vueControle, element.chemin);
  }

  function naviguerSousMenu(sousMenu: SousMenuNavigation): void {
    fermerMenus();
    if (sousMenu.module === "mon-compte" && sousMenu.chemin === "/mon-compte") {
      onMonCompte();
      return;
    }
    onNaviguer(sousMenu.module, undefined, sousMenu.chemin);
  }

  function basculerGroupe(groupe: GroupeMenuNavigation): void {
    setMenuNotificationsOuvert(false);
    setMenuProfilOuvert(false);
    setGroupeMenuOuvert((ouvert) => ouvert === groupe.id ? null : groupe.id);
  }

  function gererClavier(event: KeyboardEvent<HTMLDivElement>): void {
    const cible = event.target;
    if (!(cible instanceof HTMLElement)) return;

    if (event.key === "Escape") {
      if (menuMobileOuvert) {
        event.preventDefault();
        fermerMenus();
        declencheurMobileRef.current?.focus();
      } else if (groupeMenuOuvert) {
        event.preventDefault();
        const id = groupeMenuOuvert;
        setGroupeMenuOuvert(null);
        declencheursGroupesRef.current.get(id)?.focus();
      } else if (menuNotificationsOuvert) {
        event.preventDefault();
        setMenuNotificationsOuvert(false);
        declencheurNotificationsRef.current?.focus();
      } else if (menuProfilOuvert) {
        event.preventDefault();
        setMenuProfilOuvert(false);
        declencheurProfilRef.current?.focus();
      }
      return;
    }

    const declencheurGroupe = cible.closest<HTMLButtonElement>("button[data-navigation-group]");
    if (declencheurGroupe && event.key === "ArrowDown") {
      const id = declencheurGroupe.dataset.navigationGroup;
      if (!id) return;
      const groupe = groupesPrincipaux.find((item) => item.id === id);
      if (!groupe) return;
      event.preventDefault();
      if (groupeMenuOuvert === groupe.id) {
        panneauxGroupesRef.current.get(groupe.id)?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        return;
      }
      groupeARefocaliserRef.current = groupe.id;
      setGroupeMenuOuvert(groupe.id);
      return;
    }

    if (declencheurGroupe && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const declencheursVisibles = Array.from(
        navigationRef.current?.querySelectorAll<HTMLButtonElement>("button[data-navigation-group]") ?? [],
      ).filter((element) => element.offsetParent !== null);
      const index = declencheursVisibles.indexOf(declencheurGroupe);
      if (index >= 0 && declencheursVisibles.length > 1) {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        declencheursVisibles[(index + direction + declencheursVisibles.length) % declencheursVisibles.length]?.focus();
      }
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const menu = cible.closest<HTMLElement>('[role="menu"]');
    if (!menu) return;
    const elements = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .filter((element) => element.offsetParent !== null);
    const elementActif = cible.closest<HTMLElement>('[role="menuitem"]');
    const index = elementActif ? elements.indexOf(elementActif) : -1;
    if (index < 0 || !elements.length) return;
    const suivant = event.key === "Home"
      ? 0
      : event.key === "End"
        ? elements.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % elements.length
          : (index - 1 + elements.length) % elements.length;
    event.preventDefault();
    elements[suivant]?.focus();
  }

  function titreMenu(groupe: GroupeMenuNavigation): string {
    return groupe.id === "administration" && utilisateur.role === "PROPRIETAIRE"
      ? "Administration du système"
      : groupe.libelle;
  }

  return (
    <div
      className={`sigad-preview sigad-admin sigad-app-shell${modeSombre ? " sigad-preview--sombre sigad-admin--sombre" : ""}`}
      data-console={consoleActive}
      onKeyDown={gererClavier}
      ref={racineRef}
    >
      {consoleActive && (
        <div className="sigad-console-bandeau" role="note">
          <strong>{LIBELLES_CONSOLES[consoleActive].titre}</strong>
          <span>{LIBELLES_CONSOLES[consoleActive].description}</span>
        </div>
      )}
      <header className="sigad-app-header">
        <div className="sigad-preview__entete-institutionnelle sigad-app-masthead">
          <div className="sigad-app-masthead__marque">
            <a
              aria-label="Système Intégré de Gestion et de Distribution des Aides — ouvrir le tableau de bord"
              className="sigad-app-brand"
              href="/tableau-de-bord"
              onClick={(event) => {
                event.preventDefault();
                naviguer({ libelle: "Tableau de bord", module: "dashboard", chemin: "/tableau-de-bord" });
              }}
            >
              <span className="sigad-app-brand__logo"><img src="/images/sigad-logo.png" alt="Logo SIGAD" /></span>
              <span className="sigad-app-brand__identity"><strong>Système Intégré de Gestion et de Distribution des Aides</strong></span>
            </a>
          </div>

          <div className="sigad-preview__actions-entete sigad-app-header__actions">
            <button
              aria-expanded={menuMobileOuvert}
              aria-label={menuMobileOuvert ? "Fermer le menu principal" : "Ouvrir le menu principal"}
              className="sigad-preview__bouton-icone sigad-preview__bouton-menu-mobile"
              onClick={() => {
                setGroupeMenuOuvert(null);
                setMenuMobileOuvert((ouvert) => !ouvert);
                setMenuNotificationsOuvert(false);
                setMenuProfilOuvert(false);
              }}
              ref={declencheurMobileRef}
              type="button"
            >
              <SIGADIcon nom={menuMobileOuvert ? "x" : "menu"} taille={18} />
            </button>
            <span className="sigad-preview__badge-session" title={libellePerimetre}>
              <span className="sigad-preview__badge-session-point" />{libellePerimetre}
            </span>

            {peutVoirNotifications && (
              <div className="sigad-preview__menu-ancre" ref={ancreNotificationsRef}>
                <button
                  aria-expanded={menuNotificationsOuvert}
                  aria-haspopup="menu"
                  aria-label="Notifications"
                  className="sigad-preview__bouton-icone"
                  onClick={(event) => {
                    setGroupeMenuOuvert(null);
                    setMenuProfilOuvert(false);
                    setMenuNotificationsOuvert((ouvert) => !ouvert);
                    event.currentTarget.focus();
                  }}
                  ref={declencheurNotificationsRef}
                  type="button"
                >
                  <SIGADIcon nom="bell" taille={18} />
                </button>
                {menuNotificationsOuvert && (
                  <div aria-label="Notifications" className="sigad-preview__menu-liste sigad-preview__menu-liste--droite" role="menu">
                    <p className="sigad-preview__menu-entete">Suivi de votre périmètre</p>
                    <button
                      onClick={() => naviguer({ libelle: "Notifications", module: "controle", vueControle: "notifications" })}
                      role="menuitem"
                      type="button"
                    >
                      Ouvrir les notifications
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              aria-label={modeSombre ? "Activer le mode clair" : "Activer le mode sombre"}
              className="sigad-preview__bouton-icone"
              onClick={() => setModeSombre((sombre) => !sombre)}
              type="button"
            >
              <SIGADIcon nom={modeSombre ? "sun" : "moon"} taille={18} />
            </button>

            <div className="sigad-preview__menu-ancre" ref={ancreProfilRef}>
              <button
                aria-current={groupeActif.id === "mon-espace" ? "page" : undefined}
                aria-expanded={menuProfilOuvert}
                aria-haspopup="menu"
                className="sigad-preview__profil-declencheur sigad-app-profile-trigger"
                onClick={() => {
                  setGroupeMenuOuvert(null);
                  setMenuNotificationsOuvert(false);
                  setMenuProfilOuvert((ouvert) => !ouvert);
                }}
                ref={declencheurProfilRef}
                type="button"
              >
                <span className="sigad-preview__profil-identite"><strong>{utilisateur.nom_complet}</strong><small>{roleLibelle(utilisateur.role)}</small></span>
                <span className="sigad-preview__avatar sigad-preview__avatar--entete">{utilisateur.nom_complet.trim().charAt(0).toLocaleUpperCase("fr-FR")}</span>
                <SIGADIcon nom="chevron-down" taille={16} />
              </button>
              {menuProfilOuvert && (
                <div aria-label="Mon compte" className="sigad-preview__menu-liste sigad-preview__menu-liste--droite" role="menu">
                  <p className="sigad-preview__menu-entete">{utilisateur.nom_complet}<small>{roleLibelle(utilisateur.role)}</small></p>
                  {groupeCompte?.sousMenus.map((sousMenu) => (
                    <button
                      aria-current={sousMenu.id === sousMenuActif.id ? "page" : undefined}
                      key={sousMenu.id}
                      onClick={() => naviguerSousMenu(sousMenu)}
                      role="menuitem"
                      type="button"
                    >
                      <SIGADIcon nom={sousMenu.icone} taille={15} />{sousMenu.libelle}
                    </button>
                  ))}
                  <button
                    className="sigad-app-profile-trigger__logout"
                    onClick={() => { fermerMenus(); void onDeconnexion(); }}
                    role="menuitem"
                    type="button"
                  >
                    <SIGADIcon nom="log-out" taille={16} />Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav
          aria-label="Navigation principale"
          className={`sigad-top-navigation${menuMobileOuvert ? " sigad-top-navigation--mobile-open" : ""}`}
          ref={navigationRef}
        >
          <div className="sigad-top-navigation__groups">
            {groupesPrincipaux.map((groupe) => {
              const ouvert = groupeMenuOuvert === groupe.id;
              const actif = groupeActif.id === groupe.id;
              const idPanneau = `navigation-menu-${groupe.id}`;
              return (
                <div className={`sigad-top-navigation__group${actif ? " sigad-top-navigation__group--active" : ""}${ouvert ? " sigad-top-navigation__group--open" : ""}`} key={groupe.id}>
                  <button
                    aria-controls={idPanneau}
                    aria-current={actif ? "page" : undefined}
                    aria-expanded={ouvert}
                    aria-haspopup="menu"
                    className="sigad-top-navigation__trigger"
                    data-navigation-group={groupe.id}
                    onClick={() => basculerGroupe(groupe)}
                    ref={(node) => {
                      if (node) declencheursGroupesRef.current.set(groupe.id, node);
                      else declencheursGroupesRef.current.delete(groupe.id);
                    }}
                    type="button"
                  >
                    <SIGADIcon nom={groupe.icone} taille={17} />
                    <span>{titreMenu(groupe)}</span>
                    <SIGADIcon className="sigad-top-navigation__chevron" nom="chevron-down" taille={14} />
                  </button>
                  <div
                    aria-label={titreMenu(groupe)}
                    className={`sigad-top-navigation__panel${groupe.sousMenus.length >= 4 ? " sigad-top-navigation__panel--mega" : ""}`}
                    hidden={!ouvert}
                    id={idPanneau}
                    ref={(node) => {
                      if (node) panneauxGroupesRef.current.set(groupe.id, node);
                      else panneauxGroupesRef.current.delete(groupe.id);
                    }}
                    role="menu"
                  >
                    {groupe.sousMenus.map((sousMenu) => {
                      const estActif = groupeActif.id === groupe.id && sousMenu.id === sousMenuActif.id;
                      return (
                        <button
                          aria-current={estActif ? "page" : undefined}
                          className="sigad-top-navigation__item"
                          key={sousMenu.id}
                          onClick={() => naviguerSousMenu(sousMenu)}
                          role="menuitem"
                          type="button"
                        >
                          <span className="sigad-top-navigation__item-icon"><SIGADIcon nom={sousMenu.icone} taille={16} /></span>
                          <span className="sigad-top-navigation__item-copy"><strong>{sousMenu.libelle}</strong>{sousMenu.badge && <small>{sousMenu.badge}</small>}</span>
                          <SIGADIcon className="sigad-top-navigation__item-arrow" nom="chevron-right" taille={14} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </header>

      <SIGADPwaUpdateNotice />

      <div className="sigad-workspace">
        <main className="sigad-admin__zone-contenu" id="contenu-principal">
          {erreur && <p className="message-erreur bandeau-erreur sigad-admin__alerte" role="alert">{erreur}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
