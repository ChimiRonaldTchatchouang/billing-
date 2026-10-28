import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { VentesModule } from '../ventes/ventes.module.js';
import { CaisseController } from './caisse.controller.js';
import { CaisseService } from './caisse.service.js';

@Module({
  imports: [SyncModule, VentesModule],
  controllers: [CaisseController],
  providers: [CaisseService],
})
export class CaisseModule {}
