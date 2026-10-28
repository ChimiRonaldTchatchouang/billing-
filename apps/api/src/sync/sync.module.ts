import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module.js';
import { SyncController } from './sync.controller.js';

@Module({ imports: [CatalogueModule], controllers: [SyncController] })
export class SyncModule {}
