import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ventilerTtc } from '@caisse/shared';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bornesJour } from '../ventes/ventes.service.js';

const FUSEAU = 'Africa/Douala';
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/** Date du jour à Douala (AAAA-MM-JJ). */
export function aujourdhui(maintenant = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(maintenant);
}

function decalerJour(jour: string, delta: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class RapportsService {
  constructor(private readonly prisma: PrismaService) {}

  private filtreMagasin(storeId?: string) {
    return storeId ? Prisma.sql`AND r.store_id = ${storeId}::uuid` : Prisma.empty;
  }

  async tableauDeBord(acteur: Acteur, storeIdDemande?: string) {
    const storeId = magasinAutorise(acteur, storeIdDemande);
    const org = acteur.organizationId;
    const jour = aujourdhui();
    const debut7 = bornesJour(decalerJour(jour, -6));
    const finJour = bornesJour(jour, true);
    const debutJour = bornesJour(jour);
    const mag = this.filtreMagasin(storeId);

    const parMagasin = await this.prisma.$queryRaw<
      { code: string; nom: string; tickets: bigint; ttc: bigint | null; retours: bigint | null }[]
    >`
      SELECT st.code, st.name AS nom,
        COUNT(*) FILTER (WHERE s.status = 'VALIDEE') AS tickets,
        SUM(s.total_ttc) FILTER (WHERE s.status = 'VALIDEE') AS ttc,
        SUM(s.total_ttc) FILTER (WHERE s.status = 'RETOUR') AS retours
      FROM sales s JOIN registers r ON r.id = s.register_id JOIN stores st ON st.id = r.store_id
      WHERE s.organization_id = ${org}::uuid AND s.created_at BETWEEN ${debutJour} AND ${finJour} ${mag}
      GROUP BY st.code, st.name ORDER BY st.code`;

    const serie = await this.prisma.$queryRaw<{ jour: string; net: bigint | null }[]>`
      SELECT to_char(s.created_at AT TIME ZONE ${FUSEAU}, 'YYYY-MM-DD') AS jour,
        SUM(CASE WHEN s.status = 'RETOUR' THEN -s.total_ttc ELSE s.total_ttc END) AS net
      FROM sales s JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND s.created_at BETWEEN ${debut7} AND ${finJour} ${mag}
      GROUP BY 1 ORDER BY 1`;
    const parJour = new Map(serie.map((s) => [s.jour, n(s.net)]));

    const top = await this.prisma.$queryRaw<
      { nom: string; quantite: bigint; unite: string; ttc: bigint }[]
    >`
      SELECT l.label AS nom, SUM(l.quantity) AS quantite, MIN(l.unit::text) AS unite, SUM(l.total_ttc) AS ttc
      FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND s.status = 'VALIDEE' AND s.created_at BETWEEN ${debutJour} AND ${finJour} ${mag}
      GROUP BY l.label ORDER BY ttc DESC LIMIT 5`;

    const magStock = storeId ? Prisma.sql`AND sl.store_id = ${storeId}::uuid` : Prisma.empty;
    const [stock] = await this.prisma.$queryRaw<{ bas: bigint; negatif: bigint }[]>`
      SELECT COUNT(*) FILTER (WHERE sl.quantity <= (CASE WHEN p.unit = 'KG' THEN p.alert_threshold * 1000 ELSE p.alert_threshold END)) AS bas,
             COUNT(*) FILTER (WHERE sl.quantity < 0) AS negatif
      FROM stock_levels sl JOIN products p ON p.id = sl.product_id
      WHERE sl.organization_id = ${org}::uuid AND p.active ${magStock}`;
    const [momo] = await this.prisma.$queryRaw<{ nombre: bigint; montant: bigint | null }[]>`
      SELECT COUNT(*) AS nombre, SUM(p.amount) AS montant
      FROM payments p JOIN sales s ON s.id = p.sale_id JOIN registers r ON r.id = s.register_id
      WHERE p.organization_id = ${org}::uuid AND p.status = 'A_RAPPROCHER' ${mag}`;
    const [prix] = await this.prisma.$queryRaw<{ nombre: bigint }[]>`
      SELECT COUNT(*) AS nombre FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND l.catalog_price_ttc IS NOT NULL AND s.created_at BETWEEN ${debutJour} AND ${finJour} ${mag}`;
    const caisses = await this.prisma.$queryRaw<{ caisse: string; derniere: Date | null }[]>`
      SELECT st.code || '-' || r.code AS caisse, r.last_sync_at AS derniere
      FROM cash_sessions cs JOIN registers r ON r.id = cs.register_id JOIN stores st ON st.id = r.store_id
      WHERE cs.organization_id = ${org}::uuid AND cs.status = 'OUVERTE' ${mag}
      ORDER BY 1`;
    const silence = Date.now() - 30 * 60_000;

    const totalTtc = parMagasin.reduce((a, m) => a + n(m.ttc), 0);
    const tickets = parMagasin.reduce((a, m) => a + n(m.tickets), 0);
    const retours = parMagasin.reduce((a, m) => a + n(m.retours), 0);
    return {
      jour,
      ventes: {
        tickets,
        chiffreAffairesTtc: totalTtc,
        retours,
        net: totalTtc - retours,
        panierMoyen: tickets ? Math.round(totalTtc / tickets) : 0,
        parMagasin: parMagasin.map((m) => ({
          code: m.code,
          nom: m.nom,
          tickets: n(m.tickets),
          ttc: n(m.ttc),
          retours: n(m.retours),
        })),
      },
      septJours: Array.from({ length: 7 }, (_, i) => {
        const j = decalerJour(jour, i - 6);
        return { jour: j, net: parJour.get(j) ?? 0 };
      }),
      meilleursArticles: top.map((t) => ({
        nom: t.nom,
        quantite: n(t.quantite),
        unite: t.unite,
        ttc: n(t.ttc),
      })),
      alertes: {
        stockBas: n(stock?.bas),
        stockNegatif: n(stock?.negatif),
        mobileMoneyARapprocher: { nombre: n(momo?.nombre), montant: n(momo?.montant) },
        ecartsPrixDuJour: n(prix?.nombre),
        caissesOuvertes: caisses.map((c) => ({
          caisse: c.caisse,
          derniereSynchronisation: c.derniere,
          silencieuse: !c.derniere || c.derniere.getTime() < silence,
        })),
      },
    };
  }

  private periode(acteur: Acteur, f: { storeId?: string; du: string; au: string }) {
    if (f.du > f.au)
      throw invalide('PERIODE_INVALIDE', 'La date de début est après la date de fin.');
    const jours = (Date.parse(f.au) - Date.parse(f.du)) / 86_400_000;
    if (jours > 366) throw invalide('PERIODE_TROP_LONGUE', 'La période est limitée à un an.');
    return {
      storeId: magasinAutorise(acteur, f.storeId),
      debut: bornesJour(f.du),
      fin: bornesJour(f.au, true),
    };
  }

  async ventes(acteur: Acteur, f: { storeId?: string; du: string; au: string }) {
    const { storeId, debut, fin } = this.periode(acteur, f);
    const org = acteur.organizationId;
    const mag = this.filtreMagasin(storeId);
    const parJour = await this.prisma.$queryRaw<
      {
        jour: string;
        tickets: bigint;
        ttc: bigint | null;
        ht: bigint | null;
        tva: bigint | null;
        remises: bigint | null;
        retours: bigint | null;
        retours_tva: bigint | null;
      }[]
    >`
      SELECT to_char(s.created_at AT TIME ZONE ${FUSEAU}, 'YYYY-MM-DD') AS jour,
        COUNT(*) FILTER (WHERE s.status = 'VALIDEE') AS tickets,
        SUM(s.total_ttc) FILTER (WHERE s.status = 'VALIDEE') AS ttc,
        SUM(s.total_ht) FILTER (WHERE s.status = 'VALIDEE') AS ht,
        SUM(s.total_vat) FILTER (WHERE s.status = 'VALIDEE') AS tva,
        SUM(s.discount) FILTER (WHERE s.status = 'VALIDEE') AS remises,
        SUM(s.total_ttc) FILTER (WHERE s.status = 'RETOUR') AS retours,
        SUM(s.total_vat) FILTER (WHERE s.status = 'RETOUR') AS retours_tva
      FROM sales s JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND s.created_at BETWEEN ${debut} AND ${fin} ${mag}
      GROUP BY 1 ORDER BY 1`;
    const parMode = await this.prisma.$queryRaw<
      { mode: string; encaisse: bigint | null; rembourse: bigint | null }[]
    >`
      SELECT p.mode::text AS mode,
        SUM(p.amount) FILTER (WHERE s.status = 'VALIDEE') AS encaisse,
        SUM(p.amount) FILTER (WHERE s.status = 'RETOUR') AS rembourse
      FROM payments p JOIN sales s ON s.id = p.sale_id JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND s.created_at BETWEEN ${debut} AND ${fin} ${mag}
      GROUP BY 1 ORDER BY 1`;
    // TVA par taux : ventilée vente par vente (comme sur les tickets), puis additionnée.
    const parVenteTaux = await this.prisma.$queryRaw<
      { taux: number; signe: number; ttc: bigint }[]
    >`
      SELECT l.vat_rate_bp AS taux, CASE WHEN s.status = 'RETOUR' THEN -1 ELSE 1 END AS signe, SUM(l.total_ttc) AS ttc
      FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN registers r ON r.id = s.register_id
      WHERE s.organization_id = ${org}::uuid AND s.created_at BETWEEN ${debut} AND ${fin} ${mag}
      GROUP BY s.id, l.vat_rate_bp, s.status`;
    const taux = new Map<number, { ht: number; tva: number; ttc: number }>();
    for (const l of parVenteTaux) {
      const v = ventilerTtc(n(l.ttc), l.taux);
      const t = taux.get(l.taux) ?? { ht: 0, tva: 0, ttc: 0 };
      taux.set(l.taux, {
        ht: t.ht + l.signe * v.ht,
        tva: t.tva + l.signe * v.tva,
        ttc: t.ttc + l.signe * v.ttc,
      });
    }
    const jours = parJour.map((j) => ({
      jour: j.jour,
      tickets: n(j.tickets),
      ttc: n(j.ttc),
      ht: n(j.ht),
      tva: n(j.tva),
      remises: n(j.remises),
      retours: n(j.retours),
      net: n(j.ttc) - n(j.retours),
      tvaNette: n(j.tva) - n(j.retours_tva),
    }));
    const somme = (k: keyof (typeof jours)[number]) =>
      jours.reduce((a, j) => a + (j[k] as number), 0);
    return {
      du: f.du,
      au: f.au,
      totaux: {
        tickets: somme('tickets'),
        ttc: somme('ttc'),
        ht: somme('ht'),
        tva: somme('tva'),
        remises: somme('remises'),
        retours: somme('retours'),
        net: somme('net'),
        tvaNette: somme('tvaNette'),
      },
      parJour: jours,
      parMode: parMode.map((m) => ({
        mode: m.mode,
        encaisse: n(m.encaisse),
        rembourse: n(m.rembourse),
        net: n(m.encaisse) - n(m.rembourse),
      })),
      parTaux: [...taux].sort(([a], [b]) => a - b).map(([tauxBp, v]) => ({ tauxBp, ...v })),
    };
  }

  /** Export CSV (séparateur « ; », encodage UTF-8 avec BOM pour Excel) des lignes de vente. */
  async exportCsv(
    acteur: Acteur,
    f: { storeId?: string; du: string; au: string },
  ): Promise<string> {
    const { storeId, debut, fin } = this.periode(acteur, f);
    const mag = this.filtreMagasin(storeId);
    const lignes = await this.prisma.$queryRaw<
      {
        le: string;
        ticket: string;
        magasin: string;
        caisse: string;
        caissier: string;
        statut: string;
        article: string;
        code: string;
        quantite: number;
        unite: string;
        pu: number;
        remise: number;
        taux: number;
        total: number;
      }[]
    >`
      SELECT to_char(s.created_at AT TIME ZONE ${FUSEAU}, 'YYYY-MM-DD HH24:MI') AS le, s.ticket_number AS ticket,
        st.code AS magasin, r.code AS caisse, u.name AS caissier, s.status::text AS statut,
        l.label AS article, p.barcode AS code, l.quantity AS quantite, l.unit::text AS unite,
        l.unit_price_ttc AS pu, l.discount AS remise, l.vat_rate_bp AS taux, l.total_ttc AS total
      FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN registers r ON r.id = s.register_id
      JOIN stores st ON st.id = r.store_id JOIN users u ON u.id = s.user_id JOIN products p ON p.id = l.product_id
      WHERE s.organization_id = ${acteur.organizationId}::uuid AND s.created_at BETWEEN ${debut} AND ${fin} ${mag}
      ORDER BY s.created_at, s.ticket_number
      LIMIT 200000`;
    const champ = (v: string | number) => {
      const s = String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const entete = [
      'Date',
      'Ticket',
      'Magasin',
      'Caisse',
      'Caissier',
      'Type',
      'Article',
      'Code-barres',
      'Quantité',
      'Unité',
      'PU TTC',
      'Remise',
      'TVA (%)',
      'Total TTC',
    ];
    const corps = lignes.map((l) => {
      const signe = l.statut === 'RETOUR' ? -1 : 1;
      const qte =
        l.unite === 'KG' ? (l.quantite / 1000).toFixed(3).replace('.', ',') : String(l.quantite);
      const taux = `${Math.floor(l.taux / 100)}${l.taux % 100 ? ',' + String(l.taux % 100).padStart(2, '0') : ''}`;
      return [
        l.le,
        l.ticket,
        l.magasin,
        l.caisse,
        l.caissier,
        l.statut === 'RETOUR' ? 'Retour' : 'Vente',
        l.article,
        l.code,
        qte,
        l.unite === 'KG' ? 'kg' : 'pièce',
        l.pu,
        l.remise,
        taux,
        signe * l.total,
      ]
        .map(champ)
        .join(';');
    });
    return '\uFEFF' + [entete.join(';'), ...corps].join('\r\n') + '\r\n';
  }
}
