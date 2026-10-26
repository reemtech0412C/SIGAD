const operationsPermises = new Set([
  "ALTER", "ANALYZE", "ATTACH", "BEGIN", "COMMIT", "CREATE", "DELETE", "DETACH",
  "DROP", "INSERT", "PRAGMA", "REINDEX", "RELEASE", "REPLACE", "ROLLBACK", "SAVEPOINT",
  "SELECT", "UPDATE", "VACUUM", "AUTRE",
]);

function operationSql(mots) {
  const premier = mots[0]?.toUpperCase() ?? "AUTRE";
  return operationsPermises.has(premier) ? premier : "AUTRE";
}

export function decouperInstructionsSql(texte) {
  const instructions = [];
  let debut = 0;
  let ligne = 1;
  let ligneDebut = 1;
  let guillemet = "";
  let commentaireLigne = false;
  let commentaireBloc = false;
  let mots = [];
  let declencheur = false;
  let corpsDeclencheur = false;
  let profondeursCase = 0;
  let instructionContientDuCode = false;

  const marquerCode = () => {
    if (!instructionContientDuCode) ligneDebut = ligne;
    instructionContientDuCode = true;
  };

  const finaliser = (fin) => {
    const sql = texte.slice(debut, fin).trim();
    if (instructionContientDuCode && sql.length > 0) {
      instructions.push({ sql, ligne: ligneDebut, operation: operationSql(mots) });
    }
    debut = fin;
    ligneDebut = ligne;
    mots = [];
    declencheur = false;
    corpsDeclencheur = false;
    profondeursCase = 0;
    instructionContientDuCode = false;
  };

  for (let index = 0; index < texte.length; index += 1) {
    const caractere = texte[index];
    const suivant = texte[index + 1] ?? "";

    if (caractere === "\n") ligne += 1;

    if (commentaireLigne) {
      if (caractere === "\n") commentaireLigne = false;
      continue;
    }
    if (commentaireBloc) {
      if (caractere === "*" && suivant === "/") {
        commentaireBloc = false;
        index += 1;
      }
      continue;
    }
    if (guillemet !== "") {
      if (guillemet === "]" && caractere === "]") guillemet = "";
      else if (guillemet !== "]" && caractere === guillemet) {
        if (suivant === guillemet) index += 1;
        else guillemet = "";
      }
      continue;
    }
    if (caractere === "-" && suivant === "-") {
      commentaireLigne = true;
      index += 1;
      continue;
    }
    if (caractere === "/" && suivant === "*") {
      commentaireBloc = true;
      index += 1;
      continue;
    }
    if (caractere === "'" || caractere === '"' || caractere === "`" || caractere === "[") {
      marquerCode();
      guillemet = caractere === "[" ? "]" : caractere;
      continue;
    }
    if (/[A-Za-z_]/u.test(caractere)) {
      marquerCode();
      let finMot = index + 1;
      while (finMot < texte.length && /[A-Za-z0-9_]/u.test(texte[finMot] ?? "")) finMot += 1;
      const mot = texte.slice(index, finMot).toUpperCase();
      if (mots.length < 8) mots.push(mot);
      if (mots[0] === "CREATE" && mots.slice(1, 6).includes("TRIGGER")) declencheur = true;
      if (declencheur) {
        if (!corpsDeclencheur && mot === "BEGIN") corpsDeclencheur = true;
        else if (corpsDeclencheur && mot === "CASE") profondeursCase += 1;
        else if (corpsDeclencheur && mot === "END") {
          if (profondeursCase > 0) profondeursCase -= 1;
          else corpsDeclencheur = false;
        }
      }
      index = finMot - 1;
      continue;
    }
    if (caractere === ";" && !(declencheur && corpsDeclencheur)) finaliser(index + 1);
    else if (!/\s/u.test(caractere)) marquerCode();
  }
  finaliser(texte.length);
  return instructions;
}

export function classifierErreurSqlite(erreur) {
  const message = erreur instanceof Error ? erreur.message.toLowerCase() : "";
  if (/foreign key constraint failed/u.test(message)) return "SQLITE_FOREIGN_KEY_CONSTRAINT";
  if (/unique constraint failed/u.test(message)) return "SQLITE_UNIQUE_CONSTRAINT";
  if (/not null constraint failed/u.test(message)) return "SQLITE_NOT_NULL_CONSTRAINT";
  if (/check constraint failed/u.test(message)) return "SQLITE_CHECK_CONSTRAINT";
  if (/syntax error|incomplete input|unrecognized token/u.test(message)) return "SQLITE_SYNTAX_ERROR";
  if (/no such table/u.test(message)) return "SQLITE_NO_SUCH_TABLE";
  if (/no such column/u.test(message)) return "SQLITE_NO_SUCH_COLUMN";
  if (/duplicate column name/u.test(message)) return "SQLITE_DUPLICATE_COLUMN";
  if (/already exists/u.test(message)) return "SQLITE_OBJECT_ALREADY_EXISTS";
  const code = typeof erreur === "object" && erreur !== null ? Reflect.get(erreur, "code") : undefined;
  if (typeof code === "string" && /^ERR_SQLITE_[A-Z0-9_]+$/u.test(code)) return code;
  const errcode = typeof erreur === "object" && erreur !== null ? Reflect.get(erreur, "errcode") : undefined;
  if (typeof errcode === "number" && Number.isInteger(errcode) && errcode >= 0 && errcode <= 999) {
    return `SQLITE_ERRCODE_${errcode}`;
  }
  return "SQLITE_ERROR_UNCLASSIFIED";
}

export function actionCorrectiveSqlite(code) {
  switch (code) {
    case "SQLITE_FOREIGN_KEY_CONSTRAINT":
      return "La copie présente une relation invalide au moment de l’opération indiquée; conserver la sauvegarde et examiner l’intégrité de l’export sans le réexécuter.";
    case "SQLITE_UNIQUE_CONSTRAINT":
      return "La copie contient une valeur unique en conflit; conserver la sauvegarde et examiner l’opération indiquée sans afficher les données.";
    case "SQLITE_NOT_NULL_CONSTRAINT":
    case "SQLITE_CHECK_CONSTRAINT":
      return "Une contrainte du schéma rejette l’opération indiquée; confirmer la compatibilité de la version SQLite et du schéma.";
    case "SQLITE_SYNTAX_ERROR":
      return "L’instruction du dump n’est pas acceptée par SQLite; vérifier la compatibilité du SQL Wrangler avec Node.js 24, sans modifier la migration 0023.";
    case "SQLITE_NO_SUCH_TABLE":
    case "SQLITE_NO_SUCH_COLUMN":
      return "Le dump référence un objet absent; vérifier l’ordre d’export et l’intégralité du fichier chiffré, sans lancer un nouvel export.";
    case "SQLITE_DUPLICATE_COLUMN":
    case "SQLITE_OBJECT_ALREADY_EXISTS":
      return "Le dump recrée un objet dans la copie; vérifier si le fichier contient plusieurs exports concaténés ou une restauration répétée.";
    default:
      return "Conserver le fichier chiffré et communiquer uniquement les champs de diagnostic; ne relancer aucun export avant analyse.";
  }
}

export function typeErreurSqlite(erreur) {
  if (!(erreur instanceof Error)) return "ErreurInconnue";
  const nom = erreur.name;
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(nom) ? nom : "Erreur";
}

export function codeNatifSqlite(erreur) {
  if (typeof erreur !== "object" || erreur === null) return "INDISPONIBLE";
  const valeur = Reflect.get(erreur, "errcode");
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0 && valeur <= 999
    ? String(valeur)
    : "INDISPONIBLE";
}
