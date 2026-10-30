import { useCallback, useEffect, useState } from "react";
import { requeteApi } from "../../services/api";
import { SIGADAlert, SIGADButton, SIGADCard, SIGADCardBody, SIGADCardHeader, SIGADCardSubtitle, SIGADCardTitle } from "../ui";

interface MesureSante {
  statut: string;
  latenceMs: number;
  mesureLe: string;
}

export function SanteTechnique() {
  const [mesure, setMesure] = useState<MesureSante | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const mesurer = useCallback(async () => {
    setErreur(null);
    const debut = performance.now();
    try {
      const reponse = await requeteApi<{ statut: string }>("/api/sante");
      setMesure({ statut: reponse.statut, latenceMs: Math.round(performance.now() - debut), mesureLe: new Date().toISOString() });
    } catch (cause) {
      setMesure(null);
      setErreur(cause instanceof Error ? cause.message : "La mesure de santé a échoué.");
    }
  }, []);

  useEffect(() => { void mesurer(); }, [mesurer]);

  return (
    <SIGADCard as="section" ariaLabelledby="titre-sante">
      <SIGADCardHeader>
        <div>
          <SIGADCardTitle as="h2" id="titre-sante">Santé technique</SIGADCardTitle>
          <SIGADCardSubtitle>État du service et latence mesurée depuis votre navigateur. Aucune donnée métier.</SIGADCardSubtitle>
        </div>
        <SIGADButton onClick={() => void mesurer()} type="button">Actualiser</SIGADButton>
      </SIGADCardHeader>
      <SIGADCardBody>
        {erreur && <SIGADAlert variante="danger">{erreur}</SIGADAlert>}
        {mesure && (
          <dl data-testid="sante-technique">
            <dt>Service</dt><dd>{mesure.statut}</dd>
            <dt>Latence</dt><dd>{mesure.latenceMs} ms</dd>
            <dt>Mesuré le</dt><dd>{new Date(mesure.mesureLe).toLocaleString("fr-FR")}</dd>
          </dl>
        )}
      </SIGADCardBody>
    </SIGADCard>
  );
}
