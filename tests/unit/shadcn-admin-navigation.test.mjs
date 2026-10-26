import { describe, expect, it } from "vitest";
import {
  construireNavigationParRole,
  trouverContexteNavigation,
} from "../../frontend/src/components/administration/navigation-config.ts";

describe("Navigation hiérarchique Shadcn Admin par rôle", () => {
  it("expose les 7 groupes hiérarchiques A à G pour l'administration centrale", () => {
    const navCentral = construireNavigationParRole("ADMIN_CENTRAL");
    expect(navCentral.map((g) => g.codeSection)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("filtre strictement les groupes et sous-menus selon les permissions RBAC", () => {
    const navProprietaire = construireNavigationParRole("PROPRIETAIRE");
    const navCentral = construireNavigationParRole("ADMIN_CENTRAL");
    const navDelegue = construireNavigationParRole("DELEGUE_PROVINCIAL");
    const navConsultation = construireNavigationParRole("CONSULTATION_INSTITUTIONNELLE");

    const adminProp = navProprietaire.find((g) => g.codeSection === "F");
    expect(adminProp).toBeDefined();
    expect(adminProp?.sousMenus.some((e) => e.id === "admin-comptes")).toBe(true);
    expect(adminProp?.sousMenus.some((e) => e.id === "admin-donnees-test")).toBe(true);
    expect(adminProp?.sousMenus.some((e) => e.id === "admin-parametres")).toBe(true);

    const adminCentral = navCentral.find((g) => g.codeSection === "F");
    expect(adminCentral?.sousMenus.some((e) => e.id === "admin-comptes")).toBe(true);
    expect(adminCentral?.sousMenus.some((e) => e.id === "admin-donnees-test")).toBe(false);

    expect(navDelegue.some((g) => g.codeSection === "F")).toBe(false);
    expect(navDelegue.some((g) => g.codeSection === "D")).toBe(true);
    expect(navDelegue.some((g) => g.codeSection === "B")).toBe(true);
    expect(navDelegue.some((g) => g.codeSection === "C")).toBe(true);

    expect(navConsultation.some((g) => g.codeSection === "C")).toBe(false);
    expect(navConsultation.some((g) => g.codeSection === "D")).toBe(false);
    expect(navConsultation.some((g) => g.codeSection === "F")).toBe(false);
    expect(navConsultation.some((g) => g.codeSection === "A")).toBe(true);
    expect(navConsultation.some((g) => g.codeSection === "G")).toBe(true);
  });

  it("rattache les vues et notifications aux entrées réelles autorisées", () => {
    const navCentral = construireNavigationParRole("ADMIN_CENTRAL");
    const navDelegue = construireNavigationParRole("DELEGUE_PROVINCIAL");
    const navConsultation = construireNavigationParRole("CONSULTATION_INSTITUTIONNELLE");
    const menuBeneficiaires = navCentral.find((g) => g.id === "beneficiaires");
    const menuSuiviCentral = navCentral.find((g) => g.id === "suivi-controle");
    const menuSuiviDelegue = navDelegue.find((g) => g.id === "suivi-controle");

    expect(menuBeneficiaires?.sousMenus.map((element) => element.libelle)).toEqual([
      "Registre des ménages",
      "Listes de bénéficiaires",
      "Partenaires",
    ]);
    expect(menuSuiviCentral?.sousMenus.some((element) => element.id === "ctrl-notifications")).toBe(true);
    expect(menuSuiviDelegue?.sousMenus.some((element) => element.id === "ctrl-notifications")).toBe(true);
    expect(navConsultation.find((groupe) => groupe.id === "suivi-controle")?.sousMenus.some((element) => element.id === "ctrl-notifications")).toBe(false);
    expect(navCentral.flatMap((groupe) => groupe.sousMenus).every((element) => element.chemin.startsWith("/"))).toBe(true);
  });

  it("résout le contexte actif (groupeActif et sousMenuActif) à partir de l'URL complète", () => {
    const navCentral = construireNavigationParRole("ADMIN_CENTRAL");

    const ctxTerritoire = trouverContexteNavigation(
      navCentral,
      "/territoire?vue=corrections",
      "territoire",
    );
    expect(ctxTerritoire.groupeActif.codeSection).toBe("D");
    expect(ctxTerritoire.sousMenuActif.id).toBe("terr-corrections");

    const ctxBeneficiaires = trouverContexteNavigation(
      navCentral,
      "/gestion/beneficiaires?vue=partenaires",
      "beneficiaires",
    );
    expect(ctxBeneficiaires.groupeActif.codeSection).toBe("C");
    expect(ctxBeneficiaires.sousMenuActif.id).toBe("ben-partenaires");
  });
});
