import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators.js';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Santé')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ description: 'L’API et la base de données répondent.' })
  @ApiServiceUnavailableResponse({ description: 'La base de données ne répond pas.' })
  async check(): Promise<{ statut: 'ok'; base: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'BASE_INDISPONIBLE',
        'La base de données ne répond pas pour le moment.',
      );
    }
    return { statut: 'ok', base: 'ok' };
  }
}
