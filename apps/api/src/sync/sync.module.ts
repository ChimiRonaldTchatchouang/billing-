import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { SyncController } from './sync.controller.js';
import { VentesSyncService } from './ventes-sync.service.js';

@Module({
  imports: [CatalogueModule],
  controllers: [SyncController],
  providers: [VentesSyncService],
})
export class SyncModule {}
