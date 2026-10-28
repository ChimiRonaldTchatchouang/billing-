import { Module } from '@nestjs/common';
import { RapportsController } from './rapports.controller.js';
import { RapportsService } from './rapports.service.js';

@Module({ controllers: [RapportsController], providers: [RapportsService] })
export class RapportsModule {}
