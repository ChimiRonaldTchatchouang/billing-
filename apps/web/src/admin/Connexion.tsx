import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bouton, Champ, MessageErreur } from '../ui';
import { seConnecter } from './session';

export function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async (e: FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      await seConnecter(email, motDePasse);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <form onSubmit={valider} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Back-office — connexion</h1>
        <Champ
          label="E-mail"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Champ
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        <MessageErreur erreur={erreur} />
        <Bouton type="submit" className="w-full" disabled={envoi}>
          {envoi ? 'Connexion…' : 'Se connecter'}
        </Bouton>
        <Link
          to="/admin/mot-de-passe-oublie"
          className="block text-center text-sm text-green-800 hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </form>
    </div>
  );
}
