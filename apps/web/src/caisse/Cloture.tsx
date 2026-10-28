import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { api, ErreurApi, formaterDate, formaterFcfa } from '../lib/api';
import { Bouton, Champ, MessageErreur, Modale } from '../ui';
import { ChoixGerant } from './ChoixGerant';
import { db, type InfosPoste, type SessionLocale } from './db';
import { envoyerEnAttente } from './envoi';
import { EnTeteImpression, imprimer, Impression } from './Ticket';

type ParMode = { ESPECES: number; ORANGE_MONEY: number; MTN_MOMO: number };

interface Rapport {
  caisse: string;
  ouverteLe: string;
  fermeeLe: string | null;
  ouvertePar: string;
  fermeePar: string | null;
  fondDeCaisse: number;
  tickets: number;
  chiffreAffairesTtc: number;
  tva: number;
  remises: number;
  retours: { nombre: number; montant: number };
  attendu: ParMode;
  compte: ParMode | null;
  ecart: ParMode | null;
}

const LIBELLES: Record<keyof ParMode, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
};

/**
 * Clôture : toutes les ventes doivent être envoyées. Le caissier compte sans voir les montants
 * attendus ; le serveur calcule l'écart après validation par le PIN d'un gérant.
 */
export function Cloture({
  session,
  poste,
  onFermee,
  onFermer,
}: {
  session: SessionLocale;
  poste: InfosPoste;
  onFermee: () => void;
  onFermer: () => void;
}) {
  const enAttente =
    useLiveQuery(() => db.ventes.where('statut').equals('EN_ATTENTE').count(), []) ?? 0;
  const sessionLocale = useLiveQuery(() => db.sessions.get(session.id), [session.id]);
  const [compte, setCompte] = useState({ ESPECES: '', ORANGE_MONEY: '', MTN_MOMO: '' });
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);
  const [rapport, setRapport] = useState<Rapport | null>(null);

  useEffect(() => {
    void envoyerEnAttente().catch(setErreur);
  }, []);

  const pret = enAttente === 0 && sessionLocale?.envoyee === 1;

  const cloturer = async (gerantId: string, pin: string) => {
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api<Rapport>(`/cash-sessions/${session.id}/close`, {
        auth: 'caisse',
        body: {
          gerantId,
          pin,
          compte: {
            ESPECES: Number(compte.ESPECES || 0),
            ORANGE_MONEY: Number(compte.ORANGE_MONEY || 0),
            MTN_MOMO: Number(compte.MTN_MOMO || 0),
          },
        },
      });
      setRapport(r);
    } catch (e) {
      // Déjà clôturée (ex. page rechargée après la clôture) : on récupère le rapport.
      if (e instanceof ErreurApi && e.code === 'SESSION_DEJA_FERMEE') {
        setRapport(await api<Rapport>(`/cash-sessions/${session.id}/report`, { auth: 'caisse' }));
      } else setErreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  // La session n'est marquée fermée sur le poste qu'une fois le rapport lu.
  const terminer = async () => {
    await db.sessions.update(session.id, { statut: 'FERMEE' });
    onFermee();
  };

  if (rapport) {
    return (
      <Modale titre="Caisse clôturée" onFermer={() => void terminer()}>
        <RapportCloture rapport={rapport} />
        <Impression>
          <EnTeteImpression poste={poste} />
          <hr />
          <p className="gras">Clôture de caisse {rapport.caisse}</p>
          <RapportCloture rapport={rapport} impression />
        </Impression>
        <div className="mt-4 flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={imprimer}>
            Imprimer le rapport
          </Bouton>
          <Bouton onClick={() => void terminer()}>Terminer</Bouton>
        </div>
      </Modale>
    );
  }

  return (
    <Modale titre="Clôturer la caisse" onFermer={onFermer}>
      {!pret ? (
        <div className="space-y-3">
          <p className="rounded-md bg-orange-50 p-3 text-orange-900">
            {enAttente > 0
              ? `${enAttente} vente(s) pas encore envoyée(s) au serveur. La clôture sera possible une fois toutes les ventes envoyées.`
              : 'L’ouverture de la caisse n’a pas encore été envoyée au serveur.'}
          </p>
          <MessageErreur erreur={erreur} />
          <Bouton onClick={() => void envoyerEnAttente().then(() => setErreur(null), setErreur)}>
            Envoyer maintenant
          </Bouton>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Comptez l’argent du tiroir et les paiements Mobile Money reçus, puis saisissez les
            montants.
          </p>
          {(Object.keys(LIBELLES) as (keyof ParMode)[]).map((m) => (
            <Champ
              key={m}
              label={`${LIBELLES[m]} (FCFA)`}
              inputMode="numeric"
              value={compte[m]}
              onChange={(e) => setCompte({ ...compte, [m]: e.target.value.replace(/\D/g, '') })}
            />
          ))}
          <MessageErreur erreur={erreur} />
          <p className="pt-2 text-sm font-medium">Validation par un gérant</p>
          <ChoixGerant desactive={envoi} onPin={(g, pin) => void cloturer(g.id, pin)} />
        </div>
      )}
    </Modale>
  );
}

export type { Rapport };

export function RapportCloture({
  rapport: r,
  impression,
}: {
  rapport: Rapport;
  impression?: boolean;
}) {
  const ligne = impression ? 'ligne' : 'flex justify-between';
  return (
    <div className={impression ? '' : 'space-y-1 text-sm'}>
      <p>
        Du {formaterDate(r.ouverteLe)} au {r.fermeeLe ? formaterDate(r.fermeeLe) : '—'}
      </p>
      <p>
        Ouverte par {r.ouvertePar}, clôturée par {r.fermeePar ?? '—'}
      </p>
      <hr className="my-2" />
      <p className={ligne}>
        <span>Tickets</span>
        <span>{r.tickets}</span>
      </p>
      <p className={ligne}>
        <span>Chiffre d’affaires TTC</span>
        <span>{formaterFcfa(r.chiffreAffairesTtc)}</span>
      </p>
      <p className={ligne}>
        <span>dont TVA</span>
        <span>{formaterFcfa(r.tva)}</span>
      </p>
      <p className={ligne}>
        <span>Remises accordées</span>
        <span>{formaterFcfa(r.remises)}</span>
      </p>
      <p className={ligne}>
        <span>Retours ({r.retours.nombre})</span>
        <span>-{formaterFcfa(r.retours.montant)}</span>
      </p>
      <p className={ligne}>
        <span>Fond de caisse</span>
        <span>{formaterFcfa(r.fondDeCaisse)}</span>
      </p>
      <hr className="my-2" />
      {(Object.keys(LIBELLES) as (keyof ParMode)[]).map((m) => (
        <div key={m}>
          <p className={`${ligne} font-medium`}>
            <span>{LIBELLES[m]}</span>
            <span />
          </p>
          <p className={ligne}>
            <span>Attendu / compté</span>
            <span>
              {formaterFcfa(r.attendu[m])} / {formaterFcfa(r.compte?.[m] ?? 0)}
            </span>
          </p>
          <p
            className={`${ligne} ${!impression && r.ecart && r.ecart[m] !== 0 ? 'font-semibold text-red-700' : ''}`}
          >
            <span>Écart</span>
            <span>{formaterFcfa(r.ecart?.[m] ?? 0)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
