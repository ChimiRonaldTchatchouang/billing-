import { calculerRendu, type ModePaiement, PaiementInvalideError } from '@caisse/shared';
import { useState } from 'react';
import { formaterFcfa } from '../lib/api';
import { Bouton, Champ, Choix, Modale } from '../ui';

export interface PaiementSaisi {
  mode: ModePaiement;
  montant: number;
  numeroClient?: string;
  reference?: string;
}

/** Billets et pièces les plus courants pour une saisie rapide. */
const COUPURES = [500, 1000, 2000, 5000, 10_000];

export function Paiement({
  total,
  onValider,
  onFermer,
}: {
  total: number;
  onValider: (paiements: PaiementSaisi[], rendu: number) => void;
  onFermer: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  const [operateur, setOperateur] = useState<'ORANGE_MONEY' | 'MTN_MOMO'>('ORANGE_MONEY');
  const [montantMobile, setMontantMobile] = useState(String(total));
  const [numero, setNumero] = useState('');
  const [reference, setReference] = useState('');
  const [especes, setEspeces] = useState('');

  const mm = mobile ? Number(montantMobile || 0) : 0;
  const reste = Math.max(0, total - mm);
  const paiements: PaiementSaisi[] = [
    ...(mobile && mm > 0
      ? [{ mode: operateur, montant: mm, numeroClient: numero, reference }]
      : []),
    ...(Number(especes || 0) > 0 ? [{ mode: 'ESPECES' as const, montant: Number(especes) }] : []),
  ];
  let rendu = 0;
  let probleme: string | null = null;
  try {
    rendu = calculerRendu(total, paiements).rendu;
  } catch (e) {
    probleme = e instanceof PaiementInvalideError ? e.message : 'Paiement incomplet.';
  }
  if (!probleme && mobile && mm > 0 && (!/^\d{9}$/.test(numero) || reference.trim().length < 4)) {
    probleme = 'Saisissez le numéro du client (9 chiffres) et la référence reçue par SMS.';
  }

  const suggestions = [...new Set([reste, ...COUPURES.map((c) => Math.ceil(reste / c) * c)])]
    .filter((v) => v >= reste)
    .slice(0, 5);

  return (
    <Modale titre="Encaissement" onFermer={onFermer}>
      <p className="mb-4 text-center text-3xl font-bold">{formaterFcfa(total)}</p>

      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} />{' '}
        Paiement Mobile Money (total ou partiel)
      </label>
      {mobile && (
        <div className="mb-4 grid grid-cols-2 gap-3 rounded-md border bg-gray-50 p-3">
          <Choix
            label="Opérateur"
            value={operateur}
            onChange={(e) => setOperateur(e.target.value as 'ORANGE_MONEY' | 'MTN_MOMO')}
          >
            <option value="ORANGE_MONEY">Orange Money</option>
            <option value="MTN_MOMO">MTN MoMo</option>
          </Choix>
          <Champ
            label="Montant"
            inputMode="numeric"
            value={montantMobile}
            onChange={(e) => setMontantMobile(e.target.value.replace(/\D/g, ''))}
          />
          <Champ
            label="Numéro du client"
            inputMode="tel"
            placeholder="6XXXXXXXX"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 9))}
          />
          <Champ
            label="Référence de la transaction"
            value={reference}
            onChange={(e) => setReference(e.target.value.trim())}
          />
          <p className="col-span-2 text-xs text-gray-600">
            Vérifiez sur le téléphone du magasin que le paiement est bien arrivé avant de valider.
            Il sera rapproché avec le relevé de l’opérateur.
          </p>
        </div>
      )}

      {reste > 0 && (
        <>
          <Champ
            label={`Espèces reçues (reste à payer : ${formaterFcfa(reste)})`}
            inputMode="numeric"
            autoFocus
            value={especes}
            onChange={(e) => setEspeces(e.target.value.replace(/\D/g, ''))}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <Bouton key={s} variante="secondaire" onClick={() => setEspeces(String(s))}>
                {formaterFcfa(s)}
              </Bouton>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 rounded-md bg-gray-50 p-3 text-center">
        {probleme ? (
          <p className="text-orange-800">{probleme}</p>
        ) : (
          <p className="text-2xl">
            Rendu : <b>{formaterFcfa(rendu)}</b>
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Bouton variante="secondaire" onClick={onFermer}>
          Retour
        </Bouton>
        <Bouton disabled={probleme !== null} onClick={() => onValider(paiements, rendu)}>
          Valider et imprimer
        </Bouton>
      </div>
    </Modale>
  );
}
