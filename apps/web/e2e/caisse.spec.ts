import { expect, type Page, test } from '@playwright/test';

async function connexionBackOffice(page: Page, email: string, motDePasse: string) {
  await page.goto('/admin');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(motDePasse);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('link', { name: 'Caisses' })).toBeVisible();
}

async function taperPin(page: Page, pin: string) {
  for (const c of pin) await page.getByRole('button', { name: c, exact: true }).click();
}

test('parcours caisse : enregistrement du poste, PIN, scan, encaissement espèces, ticket, envoi', async ({
  page,
  context,
}) => {
  // 1. Le gérant obtient le code d'enregistrement dans le back-office.
  await connexionBackOffice(page, 'gerant@demo.cm', 'gerant-demo-2026');
  await page.getByRole('link', { name: 'Caisses' }).click();
  await page.getByRole('button', { name: 'Code d’enregistrement' }).click();
  const code = (await page.locator('p.font-mono').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{8}$/);

  // 2. Le poste est enregistré avec ce code.
  const caisse = await context.newPage();
  await caisse.goto('/caisse');
  await caisse.getByLabel('Code d’enregistrement').fill(code);
  await caisse.getByRole('button', { name: 'Enregistrer le poste' }).click();

  // 3. Connexion par PIN et ouverture de la caisse.
  await caisse.getByRole('button', { name: /Caissière Démo/ }).click();
  await taperPin(caisse, '1234');
  await caisse.getByLabel('Fond de caisse (FCFA)').fill('20000');
  await caisse.getByRole('button', { name: 'Ouvrir la caisse' }).click();

  // 4. Scan de deux articles (la douchette tape le code puis Entrée), chronométré.
  const scan = caisse.getByLabel('Code-barres ou nom de l’article');
  const debut = Date.now();
  await scan.fill('6001234000011');
  await scan.press('Enter');
  await expect(caisse.getByText('Riz parfumé 5 kg')).toBeVisible();
  expect(Date.now() - debut).toBeLessThan(1000);
  await scan.press('Backspace');
  // Rafale comme une douchette : plusieurs codes sans attendre que l'écran soit redessiné.
  await caisse.evaluate(() => {
    const champ = document.querySelector<HTMLInputElement>(
      'input[aria-label="Code-barres ou nom de l’article"]',
    )!;
    const valeur = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    for (const c of ['6001234000028', '6001234000028', '6001234000059']) {
      valeur.call(champ, c);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
      champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await expect(caisse.getByText('Eau minérale 1,5 L')).toBeVisible();
  await expect(caisse.getByRole('button', { name: '2', exact: true })).toBeVisible();
  await expect(caisse.getByText('9 900 FCFA').first()).toBeVisible();

  // 5. Encaissement en espèces avec rendu monnaie.
  await caisse.getByRole('button', { name: 'Encaisser (F2)' }).click();
  await caisse.getByLabel(/Espèces reçues/).fill('10000');
  await expect(caisse.getByText('Rendu :')).toContainText('100 FCFA');
  await caisse.evaluate(() => (window.print = () => undefined));
  await caisse.getByRole('button', { name: 'Valider et imprimer' }).click();
  await expect(caisse.getByText('Dernier ticket')).toContainText('M01-C01-000001');

  // 6. La vente part au serveur : le voyant repasse au vert.
  await expect(caisse.getByRole('status')).toHaveText('En ligne', { timeout: 20_000 });
});

test('hors ligne : la vente est gardée puis envoyée au retour du réseau', async ({
  page,
  context,
}) => {
  await connexionBackOffice(page, 'gerant@demo.cm', 'gerant-demo-2026');
  await page.getByRole('link', { name: 'Caisses' }).click();
  await page.getByRole('button', { name: 'Code d’enregistrement' }).click();
  const code = (await page.locator('p.font-mono').textContent())!.trim();

  const caisse = await context.newPage();
  await caisse.goto('/caisse');
  await caisse.getByLabel('Code d’enregistrement').fill(code);
  await caisse.getByRole('button', { name: 'Enregistrer le poste' }).click();
  await caisse.getByRole('button', { name: /Caissière Démo/ }).click();
  await taperPin(caisse, '1234');
  // Nouveau poste (nouveau navigateur) : la caisse est ouverte sur ce poste.
  await caisse.getByLabel('Fond de caisse (FCFA)').fill('0');
  await caisse.getByRole('button', { name: 'Ouvrir la caisse' }).click();
  await expect(caisse.getByRole('status')).toHaveText('En ligne', { timeout: 20_000 });

  await context.setOffline(true);
  const scan = caisse.getByLabel('Code-barres ou nom de l’article');
  await scan.fill('6001234000059');
  await scan.press('Enter');
  await caisse.getByRole('button', { name: 'Encaisser (F2)' }).click();
  await caisse.getByLabel(/Espèces reçues/).fill('400');
  await caisse.evaluate(() => (window.print = () => undefined));
  await caisse.getByRole('button', { name: 'Valider et imprimer' }).click();
  await expect(caisse.getByRole('status')).toContainText('Ventes en attente d’envoi (1)', {
    timeout: 20_000,
  });

  await context.setOffline(false);
  await expect(caisse.getByRole('status')).toHaveText('En ligne', { timeout: 30_000 });
});

test('retour sur ticket puis clôture de caisse avec écart', async ({ page, context }) => {
  await connexionBackOffice(page, 'gerant@demo.cm', 'gerant-demo-2026');
  await page.getByRole('link', { name: 'Caisses' }).click();
  await page.getByRole('button', { name: 'Code d’enregistrement' }).click();
  const code = (await page.locator('p.font-mono').textContent())!.trim();

  const caisse = await context.newPage();
  await caisse.goto('/caisse');
  await caisse.getByLabel('Code d’enregistrement').fill(code);
  await caisse.getByRole('button', { name: 'Enregistrer le poste' }).click();
  await caisse.getByRole('button', { name: /Caissière Démo/ }).click();
  await taperPin(caisse, '1234');
  await caisse.getByLabel('Fond de caisse (FCFA)').fill('5000');
  await caisse.getByRole('button', { name: 'Ouvrir la caisse' }).click();
  await caisse.evaluate(() => (window.print = () => undefined));

  // Vente : 2 sucres à 1 000 FCFA, payés 2 000 en espèces.
  const scan = caisse.getByLabel('Code-barres ou nom de l’article');
  await scan.fill('sucre');
  await caisse.getByRole('button', { name: /Sucre en morceaux/ }).click();
  await caisse.getByRole('button', { name: 'Ajouter une unité' }).click();
  await caisse.getByRole('button', { name: 'Encaisser (F2)' }).click();
  await caisse.getByLabel(/Espèces reçues/).fill('2000');
  await caisse.getByRole('button', { name: 'Valider et imprimer' }).click();
  const ticket = (await caisse.locator('aside .font-mono').textContent())!.trim();
  await expect(caisse.getByRole('status')).toHaveText('En ligne', { timeout: 20_000 });

  // Retour d'un sucre, validé par le PIN du gérant (vérifié par le serveur).
  await caisse.getByRole('button', { name: 'Retour' }).click();
  await caisse.getByLabel('Numéro du ticket').fill(ticket);
  await caisse.getByRole('button', { name: 'Rechercher' }).click();
  await caisse.getByLabel('Quantité reprise : Sucre en morceaux 1 kg').fill('1');
  await caisse.getByLabel('Motif du retour').fill('Paquet ouvert');
  await taperPin(caisse, '9999');
  await expect(caisse.getByText('À rembourser :')).toContainText('1 000 FCFA');
  await caisse.getByRole('button', { name: 'Terminer' }).click();

  // Clôture : 5 000 fond + 2 000 − 1 000 = 6 000 attendus ; 5 900 comptés → écart −100.
  await caisse.getByRole('button', { name: 'Clôturer' }).click();
  await caisse.getByLabel('Espèces (FCFA)').fill('5900');
  await taperPin(caisse, '9999');
  await expect(caisse.getByRole('dialog', { name: 'Caisse clôturée' })).toContainText('-100 FCFA');
  await caisse.getByRole('button', { name: 'Terminer' }).click();
  await expect(caisse.getByText('Qui ouvre la caisse ?')).toBeVisible();

  // Le gérant voit la session clôturée et son écart dans le back-office.
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('link', { name: 'Sessions de caisse' }).click();
  await expect(page.getByRole('cell', { name: '-100 FCFA' })).toBeVisible();
});

test('back-office : tableau de bord, facture d’un ticket, rapprochement Mobile Money', async ({
  page,
  context,
}) => {
  // Une vente payée en Orange Money depuis un nouveau poste.
  await connexionBackOffice(page, 'gerant@demo.cm', 'gerant-demo-2026');
  await page.getByRole('link', { name: 'Caisses' }).click();
  await page.getByRole('button', { name: 'Code d’enregistrement' }).click();
  const code = (await page.locator('p.font-mono').textContent())!.trim();
  await page.getByRole('button', { name: 'Fermer' }).click();
  const caisse = await context.newPage();
  await caisse.goto('/caisse');
  await caisse.getByLabel('Code d’enregistrement').fill(code);
  await caisse.getByRole('button', { name: 'Enregistrer le poste' }).click();
  await caisse.getByRole('button', { name: /Caissière Démo/ }).click();
  await taperPin(caisse, '1234');
  await caisse.getByLabel('Fond de caisse (FCFA)').fill('0');
  await caisse.getByRole('button', { name: 'Ouvrir la caisse' }).click();
  await caisse.evaluate(() => (window.print = () => undefined));
  const scan = caisse.getByLabel('Code-barres ou nom de l’article');
  await scan.fill('6001234000011');
  await scan.press('Enter');
  await caisse.getByRole('button', { name: 'Encaisser (F2)' }).click();
  await caisse.getByLabel(/Paiement Mobile Money/).check();
  await caisse.getByLabel('Numéro du client').fill('690112233');
  await caisse.getByLabel('Référence de la transaction').fill('MP261028.E2E.0001');
  await caisse.getByRole('button', { name: 'Valider et imprimer' }).click();
  await expect(caisse.getByRole('status')).toHaveText('En ligne', { timeout: 20_000 });

  // Tableau de bord.
  await page.getByRole('link', { name: 'Tableau de bord' }).click();
  await expect(page.getByText('Mobile Money à rapprocher').first()).toBeVisible();

  // Facture depuis le détail de la vente.
  await page.getByRole('link', { name: 'Ventes' }).click();
  await page
    .getByRole('row', { name: /Orange Money/ })
    .getByRole('button', { name: 'Détail' })
    .click();
  await page.getByLabel('Raison sociale').fill('Boulangerie du Port SARL');
  await page.getByLabel('NIU du client').fill('P012345678901Q');
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  await expect(page.getByText(/Facture FA-\d{6}/)).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Rapprochement.
  await page.getByRole('link', { name: 'Mobile Money' }).click();
  await page.getByLabel('Choisir MP261028.E2E.0001').check();
  await page.getByRole('button', { name: 'Rapprochés' }).click();
  await expect(page.getByText('MP261028.E2E.0001')).toHaveCount(0);
});
