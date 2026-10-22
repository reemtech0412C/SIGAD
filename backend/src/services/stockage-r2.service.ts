export type OptionEcritureR2 = R2PutOptions;
export type ContenuEcritureR2 = ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob;

export interface ParametresEcritureR2 {
  bucket: Pick<R2Bucket, "put" | "delete">;
  cle: string;
  contenu: ContenuEcritureR2;
  options: OptionEcritureR2;
  referenceDejaPresente: () => Promise<boolean>;
  enregistrerReference: () => Promise<unknown>;
  televerserObjet: boolean;
  signalerNettoyageImpossible?: (phase: "verification" | "suppression", erreur: unknown) => void;
}

export interface ObjetArchiveR2 {
  key: string;
  uploaded: Date;
  size: number;
}

export interface ResultatReconciliationArchivesR2 {
  supprimees: number;
  echec: number;
  verifiees: number;
}

export function repererArchivesOrphelines(
  objets: readonly ObjetArchiveR2[],
  referencesD1: ReadonlySet<string>,
  dateLimiteSecurite: number,
): ObjetArchiveR2[] {
  return objets.filter((objet) => objet.uploaded.getTime() <= dateLimiteSecurite && !referencesD1.has(objet.key));
}

export async function supprimerArchivesOrphelinesR2(parametres: {
  bucket: Pick<R2Bucket, "delete">;
  objets: readonly ObjetArchiveR2[];
  referencesD1: ReadonlySet<string>;
  dateLimiteSecurite: number;
  referenceDejaPresente: (cle: string) => Promise<boolean>;
  signalerEchec?: (cle: string, erreur: unknown) => void;
}): Promise<ResultatReconciliationArchivesR2> {
  const orphelines = repererArchivesOrphelines(
    parametres.objets,
    parametres.referencesD1,
    parametres.dateLimiteSecurite,
  );
  let supprimees = 0;
  let echec = 0;
  for (const objet of orphelines) {
    try {
      if (await parametres.referenceDejaPresente(objet.key)) continue;
      await parametres.bucket.delete(objet.key);
      supprimees += 1;
    } catch (erreur) {
      echec += 1;
      parametres.signalerEchec?.(objet.key, erreur);
    }
  }
  return { supprimees, echec, verifiees: orphelines.length };
}

export async function televerserPuisReferencerR2(parametres: ParametresEcritureR2): Promise<void> {
  if (parametres.televerserObjet) {
    await parametres.bucket.put(parametres.cle, parametres.contenu, parametres.options);
  }

  try {
    await parametres.enregistrerReference();
  } catch (erreurReference) {
    let referencePresente = true;
    try {
      referencePresente = await parametres.referenceDejaPresente();
    } catch (erreurVerification) {
      parametres.signalerNettoyageImpossible?.("verification", erreurVerification);
    }

    if (parametres.televerserObjet && !referencePresente) {
      try {
        await parametres.bucket.delete(parametres.cle);
      } catch (erreurSuppression) {
        parametres.signalerNettoyageImpossible?.("suppression", erreurSuppression);
      }
    }
    throw erreurReference;
  }
}
