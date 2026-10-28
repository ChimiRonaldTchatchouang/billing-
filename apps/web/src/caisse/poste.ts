import { api, definirJetonAppareil, jetonAppareil } from '../lib/api';
import { db, ecrireMeta, type Employe, type InfosPoste, lireMeta } from './db';

export async function enregistrerPoste(code: string): Promise<InfosPoste> {
  const r = await api<
    InfosPoste & {
      jetonAppareil: string;
      caisse: { id: string; code: string; dernierNumero: number };
    }
  >('/registers/activate', { body: { code }, auth: 'aucune' });
  definirJetonAppareil(r.jetonAppareil);
  const infos: InfosPoste = {
    caisse: { id: r.caisse.id, code: r.caisse.code },
    magasin: r.magasin,
    organisation: r.organisation,
  };
  // Un poste réenregistré reprend la numérotation là où le serveur l'a vue.
  const local = (await lireMeta<number>('dernierNumero')) ?? 0;
  const ancien = await lireMeta<InfosPoste>('poste');
  await ecrireMeta(
    'dernierNumero',
    ancien?.caisse.id === infos.caisse.id
      ? Math.max(local, r.caisse.dernierNumero)
      : r.caisse.dernierNumero,
  );
  await ecrireMeta('poste', infos);
  await rafraichirPersonnel();
  return infos;
}

export const posteEnregistre = () => jetonAppareil() !== null;

export async function rafraichirPersonnel(): Promise<void> {
  const personnel = await api<Employe[]>('/sync/staff', { auth: 'caisse' });
  await db.transaction('rw', db.personnel, async () => {
    await db.personnel.clear();
    await db.personnel.bulkPut(personnel);
  });
}
