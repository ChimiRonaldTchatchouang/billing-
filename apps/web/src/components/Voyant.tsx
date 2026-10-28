import type { EtatConnexion } from '../lib/etat-connexion';

const STYLES: Record<EtatConnexion, { couleur: string; texte: string }> = {
  EN_LIGNE: { couleur: 'bg-green-600', texte: 'En ligne' },
  VENTES_EN_ATTENTE: { couleur: 'bg-orange-500', texte: 'Ventes en attente d’envoi' },
  HORS_LIGNE_LONG: { couleur: 'bg-red-600', texte: 'Hors ligne depuis plus de 30 minutes' },
};

export function Voyant({ etat, enAttente }: { etat: EtatConnexion; enAttente: number }) {
  const { couleur, texte } = STYLES[etat];
  return (
    <div role="status" className="flex items-center gap-2 text-sm">
      <span aria-hidden className={`inline-block h-3 w-3 rounded-full ${couleur}`} />
      <span>
        {texte}
        {enAttente > 0 ? ` (${enAttente})` : ''}
      </span>
    </div>
  );
}
