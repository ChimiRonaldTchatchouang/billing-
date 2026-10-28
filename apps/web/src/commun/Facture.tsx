import { useState } from 'react';
import { api } from '../lib/api';
import { Bouton, Champ, MessageErreur } from '../ui';

export interface FactureResume {
  id: string;
  numero: string;
  type: 'FACTURE' | 'AVOIR';
  client: {
    raisonSociale: string;
    niu: string | null;
    adresse: string | null;
    email: string | null;
  };
  envoyeeLe: string | null;
}

type Auth = 'utilisateur' | 'caisse';

async function ouvrirPdf(id: string, auth: Auth) {
  // La fenêtre est ouverte avant l'appel réseau, sinon le navigateur la bloque.
  const fenetre = window.open('', '_blank');
  const res = await api<Response>(`/invoices/${id}/pdf`, { auth, brut: true });
  const url = URL.createObjectURL(await res.blob());
  if (fenetre) fenetre.location.href = url;
  else window.location.href = url;
}

/** Émission d'une facture (ou d'un avoir) pour un ticket, puis PDF, e-mail et WhatsApp. */
export function Facturation({
  venteId,
  estRetour,
  facture: initiale,
  auth,
  onChange,
}: {
  venteId: string;
  estRetour: boolean;
  facture: { id: string; numero: string } | null;
  auth: Auth;
  onChange?: () => void;
}) {
  const [facture, setFacture] = useState<{
    id: string;
    numero: string;
    email?: string | null;
  } | null>(initiale);
  const [raisonSociale, setRaisonSociale] = useState('');
  const [niu, setNiu] = useState('');
  const [adresse, setAdresse] = useState('');
  const [email, setEmail] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const agir = async (f: () => Promise<void>) => {
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await f();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnvoi(false);
    }
  };

  if (!facture) {
    return (
      <div className="space-y-2 border-t pt-3">
        <p className="font-medium">
          {estRetour ? 'Avoir' : 'Facture pour un client professionnel'}
        </p>
        {estRetour ? (
          <p className="text-gray-600">L’avoir reprend le client de la facture d’origine.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Champ
              label="Raison sociale"
              required
              value={raisonSociale}
              onChange={(e) => setRaisonSociale(e.target.value)}
            />
            <Champ
              label="NIU du client"
              value={niu}
              onChange={(e) => setNiu(e.target.value.toUpperCase().replace(/\s/g, ''))}
            />
            <Champ label="Adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            <Champ
              label="E-mail (pour l’envoi)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}
        <MessageErreur erreur={erreur} />
        <Bouton
          disabled={envoi || (!estRetour && !raisonSociale.trim())}
          onClick={() =>
            void agir(async () => {
              const f = await api<FactureResume>(`/sales/${venteId}/invoice`, {
                auth,
                body: {
                  client: {
                    raisonSociale: estRetour ? '-' : raisonSociale,
                    ...(niu ? { niu } : {}),
                    ...(adresse ? { adresse } : {}),
                    ...(email ? { email } : {}),
                  },
                },
              });
              setFacture({ id: f.id, numero: f.numero, email: f.client.email });
              onChange?.();
            })
          }
        >
          {estRetour ? 'Émettre l’avoir' : 'Émettre la facture'}
        </Bouton>
      </div>
    );
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <p className="font-medium">
        {facture.numero.startsWith('AV') ? 'Avoir' : 'Facture'} {facture.numero}
      </p>
      <div className="flex flex-wrap gap-2">
        <Bouton
          variante="secondaire"
          disabled={envoi}
          onClick={() => void agir(() => ouvrirPdf(facture.id, auth))}
        >
          Ouvrir le PDF
        </Bouton>
        <Bouton
          variante="secondaire"
          disabled={envoi}
          onClick={() =>
            void agir(async () => {
              const l = await api<{ whatsapp: string }>(`/invoices/${facture.id}/link`, {
                auth,
                method: 'POST',
              });
              window.open(l.whatsapp, '_blank', 'noopener');
            })
          }
        >
          Envoyer par WhatsApp
        </Bouton>
      </div>
      <div className="flex items-end gap-2">
        <Champ
          label="Envoyer par e-mail à"
          type="email"
          placeholder={facture.email ?? 'adresse du client'}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Bouton
          disabled={envoi}
          onClick={() =>
            void agir(async () => {
              await api(`/invoices/${facture.id}/send`, { auth, body: email ? { email } : {} });
              setInfo('E-mail envoyé avec la facture en pièce jointe.');
              onChange?.();
            })
          }
        >
          Envoyer
        </Bouton>
      </div>
      {info && <p className="text-green-800">{info}</p>}
      <MessageErreur erreur={erreur} />
    </div>
  );
}
