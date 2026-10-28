import ExcelJS from 'exceljs';
import { creationArticleSchema, tauxEnPointsDeBase } from '@caisse/shared';
import type { z } from 'zod';

export type LigneImport = z.infer<typeof creationArticleSchema> & { categorie: string | null };

export interface ErreurLigne {
  ligne: number;
  message: string;
}

/** En-têtes acceptés (insensibles à la casse et aux accents). */
const COLONNES: Record<string, keyof Brute> = {
  code_barres: 'codeBarres',
  codebarres: 'codeBarres',
  code: 'codeBarres',
  ean: 'codeBarres',
  nom: 'nom',
  libelle: 'nom',
  designation: 'nom',
  prix_ttc: 'prixTtc',
  prix: 'prixTtc',
  prix_de_vente: 'prixTtc',
  taux_tva: 'tauxTva',
  tva: 'tauxTva',
  unite: 'unite',
  categorie: 'categorie',
  seuil_alerte: 'seuilAlerte',
  seuil: 'seuilAlerte',
  prix_achat: 'prixAchat',
};

interface Brute {
  codeBarres?: string;
  nom?: string;
  prixTtc?: string;
  tauxTva?: string;
  unite?: string;
  categorie?: string;
  seuilAlerte?: string;
  prixAchat?: string;
}

const normaliser = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

function valeurCellule(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return valeurCellule(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

/** Lit un CSV simple (séparateur ; ou ,) avec guillemets. */
export function lireCsv(texte: string): string[][] {
  const contenu = texte.replace(/^﻿/, '');
  const premiere = contenu.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (premiere.match(/;/g)?.length ?? 0) >= (premiere.match(/,/g)?.length ?? 0) ? ';' : ',';
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let guillemets = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (guillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenu[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((c) => c.trim() !== ''));
}

export async function lireXlsx(contenu: Buffer): Promise<string[][]> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as unknown as ArrayBuffer);
  const feuille = classeur.worksheets[0];
  if (!feuille) return [];
  const lignes: string[][] = [];
  feuille.eachRow({ includeEmpty: false }, (row) => {
    const valeurs: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) valeurs.push(valeurCellule(row.getCell(c).value));
    lignes.push(valeurs);
  });
  return lignes;
}

const entier = (s: string | undefined) => {
  const v = (s ?? '').replace(/[\s  ]/g, '');
  return /^\d+$/.test(v) ? Number(v) : null;
};

/** Transforme les lignes du fichier en articles validés, ou en liste d'erreurs par ligne. */
export function analyserLignes(tableau: string[][]): {
  articles: LigneImport[];
  erreurs: ErreurLigne[];
} {
  const erreurs: ErreurLigne[] = [];
  const articles: LigneImport[] = [];
  const [entetes, ...donnees] = tableau;
  if (!entetes) return { articles, erreurs: [{ ligne: 1, message: 'Le fichier est vide.' }] };

  const index = new Map<keyof Brute, number>();
  entetes.forEach((e, i) => {
    const cle = COLONNES[normaliser(e)];
    if (cle && !index.has(cle)) index.set(cle, i);
  });
  for (const requis of ['codeBarres', 'nom', 'prixTtc'] as const) {
    if (!index.has(requis)) {
      const nom = { codeBarres: 'code_barres', nom: 'nom', prixTtc: 'prix_ttc' }[requis];
      erreurs.push({ ligne: 1, message: `Colonne « ${nom} » introuvable dans la première ligne.` });
    }
  }
  if (erreurs.length) return { articles, erreurs };

  const vus = new Map<string, number>();
  donnees.forEach((cellules, i) => {
    const numero = i + 2;
    const b: Brute = {};
    index.forEach((col, cle) => (b[cle] = (cellules[col] ?? '').trim()));
    const problemes: string[] = [];

    const prixTtc = entier(b.prixTtc);
    if (prixTtc === null) problemes.push('prix TTC invalide (nombre entier de FCFA attendu)');
    const tauxTvaBp = b.tauxTva ? tauxEnPointsDeBase(b.tauxTva) : 1925;
    if (tauxTvaBp === null) problemes.push('taux de TVA invalide (ex. 19,25 ou 0)');
    const unite = !b.unite
      ? 'PIECE'
      : /^(kg|kilo|kilogramme)$/i.test(b.unite)
        ? 'KG'
        : /^(piece|pièce|u|unite|unité)$/i.test(b.unite)
          ? 'PIECE'
          : null;
    if (unite === null) problemes.push('unité invalide (PIECE ou KG)');
    const seuil = b.seuilAlerte ? entier(b.seuilAlerte) : 0;
    if (seuil === null) problemes.push('seuil d’alerte invalide');
    const prixAchat = b.prixAchat ? entier(b.prixAchat) : null;
    if (b.prixAchat && prixAchat === null) problemes.push('prix d’achat invalide');

    if (problemes.length === 0) {
      const r = creationArticleSchema.safeParse({
        codeBarres: b.codeBarres,
        nom: b.nom,
        prixTtc,
        tauxTvaBp,
        unite,
        seuilAlerte: seuil,
        dernierPrixAchat: prixAchat,
      });
      if (!r.success) problemes.push(...r.error.issues.map((x) => x.message));
      else {
        const doublon = vus.get(r.data.codeBarres);
        if (doublon) problemes.push(`code-barres déjà présent ligne ${doublon}`);
        else {
          vus.set(r.data.codeBarres, numero);
          articles.push({ ...r.data, categorie: b.categorie || null });
        }
      }
    }
    if (problemes.length) erreurs.push({ ligne: numero, message: problemes.join(' ; ') });
  });
  if (donnees.length === 0) erreurs.push({ ligne: 2, message: 'Aucun article dans le fichier.' });
  return { articles, erreurs };
}
