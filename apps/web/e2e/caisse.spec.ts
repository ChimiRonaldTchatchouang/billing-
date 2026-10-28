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
  await scan.fill('6001234000028');
  await scan.press('Enter');
  await scan.fill('6001234000028');
  await scan.press('Enter');
  await expect(caisse.getByText('9 500 FCFA').first()).toBeVisible();

  // 5. Encaissement en espèces avec rendu monnaie.
  await caisse.getByRole('button', { name: 'Encaisser (F2)' }).click();
  await caisse.getByLabel(/Espèces reçues/).fill('10000');
  await expect(caisse.getByText('Rendu :')).toContainText('500 FCFA');
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
