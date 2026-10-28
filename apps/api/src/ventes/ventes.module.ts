import { Module } from '@nestjs/common';
import { VentesController } from './ventes.controller.js';
import { VentesService } from './ventes.service.js';

@Module({ controllers: [VentesController], providers: [VentesService], exports: [VentesService] })
export class VentesModule {}
