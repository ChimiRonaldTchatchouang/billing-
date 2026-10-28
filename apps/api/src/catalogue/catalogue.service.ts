import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  creationArticleSchema,
  modificationArticleSchema,
  rechercheArticlesSchema,
} from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Acteur } from '../auth/acteur.js';
import { conflit, introuvable, invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { articlePublic } from './article.js';
import { analyserLignes, lireCsv, lireXlsx } from './import.js';

const LIGNES_MAX = 20_000;

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  categories(acteur: Acteur) {
    return this.prisma.category
      .findMany({ where: { organizationId: acteur.organizationId }, orderBy: { name: 'asc' } })
      .then((cs) => cs.map((c) => ({ id: c.id, nom: c.name })));
  }

  async creerCategorie(acteur: Acteur, nom: string) {
    try {
      const c = await this.prisma.category.create({
        data: { organizationId: acteur.organizationId, name: nom },
      });
      return { id: c.id, nom: c.name };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflit('CATEGORIE_EXISTANTE', `La catégorie « ${nom} » existe déjà.`);
      }
      throw e;
    }
  }

  async rechercher(acteur: Acteur, q: z.infer<typeof rechercheArticlesSchema>) {
    const where: Prisma.ProductWhereInput = {
      organizationId: acteur.organizationId,
      ...(q.categorieId ? { categoryId: q.categorieId } : {}),
      ...(q.actif ? { active: q.actif === 'true' } : {}),
      ...(q.recherche
        ? {
            OR: [
              { name: { contains: q.recherche, mode: 'insensitive' } },
              { barcode: { startsWith: q.recherche } },
            ],
          }
        : {}),
    };
    const [total, produits] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { name: 'asc' },
        skip: (q.page - 1) * q.parPage,
        take: q.parPage,
      }),
    ]);
    return { total, page: q.page, parPage: q.parPage, articles: produits.map(articlePublic) };
  }

  async creer(acteur: Acteur, d: z.infer<typeof creationArticleSchema>) {
    await this.verifierCategorie(acteur, d.categorieId);
    try {
      const p = await this.prisma.product.create({
        data: {
          organizationId: acteur.organizationId,
          barcode: d.codeBarres,
          name: d.nom,
          unit: d.unite,
          vatRateBp: d.tauxTvaBp,
          priceTtc: d.prixTtc,
          lastPurchasePrice: d.dernierPrixAchat ?? null,
          alertThreshold: d.seuilAlerte,
          categoryId: d.categorieId ?? null,
        },
        include: { category: true },
      });
      await this.audit.log(acteur, {
        action: 'ARTICLE_CREE',
        entite: 'product',
        entiteId: p.id,
        apres: d,
      });
      return articlePublic(p);
    } catch (e) {
      throw this.traduire(e, d.codeBarres);
    }
  }

  async modifier(acteur: Acteur, id: string, d: z.infer<typeof modificationArticleSchema>) {
    const avant = await this.prisma.product.findFirst({
      where: { id, organizationId: acteur.organizationId },
    });
    if (!avant) throw introuvable('Article');
    await this.verifierCategorie(acteur, d.categorieId);
    try {
      const p = await this.prisma.product.update({
        where: { id },
        data: {
          barcode: d.codeBarres,
          name: d.nom,
          unit: d.unite,
          vatRateBp: d.tauxTvaBp,
          priceTtc: d.prixTtc,
          lastPurchasePrice: d.dernierPrixAchat,
          alertThreshold: d.seuilAlerte,
          categoryId: d.categorieId,
          active: d.actif,
        },
        include: { category: true },
      });
      const prixModifie = d.prixTtc !== undefined && d.prixTtc !== avant.priceTtc;
      await this.audit.log(acteur, {
        action: prixModifie ? 'PRIX_MODIFIE' : 'ARTICLE_MODIFIE',
        entite: 'product',
        entiteId: id,
        avant: articlePublic(avant),
        apres: articlePublic(p),
      });
      return articlePublic(p);
    } catch (e) {
      throw this.traduire(e, d.codeBarres ?? avant.barcode);
    }
  }

  /**
   * Import d'un fichier Excel ou CSV : tout ou rien. Les articles sont créés, ou mis à jour par
   * code-barres. En cas d'erreur, rien n'est importé et chaque ligne fautive est signalée.
   */
  async importer(acteur: Acteur, fichier: { originalname: string; buffer: Buffer }) {
    const nom = fichier.originalname.toLowerCase();
    let tableau: string[][];
    try {
      if (nom.endsWith('.xlsx')) tableau = await lireXlsx(fichier.buffer);
      else if (nom.endsWith('.csv') || nom.endsWith('.txt'))
        tableau = lireCsv(fichier.buffer.toString('utf8'));
      else throw invalide('FORMAT_NON_SUPPORTE', 'Envoyez un fichier Excel (.xlsx) ou CSV (.csv).');
    } catch (e) {
      if (e instanceof Error && 'getStatus' in e) throw e;
      throw invalide(
        'FICHIER_ILLISIBLE',
        'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un fichier Excel ou CSV.',
      );
    }
    if (tableau.length > LIGNES_MAX + 1) {
      throw invalide('FICHIER_TROP_GRAND', `Un import est limité à ${LIGNES_MAX} articles.`);
    }
    const { articles, erreurs } = analyserLignes(tableau);
    if (erreurs.length) {
      throw invalide(
        'IMPORT_INVALIDE',
        `Le fichier contient ${erreurs.length} erreur(s). Rien n’a été importé.`,
        erreurs,
      );
    }

    const org = acteur.organizationId;
    const resultat = await this.prisma.$transaction(
      async (tx) => {
        const noms = [
          ...new Set(articles.map((a) => a.categorie).filter((c): c is string => Boolean(c))),
        ];
        const existantes = await tx.category.findMany({
          where: { organizationId: org, name: { in: noms } },
        });
        const parNom = new Map(existantes.map((c) => [c.name, c.id]));
        for (const n of noms.filter((n) => !parNom.has(n))) {
          const c = await tx.category.create({ data: { organizationId: org, name: n } });
          parNom.set(n, c.id);
        }
        const deja = await tx.product.findMany({
          where: { organizationId: org, barcode: { in: articles.map((a) => a.codeBarres) } },
          select: { id: true, barcode: true },
        });
        const idParCode = new Map(deja.map((p) => [p.barcode, p.id]));
        let crees = 0;
        let modifies = 0;
        for (const a of articles) {
          const data = {
            name: a.nom,
            unit: a.unite,
            vatRateBp: a.tauxTvaBp,
            priceTtc: a.prixTtc,
            alertThreshold: a.seuilAlerte,
            ...(a.dernierPrixAchat != null ? { lastPurchasePrice: a.dernierPrixAchat } : {}),
            ...(a.categorie ? { categoryId: parNom.get(a.categorie)! } : {}),
          };
          const id = idParCode.get(a.codeBarres);
          if (id) {
            await tx.product.update({ where: { id }, data: { ...data, active: true } });
            modifies++;
          } else {
            await tx.product.create({
              data: { ...data, organizationId: org, barcode: a.codeBarres },
            });
            crees++;
          }
        }
        return { crees, modifies };
      },
      { timeout: 120_000 },
    );
    await this.audit.log(acteur, {
      action: 'ARTICLES_IMPORTES',
      entite: 'product',
      apres: { fichier: fichier.originalname, ...resultat },
    });
    return resultat;
  }

  /** Articles modifiés depuis la dernière synchronisation de la caisse, par pages ordonnées. */
  async pourCaisse(acteur: Acteur, depuis: Date | null, apresId: string | null, limite: number) {
    const where: Prisma.ProductWhereInput = {
      organizationId: acteur.organizationId,
      ...(depuis
        ? {
            OR: [
              { updatedAt: { gt: depuis } },
              ...(apresId ? [{ updatedAt: depuis, id: { gt: apresId } }] : [{ updatedAt: depuis }]),
            ],
          }
        : {}),
    };
    const produits = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limite,
    });
    const dernier = produits.at(-1);
    return {
      articles: produits.map(articlePublic),
      suivant:
        produits.length === limite && dernier
          ? { depuis: dernier.updatedAt.toISOString(), apresId: dernier.id }
          : null,
      // Point de reprise de la prochaine synchronisation.
      curseur: dernier ? { depuis: dernier.updatedAt.toISOString(), apresId: dernier.id } : null,
    };
  }

  private async verifierCategorie(acteur: Acteur, id: string | null | undefined) {
    if (!id) return;
    const c = await this.prisma.category.findFirst({
      where: { id, organizationId: acteur.organizationId },
    });
    if (!c) throw introuvable('Catégorie');
  }

  private traduire(e: unknown, code: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return conflit(
        'CODE_BARRES_EXISTANT',
        `Le code-barres ${code} est déjà utilisé par un autre article.`,
      );
    }
    return e;
  }
}
