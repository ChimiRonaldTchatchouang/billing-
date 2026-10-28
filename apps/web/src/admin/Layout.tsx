import { NavLink, Outlet } from 'react-router-dom';
import { ROLES_LIBELLES, type Role } from './types';
import { useDeconnexion, useMoi } from './session';

interface Lien {
  vers: string;
  libelle: string;
  roles: Role[];
}

export const LIENS: Lien[] = [
  { vers: '/admin', libelle: 'Tableau de bord', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/ventes', libelle: 'Ventes', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/paiements', libelle: 'Mobile Money', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/sessions', libelle: 'Sessions de caisse', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/rapports', libelle: 'Rapports', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/articles', libelle: 'Articles', roles: ['DIRECTEUR', 'GERANT', 'CAISSIER'] },
  { vers: '/admin/stock', libelle: 'Stock', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/caisses', libelle: 'Caisses', roles: ['DIRECTEUR', 'GERANT'] },
  { vers: '/admin/magasins', libelle: 'Magasins', roles: ['DIRECTEUR'] },
  { vers: '/admin/utilisateurs', libelle: 'Utilisateurs', roles: ['DIRECTEUR'] },
  { vers: '/admin/entreprise', libelle: 'Entreprise', roles: ['DIRECTEUR'] },
];

export function Layout() {
  const moi = useMoi();
  const deconnexion = useDeconnexion();
  const liens = LIENS.filter((l) => l.roles.includes(moi.role));
  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <nav className="border-b bg-white md:min-h-screen md:w-56 md:border-r md:border-b-0">
        <div className="p-4">
          <p className="font-semibold">{moi.organisation.nom}</p>
          <p className="text-xs text-gray-500">
            {moi.nom} — {ROLES_LIBELLES[moi.role]}
            {moi.magasin ? ` (${moi.magasin.code})` : ''}
          </p>
        </div>
        <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:block md:space-y-1">
          {liens.map((l) => (
            <li key={l.vers}>
              <NavLink
                end={l.vers === '/admin'}
                to={l.vers}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm whitespace-nowrap ${isActive ? 'bg-green-50 font-medium text-green-800' : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                {l.libelle}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => void deconnexion()}
              className="block w-full rounded px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
            >
              Se déconnecter
            </button>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
