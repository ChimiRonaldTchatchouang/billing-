export type EtatConnexion = 'EN_LIGNE' | 'VENTES_EN_ATTENTE' | 'HORS_LIGNE_LONG';

/** Au-delà de ce délai sans réseau, le voyant passe au rouge. */
export const DELAI_HORS_LIGNE_LONG_MS = 30 * 60 * 1000;

/**
 * Voyant permanent de la caisse : vert (en ligne, rien en attente), orange (ventes en
 * attente d'envoi), rouge (hors ligne depuis plus de 30 minutes).
 */
export function etatConnexion(params: {
  enLigne: boolean;
  ventesEnAttente: number;
  horsLigneDepuis: number | null;
  maintenant: number;
}): EtatConnexion {
  const { enLigne, ventesEnAttente, horsLigneDepuis, maintenant } = params;
  if (
    !enLigne &&
    horsLigneDepuis !== null &&
    maintenant - horsLigneDepuis > DELAI_HORS_LIGNE_LONG_MS
  ) {
    return 'HORS_LIGNE_LONG';
  }
  if (!enLigne || ventesEnAttente > 0) return 'VENTES_EN_ATTENTE';
  return 'EN_LIGNE';
}
