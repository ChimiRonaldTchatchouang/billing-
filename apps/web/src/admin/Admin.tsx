import { Route, Routes } from 'react-router-dom';
import { Chargement } from '../ui';
import { Articles } from './Articles';
import { Caisses } from './Caisses';
import { Connexion } from './Connexion';
import { Layout } from './Layout';
import { Magasins } from './Magasins';
import { FournisseurMoi, useNettoyageSession, useSessionActive } from './session';
import { Sessions } from './Sessions';
import { Stock } from './Stock';
import { Utilisateurs } from './Utilisateurs';
import { Ventes } from './Ventes';

function Accueil() {
  return <p className="text-gray-600">Bienvenue dans le back-office.</p>;
}

export function Admin() {
  const active = useSessionActive();
  useNettoyageSession();
  if (!active) return <Connexion />;
  return (
    <FournisseurMoi attente={<Chargement />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="magasins" element={<Magasins />} />
          <Route path="caisses" element={<Caisses />} />
          <Route path="utilisateurs" element={<Utilisateurs />} />
          <Route path="articles" element={<Articles />} />
          <Route path="stock" element={<Stock />} />
          <Route path="ventes" element={<Ventes />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="*" element={<p>Page introuvable.</p>} />
        </Route>
      </Routes>
    </FournisseurMoi>
  );
}
