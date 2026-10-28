import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Acteur } from '../auth/acteur.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface EntreeAudit {
  action: string;
  entite: string;
  entiteId?: string | null;
  avant?: unknown;
  apres?: unknown;
  /** Auteur réel de l'action quand il diffère de l'acteur (ex. gérant qui valide par PIN). */
  userId?: string | null;
}

type Client = Prisma.TransactionClient | PrismaService;

const json = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Journal des actions sensibles. Les lignes ne sont jamais modifiées (trigger en base). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(acteur: Acteur, e: EntreeAudit, client: Client = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        organizationId: acteur.organizationId,
        userId: e.userId ?? acteur.userId,
        registerId: acteur.registerId,
        action: e.action,
        entity: e.entite,
        entityId: e.entiteId ?? null,
        before: json(e.avant),
        after: json(e.apres),
      },
    });
  }
}
