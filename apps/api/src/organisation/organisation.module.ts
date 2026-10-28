import { Module } from '@nestjs/common';
import { OrganisationController } from './organisation.controller.js';
import { OrganisationService } from './organisation.service.js';

@Module({ controllers: [OrganisationController], providers: [OrganisationService] })
export class OrganisationModule {}
