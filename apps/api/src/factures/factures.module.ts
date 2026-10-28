import { Module } from '@nestjs/common';
import { FacturesController } from './factures.controller.js';
import { FacturesService } from './factures.service.js';

@Module({ controllers: [FacturesController], providers: [FacturesService] })
export class FacturesModule {}
