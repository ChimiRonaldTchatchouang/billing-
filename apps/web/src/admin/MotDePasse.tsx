import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Bouton, Champ, MessageErreur } from '../ui';

function Cadre({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">{titre}</h1>
        {children}
        <Link to="/admin" className="block text-sm text-green-800 hover:underline">
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  );
}

export function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const valider = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/forgot', { body: { email }, auth: 'aucune' });
      setEnvoye(true);
    } catch (err) {
      setErreur(err);
    }
  };
  return (
    <Cadre titre="Mot de passe oublié">
      {envoye ? (
        <p className="text-sm">
          Si cette adresse correspond à un compte, un e-mail avec un lien vient d’être envoyé. Le
          lien est valable 1 heure.
        </p>
      ) : (
        <form onSubmit={(e) => void valider(e)} className="space-y-3">
          <Champ
            label="E-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <MessageErreur erreur={erreur} />
          <Bouton type="submit" className="w-full">
            Recevoir un lien
          </Bouton>
        </form>
      )}
    </Cadre>
  );
}

export function Reinitialisation() {
  const [params] = useSearchParams();
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fait, setFait] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const valider = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/auth/reset', {
        body: { jeton: params.get('jeton') ?? '', motDePasse },
        auth: 'aucune',
      });
      setFait(true);
    } catch (err) {
      setErreur(err);
    }
  };
  return (
    <Cadre titre="Nouveau mot de passe">
      {fait ? (
        <p className="text-sm">Mot de passe changé. Vous pouvez vous connecter.</p>
      ) : (
        <form onSubmit={(e) => void valider(e)} className="space-y-3">
          <Champ
            label="Nouveau mot de passe (10 caractères minimum)"
            type="password"
            autoComplete="new-password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />
          <Champ
            label="Confirmer"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            erreur={
              confirmation && confirmation !== motDePasse
                ? 'Les deux mots de passe sont différents.'
                : undefined
            }
          />
          <MessageErreur erreur={erreur} />
          <Bouton
            type="submit"
            className="w-full"
            disabled={motDePasse.length < 10 || motDePasse !== confirmation}
          >
            Enregistrer
          </Bouton>
        </form>
      )}
    </Cadre>
  );
}
