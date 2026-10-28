import { useEffect, useState } from 'react';
import { verifierApi } from './api';
import { etatConnexion, type EtatConnexion } from './etat-connexion';

const INTERVALLE_MS = 15_000;

/** Suit la disponibilité de l'API. Les ventes en attente seront branchées sur la file locale (sprint 4). */
export function useConnexion(ventesEnAttente = 0): EtatConnexion {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [horsLigneDepuis, setHorsLigneDepuis] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());

  useEffect(() => {
    const controleur = new AbortController();
    const verifier = async () => {
      const ok = navigator.onLine && (await verifierApi(controleur.signal));
      setEnLigne(ok);
      setHorsLigneDepuis((depuis) => (ok ? null : (depuis ?? Date.now())));
      setMaintenant(Date.now());
    };
    void verifier();
    const id = window.setInterval(() => void verifier(), INTERVALLE_MS);
    const surChangement = () => void verifier();
    window.addEventListener('online', surChangement);
    window.addEventListener('offline', surChangement);
    return () => {
      controleur.abort();
      window.clearInterval(id);
      window.removeEventListener('online', surChangement);
      window.removeEventListener('offline', surChangement);
    };
  }, []);

  return etatConnexion({ enLigne, ventesEnAttente, horsLigneDepuis, maintenant });
}
