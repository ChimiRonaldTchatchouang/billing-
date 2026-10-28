import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { ENV, type Env } from '../config/env.js';

export interface Message {
  a: string;
  sujet: string;
  html: string;
  pieceJointe?: { nom: string; contenu: Buffer };
}

/**
 * Envoi d'e-mails par l'API HTTP de Resend (le SMTP est bloqué sur Render gratuit).
 * Sans RESEND_API_KEY, les messages sont gardés en mémoire (développement et tests).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Messages non envoyés faute de clé (consultables dans les tests). */
  readonly boite: Message[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  async envoyer(m: Message): Promise<void> {
    if (!this.env.RESEND_API_KEY) {
      if (this.env.NODE_ENV === 'production') {
        throw new ApiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'ENVOI_NON_CONFIGURE',
          'L’envoi d’e-mails n’est pas encore configuré.',
        );
      }
      this.boite.push(m);
      this.logger.log(`E-mail (non envoyé, pas de clé Resend) à ${m.a} : ${m.sujet}`);
      return;
    }
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.env.MAIL_FROM,
          to: [m.a],
          subject: m.sujet,
          html: m.html,
          ...(m.pieceJointe
            ? {
                attachments: [
                  {
                    filename: m.pieceJointe.nom,
                    content: m.pieceJointe.contenu.toString('base64'),
                  },
                ],
              }
            : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'ENVOI_ECHOUE',
        'Le service d’e-mail ne répond pas. Réessayez dans quelques minutes.',
      );
    }
    if (!res.ok) {
      this.logger.error(
        `Resend a refusé l'envoi (${res.status}) : ${await res.text().catch(() => '')}`,
      );
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'ENVOI_ECHOUE',
        'L’e-mail n’a pas pu être envoyé. Vérifiez l’adresse puis réessayez.',
      );
    }
  }
}

const echapper = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Gabarit simple et lisible sur téléphone. */
export function gabarit(
  titre: string,
  paragraphes: string[],
  lien?: { texte: string; url: string },
): string {
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:16px">
<h1 style="font-size:20px;color:#15803d">${echapper(titre)}</h1>
${paragraphes.map((p) => `<p style="line-height:1.5">${echapper(p)}</p>`).join('\n')}
${lien ? `<p><a href="${echapper(lien.url)}" style="display:inline-block;background:#15803d;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${echapper(lien.texte)}</a></p>` : ''}
</body></html>`;
}
