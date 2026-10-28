/**
 * Création de l'organisation et du premier directeur (une seule fois, en recette ou en production) :
 *   SEED_ORG_NAME=... SEED_ADMIN_NAME=... SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node dist/seed.js
 * Avec SEED_DEMO=1 : ajoute un magasin, une caisse, un gérant, un caissier et des articles de test.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { hacherPin } from '@caisse/shared';

const db = new PrismaClient();

function exiger(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable ${nom} manquante.`);
  return v;
}

async function main() {
  let org = await db.organization.findFirst();
  if (!org) {
    org = await db.organization.create({
      data: {
        name: exiger('SEED_ORG_NAME'),
        niu: process.env.SEED_ORG_NIU ?? null,
        rccm: process.env.SEED_ORG_RCCM ?? null,
        address: process.env.SEED_ORG_ADDRESS ?? null,
        phone: process.env.SEED_ORG_PHONE ?? null,
      },
    });
    const motDePasse = exiger('SEED_ADMIN_PASSWORD');
    if (motDePasse.length < 10) throw new Error('SEED_ADMIN_PASSWORD : 10 caractères minimum.');
    await db.user.create({
      data: {
        organizationId: org.id,
        name: process.env.SEED_ADMIN_NAME ?? 'Directeur',
        email: exiger('SEED_ADMIN_EMAIL').toLowerCase(),
        passwordHash: await hash(motDePasse),
        role: 'DIRECTEUR',
      },
    });
    console.log(`Organisation « ${org.name} » et directeur créés.`);
  } else {
    console.log(`Organisation « ${org.name} » déjà présente : rien à créer.`);
  }

  if (process.env.SEED_DEMO !== '1') return;
  if (await db.store.findFirst({ where: { organizationId: org.id, code: 'M01' } })) {
    console.log('Données de démonstration déjà présentes.');
    return;
  }
  const store = await db.store.create({
    data: { organizationId: org.id, code: 'M01', name: 'Magasin Akwa', address: 'Douala' },
  });
  await db.register.create({ data: { organizationId: org.id, storeId: store.id, code: 'C01' } });
  await db.user.create({
    data: {
      organizationId: org.id,
      storeId: store.id,
      name: 'Gérant Démo',
      email: 'gerant@demo.cm',
      passwordHash: await hash('gerant-demo-2026'),
      pinHash: await hacherPin('9999'),
      role: 'GERANT',
    },
  });
  await db.user.create({
    data: {
      organizationId: org.id,
      storeId: store.id,
      name: 'Caissière Démo',
      pinHash: await hacherPin('1234'),
      role: 'CAISSIER',
    },
  });
  const cat = await db.category.create({ data: { organizationId: org.id, name: 'Épicerie' } });
  const articles: [string, string, number, number, 'PIECE' | 'KG'][] = [
    ['6001234000011', 'Riz parfumé 5 kg', 6500, 1925, 'PIECE'],
    ['6001234000028', 'Huile végétale 1 L', 1500, 1925, 'PIECE'],
    ['6001234000035', 'Sucre en morceaux 1 kg', 1000, 1925, 'PIECE'],
    ['6001234000042', 'Lait concentré sucré 397 g', 750, 1925, 'PIECE'],
    ['6001234000059', 'Eau minérale 1,5 L', 400, 1925, 'PIECE'],
    ['6001234000066', 'Pain de mie', 1200, 0, 'PIECE'],
    ['2000000000107', 'Tomates (au kg)', 800, 0, 'KG'],
  ];
  for (const [barcode, name, priceTtc, vatRateBp, unit] of articles) {
    const p = await db.product.create({
      data: {
        organizationId: org.id,
        categoryId: cat.id,
        barcode,
        name,
        priceTtc,
        vatRateBp,
        unit,
        alertThreshold: 5,
      },
    });
    const quantite = unit === 'KG' ? 50_000 : 100;
    await db.stockMovement.create({
      data: {
        organizationId: org.id,
        productId: p.id,
        storeId: store.id,
        type: 'AJUSTEMENT',
        quantity: quantite,
        reference: 'Stock initial (démo)',
      },
    });
    await db.stockLevel.create({
      data: { organizationId: org.id, productId: p.id, storeId: store.id, quantity: quantite },
    });
  }
  console.log(
    'Données de démonstration créées : magasin M01, caisse C01, gérant (PIN 9999), caissière (PIN 1234).',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
