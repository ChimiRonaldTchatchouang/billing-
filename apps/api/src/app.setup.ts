import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/** Configuration commune à l'application et aux tests : préfixe, sécurité, erreurs, OpenAPI. */
export function setupApp(app: INestApplication, env: Pick<Env, 'CORS_ORIGINS'>): void {
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(helmet());
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
