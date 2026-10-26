export function environnementExigeTransportSecurise(environnement: string): boolean {
  return environnement === "production" || environnement === "staging";
}
