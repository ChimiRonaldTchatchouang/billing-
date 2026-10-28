/** Version de bureau : une fenêtre sur l'application, avec sa propre API et sa propre base. */
import { app, BrowserWindow, dialog, Menu, shell } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demarrer, type Serveur } from './serveur.js';

const ici = dirname(fileURLToPath(import.meta.url));
let serveur: Serveur | null = null;
let fenetre: BrowserWindow | null = null;

const ATTENTE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="fr"><body style="font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;color:#14532d">
<div style="text-align:center"><h1 style="font-size:22px">Caisse & facturation</h1><p>Démarrage en cours… (la première fois, environ 30 secondes)</p></div></body></html>`)}`;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.focus();
    }
  });

  app.whenReady().then(async () => {
    const donnees = app.getPath('userData');
    mkdirSync(donnees, { recursive: true });
    const journal = (m: string) => {
      try {
        appendFileSync(join(donnees, 'journal.log'), `${new Date().toISOString()} ${m}\n`);
      } catch {
        // journal facultatif
      }
    };

    fenetre = new BrowserWindow({
      width: 1366,
      height: 860,
      title: 'Caisse & facturation',
      autoHideMenuBar: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
      // Les PDF (blob:) s'ouvrent dans une fenêtre de l'application ; WhatsApp dans le navigateur.
      if (url.startsWith('blob:') || url === '' || url === 'about:blank')
        return { action: 'allow' };
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    await fenetre.loadURL(ATTENTE);

    try {
      serveur = await demarrer(
        { donnees, application: join(ici, '..'), node: process.execPath },
        journal,
      );
    } catch (e) {
      journal(`Échec du démarrage : ${e instanceof Error ? e.stack : String(e)}`);
      dialog.showErrorBox(
        'Démarrage impossible',
        `${e instanceof Error ? e.message : String(e)}\n\nDétails dans : ${join(donnees, 'journal.log')}\nVérifiez qu'une autre copie de l'application n'est pas déjà ouverte.`,
      );
      app.quit();
      return;
    }

    const aller = (chemin: string) => void fenetre?.loadURL(`${serveur!.url}${chemin}`);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Application',
          submenu: [
            { label: 'Caisse', accelerator: 'CmdOrCtrl+1', click: () => aller('/caisse') },
            { label: 'Back-office', accelerator: 'CmdOrCtrl+2', click: () => aller('/admin') },
            { type: 'separator' },
            {
              label: 'Documentation de l’API',
              click: () => void shell.openExternal(`${serveur!.url}/api/docs`),
            },
            { label: 'Dossier des données', click: () => void shell.openPath(donnees) },
            { type: 'separator' },
            { role: 'reload', label: 'Recharger' },
            { role: 'togglefullscreen', label: 'Plein écran' },
            { role: 'toggleDevTools', label: 'Outils de développement' },
            { type: 'separator' },
            { role: 'quit', label: 'Quitter' },
          ],
        },
        {
          label: 'Aide',
          submenu: [
            {
              label: 'Comptes de démonstration',
              click: () =>
                void dialog.showMessageBox(fenetre!, {
                  type: 'info',
                  title: 'Comptes de démonstration',
                  message: 'Comptes de démonstration',
                  detail:
                    'Back-office :\n  directeur@demo.cm / directeur-demo-2026\n  gerant@demo.cm / gerant-demo-2026\n\nCaisse :\n  1. Back-office > Caisses > « Code d’enregistrement »\n  2. Menu Application > Caisse, saisir le code\n  3. Caissière Démo : PIN 1234 — Gérant Démo : PIN 9999\n\nCodes-barres : 6001234000011 (riz), 6001234000028 (huile), 6001234000042 (lait), 6001234000059 (eau), ou tapez « tomates ».',
                }),
            },
          ],
        },
      ]),
    );
    aller('/admin');
  });

  let arretEnCours = false;
  app.on('before-quit', (e) => {
    if (!serveur || arretEnCours) return;
    e.preventDefault();
    arretEnCours = true;
    void serveur.arreter().finally(() => {
      serveur = null;
      app.quit();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
