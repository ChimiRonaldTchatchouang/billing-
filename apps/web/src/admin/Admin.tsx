import { Navigate, Route, Routes } from 'react-router-dom';
import { Facturation } from '../commun/Facture';
import { Chargement } from '../ui';
import { Articles } from './Articles';
import { Caisses } from './Caisses';
import { Connexion } from './Connexion';
import { MotDePasseOublie, Reinitialisation } from './MotDePasse';
import { Organisation } from './Organisation';
import { Paiements } from './Paiements';
import { Rapports } from './Rapports';
import { TableauDeBord } from './Tableau';
import { Layout } from './Layout';
import { Magasins } from './Magasins';
import { FournisseurMoi, useMoi, useNettoyageSession, useSessionActive } from './session';
import { Sessions } from './Sessions';
import { Stock } from './Stock';
import { Utilisateurs } from './Utilisateurs';
import { Ventes } from './Ventes';

function Accueil() {
  const moi = useMoi();
  return moi.role === 'CAISSIER' ? <Navigate to="/admin/articles" replace /> : <TableauDeBord />;
}

export function Admin() {
  const active = useSessionActive();
  useNettoyageSession();
  if (!active) {
    return (
      <Routes>
        <Route path="mot-de-passe-oublie" element={<MotDePasseOublie />} />
        <Route path="reinitialiser" element={<Reinitialisation />} />
        <Route path="*" element={<Connexion />} />
      </Routes>
    );
  }
  return (
    <FournisseurMoi attente={<Chargement />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="paiements" element={<Paiements />} />
          <Route path="rapports" element={<Rapports />} />
          <Route path="entreprise" element={<Organisation />} />
          <Route path="magasins" element={<Magasins />} />
          <Route path="caisses" element={<Caisses />} />
          <Route path="utilisateurs" element={<Utilisateurs />} />
          <Route path="articles" element={<Articles />} />
          <Route path="stock" element={<Stock />} />
          <Route
            path="ventes"
            element={
              <Ventes
                actionsDetail={(v, recharger) => (
                  <Facturation
                    venteId={v.id}
                    estRetour={v.statut === 'RETOUR'}
                    facture={v.facture}
                    auth="utilisateur"
                    onChange={recharger}
                  />
                )}
              />
            }
          />
          <Route path="sessions" element={<Sessions />} />
          <Route path="*" element={<p>Page introuvable.</p>} />
        </Route>
      </Routes>
    </FournisseurMoi>
  );
}
