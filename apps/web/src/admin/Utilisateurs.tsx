import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  Chargement,
  Choix,
  MessageErreur,
  Modale,
  Tableau,
} from '../ui';
import { useMoi } from './session';
import { type Magasin, type Role, ROLES_LIBELLES, type Utilisateur } from './types';

export function Utilisateurs() {
  const moi = useMoi();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: () => api<Utilisateur[]>('/users'),
  });
  const [edition, setEdition] = useState<Utilisateur | 'nouveau' | null>(null);
  const basculer = useMutation({
    mutationFn: (u: Utilisateur) =>
      api(`/users/${u.id}`, { method: 'PATCH', body: { actif: !u.actif } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['utilisateurs'] }),
  });

  return (
    <Carte
      titre="Utilisateurs"
      actions={<Bouton onClick={() => setEdition('nouveau')}>Ajouter un utilisateur</Bouton>}
    >
      <MessageErreur erreur={error ?? basculer.error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={['Nom', 'Rôle', 'Magasin', 'E-mail', 'PIN', 'État', '']}
          vide={data?.length === 0}
        >
          {data?.map((u) => (
            <tr key={u.id}>
              <td className="px-2 py-2">{u.nom}</td>
              <td className="px-2 py-2">{ROLES_LIBELLES[u.role]}</td>
              <td className="px-2 py-2">{u.magasin?.code ?? 'Tous'}</td>
              <td className="px-2 py-2">{u.email ?? '—'}</td>
              <td className="px-2 py-2">{u.aUnPin ? 'Oui' : 'Non'}</td>
              <td className="px-2 py-2">
                {u.actif ? <Badge couleur="vert">Actif</Badge> : <Badge>Désactivé</Badge>}
              </td>
              <td className="space-x-2 px-2 py-2 text-right whitespace-nowrap">
                <Bouton variante="discret" onClick={() => setEdition(u)}>
                  Modifier
                </Bouton>
                {u.id !== moi.id && (
                  <Bouton variante="discret" onClick={() => basculer.mutate(u)}>
                    {u.actif ? 'Désactiver' : 'Réactiver'}
                  </Bouton>
                )}
              </td>
            </tr>
          ))}
        </Tableau>
      )}
      {edition && (
        <FormulaireUtilisateur
          utilisateur={edition === 'nouveau' ? null : edition}
          onFermer={() => setEdition(null)}
        />
      )}
    </Carte>
  );
}

function FormulaireUtilisateur({
  utilisateur,
  onFermer,
}: {
  utilisateur: Utilisateur | null;
  onFermer: () => void;
}) {
  const qc = useQueryClient();
  const magasins = useQuery({ queryKey: ['magasins'], queryFn: () => api<Magasin[]>('/stores') });
  const [nom, setNom] = useState(utilisateur?.nom ?? '');
  const [role, setRole] = useState<Role>(utilisateur?.role ?? 'CAISSIER');
  const [storeId, setStoreId] = useState(utilisateur?.storeId ?? '');
  const [email, setEmail] = useState(utilisateur?.email ?? '');
  const [motDePasse, setMotDePasse] = useState('');
  const [pin, setPin] = useState('');

  const enregistrer = useMutation({
    mutationFn: () => {
      const corps = {
        nom,
        role,
        storeId: role === 'DIRECTEUR' ? null : storeId || null,
        email: email || undefined,
        motDePasse: motDePasse || undefined,
        pin: pin || undefined,
      };
      return utilisateur
        ? api(`/users/${utilisateur.id}`, {
            method: 'PATCH',
            body: { ...corps, email: email || null },
          })
        : api('/users', { body: corps });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['utilisateurs'] });
      onFermer();
    },
  });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    enregistrer.mutate();
  };
  const remplacer = utilisateur ? ' (laisser vide pour ne pas changer)' : '';

  return (
    <Modale
      titre={utilisateur ? `Modifier ${utilisateur.nom}` : 'Nouvel utilisateur'}
      onFermer={onFermer}
    >
      <form onSubmit={valider} className="space-y-3">
        <Champ label="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        <Choix label="Rôle" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {Object.entries(ROLES_LIBELLES).map(([r, l]) => (
            <option key={r} value={r}>
              {l}
            </option>
          ))}
        </Choix>
        {role !== 'DIRECTEUR' && (
          <Choix
            label="Magasin"
            required
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Choisir…</option>
            {magasins.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.nom}
              </option>
            ))}
          </Choix>
        )}
        <Champ
          label={`E-mail${role === 'CAISSIER' ? ' (facultatif)' : ''}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Champ
          label={`Mot de passe du back-office${remplacer}`}
          type="password"
          autoComplete="new-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
        <Champ
          label={`PIN de caisse, 4 chiffres${remplacer}`}
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <MessageErreur erreur={enregistrer.error} />
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={enregistrer.isPending}>
            Enregistrer
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
