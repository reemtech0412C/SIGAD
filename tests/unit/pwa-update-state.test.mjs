import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activerMiseAJourPwa,
  abonnerMiseAJourPwa,
  definirActivationMiseAJourPwa,
  lireEtatMiseAJourPwa,
  reinitialiserEtatMiseAJourPwa,
  reporterMiseAJourPwa,
  signalerMiseAJourPwaDisponible,
} from "../../frontend/src/services/pwa-update-state.ts";

describe("mise à jour contrôlée du PWA", () => {
  beforeEach(() => reinitialiserEtatMiseAJourPwa());
  afterEach(() => {
    reinitialiserEtatMiseAJourPwa();
    vi.useRealTimers();
  });

  it("signale une version en attente et la propose de nouveau après report", async () => {
    vi.useFakeTimers();
    const changements = vi.fn();
    const desabonner = abonnerMiseAJourPwa(changements);

    signalerMiseAJourPwaDisponible();
    expect(lireEtatMiseAJourPwa()).toBe(true);
    reporterMiseAJourPwa(30_000);
    expect(lireEtatMiseAJourPwa()).toBe(false);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(lireEtatMiseAJourPwa()).toBe(true);
    expect(changements).toHaveBeenCalledTimes(3);
    desabonner();
  });

  it("n’active le Worker qu’après l’action explicite sur une version disponible", async () => {
    const activation = vi.fn(async () => undefined);
    definirActivationMiseAJourPwa(activation);

    await activerMiseAJourPwa();
    expect(activation).not.toHaveBeenCalled();

    signalerMiseAJourPwaDisponible();
    await activerMiseAJourPwa();
    expect(activation).toHaveBeenCalledTimes(1);
  });
});
