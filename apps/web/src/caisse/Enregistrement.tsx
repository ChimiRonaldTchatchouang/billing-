import { type FormEvent, useState } from 'react';
import { Bouton, Champ, MessageErreur } from '../ui';
import { enregistrerPoste } from './poste';

export function Enregistrement({ onEnregistre }: { onEnregistre: () => void }) {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await enregistrerPoste(code);
      onEnregistre();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={valider} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Enregistrer ce poste de caisse</h1>
        <p className="text-sm text-gray-600">
          Un gérant obtient le code dans le back-office, page « Caisses ». Ce poste n’a besoin
          d’être enregistré qu’une fois.
        </p>
        <Champ
          label="Code d’enregistrement"
          required
          autoFocus
          maxLength={8}
          className="font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <MessageErreur erreur={erreur} />
        <Bouton type="submit" className="w-full" disabled={envoi || code.length !== 8}>
          {envoi ? 'Enregistrement…' : 'Enregistrer le poste'}
        </Bouton>
      </form>
    </div>
  );
}
