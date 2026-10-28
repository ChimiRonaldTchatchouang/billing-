import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { ErreurApi } from './lib/api';

type Variante = 'principal' | 'secondaire' | 'danger' | 'discret';

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-green-700 text-white hover:bg-green-800 disabled:bg-green-300',
  secondaire:
    'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  discret: 'text-green-800 hover:underline disabled:text-gray-400',
};

export function Bouton({
  variante = 'principal',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
      {...p}
    />
  );
}

export function Champ({
  label,
  erreur,
  className = '',
  ...p
}: InputHTMLAttributes<HTMLInputElement> & { label: string; erreur?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <input
        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-green-600 focus:ring-1 focus:ring-green-600 focus:outline-none"
        {...p}
      />
      {erreur && <span className="mt-1 block text-red-700">{erreur}</span>}
    </label>
  );
}

export function Choix({
  label,
  children,
  className = '',
  ...p
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      <select className="w-full rounded-md border border-gray-300 bg-white px-3 py-2" {...p}>
        {children}
      </select>
    </label>
  );
}

export function MessageErreur({ erreur }: { erreur: unknown }) {
  if (!erreur) return null;
  const e = erreur instanceof ErreurApi ? erreur : null;
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <p>{e?.message ?? 'Une erreur inattendue est survenue.'}</p>
      {e && e.details.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {e.details.map((d, i) => (
            <li key={i}>{d.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Carte({
  titre,
  actions,
  children,
}: {
  titre?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {(titre || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre && <h2 className="text-lg font-semibold">{titre}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tableau({
  entetes,
  children,
  vide,
}: {
  entetes: string[];
  children: ReactNode;
  vide?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-gray-600">
          <tr>
            {entetes.map((e) => (
              <th key={e} className="px-2 py-2 font-medium whitespace-nowrap">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
      {vide && <p className="py-6 text-center text-gray-500">Aucun élément pour le moment.</p>}
    </div>
  );
}

export function Modale({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titre}</h2>
          <button
            type="button"
            aria-label="Fermer"
            className="text-2xl leading-none text-gray-500"
            onClick={onFermer}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Badge({
  couleur = 'gris',
  children,
}: {
  couleur?: 'vert' | 'rouge' | 'orange' | 'gris';
  children: ReactNode;
}) {
  const c = {
    vert: 'bg-green-100 text-green-800',
    rouge: 'bg-red-100 text-red-800',
    orange: 'bg-orange-100 text-orange-800',
    gris: 'bg-gray-100 text-gray-700',
  }[couleur];
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>
  );
}

export const Chargement = () => <p className="py-6 text-center text-gray-500">Chargement…</p>;
