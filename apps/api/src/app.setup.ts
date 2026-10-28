import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/** Configuration commune à l'application et aux tests : préfixe, sécurité, erreurs, OpenAPI. */
export function setupApp(app: INestApplication, env: Pick<Env, 'CORS_ORIGINS'>): void {
  // Un lot de ventes de caisse peut dépasser la limite par défaut de 100 ko.
  (app as NestExpressApplication).useBodyParser('json', { limit: '5mb' });
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  // Pas de « upgrade-insecure-requests » : la version de bureau sert l'application sur http://localhost.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('API Caisse & facturation')
    .setDescription('API de la caisse et du back-office. Montants en FCFA entiers.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
