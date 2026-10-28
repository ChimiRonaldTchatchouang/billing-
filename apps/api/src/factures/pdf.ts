import { formaterTaux, ventilerTtc } from '@caisse/shared';
import PdfPrinter from 'pdfmake';
import vfs from 'pdfmake/build/vfs_fonts.js';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces.js';

const police = (f: string) => Buffer.from(vfs[f]!, 'base64');
const imprimante = new PdfPrinter({
  Roboto: {
    normal: police('Roboto-Regular.ttf'),
    bold: police('Roboto-Medium.ttf'),
    italics: police('Roboto-Italic.ttf'),
    bolditalics: police('Roboto-MediumItalic.ttf'),
  },
});

export interface DonneesFacture {
  type: 'FACTURE' | 'AVOIR';
  numero: string;
  date: Date;
  factureOrigine?: string | null;
  vendeur: {
    nom: string;
    niu: string | null;
    rccm: string | null;
    adresse: string | null;
    telephone: string | null;
    magasin: string;
  };
  client: { raisonSociale: string; niu: string | null; adresse: string | null };
  ticket: string;
  lignes: {
    libelle: string;
    quantite: number;
    unite: 'PIECE' | 'KG';
    prixUnitaireTtc: number;
    remise: number;
    tauxTvaBp: number;
    totalTtc: number;
  }[];
  paiements: { mode: string; montant: number }[];
}

const fcfa = (n: number) =>
  `${new Intl.NumberFormat('fr-FR').format(n).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;
const qte = (q: number, u: 'PIECE' | 'KG') =>
  u === 'KG' ? `${(q / 1000).toLocaleString('fr-FR')} kg` : String(q);
const MODES: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
};

/**
 * Facture ou avoir A4 : mentions du vendeur (raison sociale, NIU, RCCM), NIU du client, détail
 * HT, TVA et TTC par taux. Liste exacte des mentions : A_CONFIRMER avec le comptable du client.
 */
export function definitionFacture(f: DonneesFacture): TDocumentDefinitions {
  const ttcParTaux = new Map<number, number>();
  for (const l of f.lignes)
    ttcParTaux.set(l.tauxTvaBp, (ttcParTaux.get(l.tauxTvaBp) ?? 0) + l.totalTtc);
  const parTaux = [...ttcParTaux].sort(([a], [b]) => a - b).map(([t, ttc]) => ventilerTtc(ttc, t));
  const total = parTaux.reduce(
    (a, v) => ({ ht: a.ht + v.ht, tva: a.tva + v.tva, ttc: a.ttc + v.ttc }),
    { ht: 0, tva: 0, ttc: 0 },
  );
  const v = f.vendeur;
  const titre = f.type === 'AVOIR' ? 'AVOIR' : 'FACTURE';

  const contenu: Content[] = [
    {
      columns: [
        [
          { text: v.nom, style: 'vendeur' },
          v.magasin,
          ...(v.adresse ? [v.adresse] : []),
          ...(v.telephone ? [`Tél. ${v.telephone}`] : []),
          ...(v.niu ? [`NIU : ${v.niu}`] : []),
          ...(v.rccm ? [`RCCM : ${v.rccm}`] : []),
        ],
        [
          { text: `${titre} N° ${f.numero}`, style: 'titre', alignment: 'right' },
          {
            text: `Date : ${f.date.toLocaleDateString('fr-FR', { timeZone: 'Africa/Douala' })}`,
            alignment: 'right',
          },
          { text: `Ticket de caisse : ${f.ticket}`, alignment: 'right' },
          ...(f.factureOrigine
            ? [{ text: `Facture corrigée : ${f.factureOrigine}`, alignment: 'right' as const }]
            : []),
        ],
      ],
    },
    {
      margin: [0, 20, 0, 10],
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: 'Client', bold: true },
                f.client.raisonSociale,
                ...(f.client.adresse ? [f.client.adresse] : []),
                ...(f.client.niu ? [`NIU : ${f.client.niu}`] : []),
              ],
              margin: [6, 6, 6, 6],
            },
          ],
        ],
      },
      layout: 'lightHorizontalLines',
    },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body: [
          ['Désignation', 'Quantité', 'P.U. TTC', 'Remise', 'TVA', 'Total TTC'].map((t) => ({
            text: t,
            bold: true,
          })),
          ...f.lignes.map((l) => [
            l.libelle,
            { text: qte(l.quantite, l.unite), alignment: 'right' as const },
            { text: fcfa(l.prixUnitaireTtc), alignment: 'right' as const },
            { text: l.remise ? fcfa(l.remise) : '', alignment: 'right' as const },
            { text: formaterTaux(l.tauxTvaBp), alignment: 'right' as const },
            { text: fcfa(l.totalTtc), alignment: 'right' as const },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
    {
      margin: [0, 16, 0, 0],
      columns: [
        { width: '*', text: '' },
        {
          width: 'auto',
          table: {
            body: [
              ['Taux', 'Base HT', 'TVA', 'TTC'].map((t) => ({ text: t, bold: true })),
              ...parTaux.map((p) => [formaterTaux(p.tauxBp), fcfa(p.ht), fcfa(p.tva), fcfa(p.ttc)]),
              [
                { text: 'Total', bold: true },
                { text: fcfa(total.ht), bold: true },
                { text: fcfa(total.tva), bold: true },
                { text: fcfa(total.ttc), bold: true },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],
    },
    ...(f.paiements.length
      ? [
          {
            margin: [0, 16, 0, 0] as [number, number, number, number],
            text: `${f.type === 'AVOIR' ? 'Remboursé' : 'Payé'} : ${f.paiements.map((p) => `${MODES[p.mode] ?? p.mode} ${fcfa(p.montant)}`).join(', ')}`,
          },
        ]
      : []),
    { margin: [0, 30, 0, 0], text: 'Montants en francs CFA (XAF).', style: 'petit' },
  ];

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
    info: { title: `${titre} ${f.numero}` },
    content: contenu,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: {
      vendeur: { fontSize: 14, bold: true },
      titre: { fontSize: 16, bold: true },
      petit: { fontSize: 8, color: '#555' },
    },
  };
}

export function genererPdf(f: DonneesFacture): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = imprimante.createPdfKitDocument(definitionFacture(f));
    const morceaux: Buffer[] = [];
    doc.on('data', (c: Buffer) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
    doc.end();
  });
}
