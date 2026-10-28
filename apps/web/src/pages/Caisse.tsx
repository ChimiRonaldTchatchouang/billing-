import { Voyant } from '../components/Voyant';
import { useConnexion } from '../lib/use-connexion';

export function Caisse() {
  const etat = useConnexion();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Caisse</h1>
        <Voyant etat={etat} enAttente={0} />
      </header>
      <main className="flex flex-1 items-center justify-center p-4 text-gray-600">
        L’écran de vente arrive au sprint 3. Scannez un article pour commencer.
      </main>
    </div>
  );
}
