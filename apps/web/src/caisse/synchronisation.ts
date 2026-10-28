import { useEffect, useState } from 'react';
import { ErreurApi } from '../lib/api';
import { synchroniserCatalogue } from './catalogue';
import { envoyerEnAttente } from './envoi';
import { rafraichirPersonnel } from './poste';

const ENVOI_MS = 15_000;
const CATALOGUE_MS = 5 * 60_000;

/**
 * Boucle de fond de la caisse : envoi des ventes toutes les 15 s et au retour du réseau,
 * catalogue et personnel à l'ouverture puis toutes les 5 minutes. Les erreurs réseau sont
 * silencieuses : la caisse continue de vendre et réessaie.
 */
export function useSynchronisation(actif: boolean): {
  revoque: boolean;
  derniereErreur: string | null;
} {
  const [revoque, setRevoque] = useState(false);
  const [derniereErreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!actif) return;
    let arrete = false;
    const traiter = (e: unknown) => {
      if (e instanceof ErreurApi && e.code === 'CAISSE_NON_ENREGISTREE') setRevoque(true);
      else if (e instanceof ErreurApi && e.code !== 'RESEAU_INDISPONIBLE') setErreur(e.message);
    };
    const envoyer = () => {
      if (!arrete && navigator.onLine) void envoyerEnAttente().then(() => setErreur(null), traiter);
    };
    const catalogue = () => {
      if (arrete || !navigator.onLine) return;
      void Promise.all([synchroniserCatalogue(), rafraichirPersonnel()]).catch(traiter);
    };
    catalogue();
    envoyer();
    const i1 = setInterval(envoyer, ENVOI_MS);
    const i2 = setInterval(catalogue, CATALOGUE_MS);
    const enLigne = () => {
      envoyer();
      catalogue();
    };
    window.addEventListener('online', enLigne);
    return () => {
      arrete = true;
      clearInterval(i1);
      clearInterval(i2);
      window.removeEventListener('online', enLigne);
    };
  }, [actif]);

  return { revoque, derniereErreur };
}
