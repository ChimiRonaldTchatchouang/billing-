import { formaterTaux } from '@caisse/shared';
import { createPortal } from 'react-dom';
import { formaterDate, formaterFcfa } from '../lib/api';
import type { InfosPoste, VenteLocale } from './db';
import { formaterQuantite } from './panier';

const MODES: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
};

/** Ticket de caisse 80 mm. Rendu hors de l'écran, il n'apparaît qu'à l'impression. */
export function TicketImpression({ vente, poste }: { vente: VenteLocale; poste: InfosPoste }) {
  const t = vente.ticket;
  const o = poste.organisation;
  const m = poste.magasin;
  return createPortal(
    <div id="impression" className="ticket">
      <div className="centre">
        <p className="gras">{o.nom}</p>
        <p>{m.nom}</p>
        {m.adresse && <p>{m.adresse}</p>}
        {m.telephone && <p>Tél. {m.telephone}</p>}
        {o.niu && <p>NIU : {o.niu}</p>}
        {o.rccm && <p>RCCM : {o.rccm}</p>}
      </div>
      <hr />
      <p>Ticket {vente.numeroTicket}</p>
      <p>{formaterDate(vente.creeLe)}</p>
      <p>Caisse : {t.caissier}</p>
      <hr />
      {t.lignes.map((l, i) => (
        <div key={i}>
          <p>{l.libelle}</p>
          <p className="ligne">
            <span>
              {formaterQuantite(l.quantite, l.unite)} × {formaterFcfa(l.prixUnitaireTtc)}
            </span>
            <span>{formaterFcfa(l.net + l.remise)}</span>
          </p>
          {l.remise > 0 && (
            <p className="ligne">
              <span> Remise</span>
              <span>-{formaterFcfa(l.remise)}</span>
            </p>
          )}
        </div>
      ))}
      <hr />
      {t.remise > 0 && (
        <p className="ligne">
          <span>Remises</span>
          <span>-{formaterFcfa(t.remise)}</span>
        </p>
      )}
      <p className="ligne gras grand">
        <span>TOTAL TTC</span>
        <span>{formaterFcfa(t.ttc)}</span>
      </p>
      {t.paiements.map((p, i) => (
        <p key={i} className="ligne">
          <span>{MODES[p.mode] ?? p.mode}</span>
          <span>{formaterFcfa(p.montant)}</span>
        </p>
      ))}
      {t.rendu > 0 && (
        <p className="ligne gras">
          <span>Rendu</span>
          <span>{formaterFcfa(t.rendu)}</span>
        </p>
      )}
      <hr />
      <p className="ligne">
        <span>TVA</span>
        <span>HT / TVA</span>
      </p>
      {t.parTaux.map((v) => (
        <p key={v.tauxBp} className="ligne">
          <span>{formaterTaux(v.tauxBp)}</span>
          <span>
            {formaterFcfa(v.ht)} / {formaterFcfa(v.tva)}
          </span>
        </p>
      ))}
      <hr />
      <p className="centre">Merci de votre visite</p>
    </div>,
    document.body,
  );
}

/** Imprime le ticket : le navigateur en mode kiosque (--kiosk-printing) imprime sans boîte de dialogue. */
export function imprimer(): void {
  requestAnimationFrame(() => window.print());
}
