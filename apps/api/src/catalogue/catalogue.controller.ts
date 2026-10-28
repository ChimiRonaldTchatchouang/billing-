import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  creationArticleSchema,
  creationCategorieSchema,
  modificationArticleSchema,
  rechercheArticlesSchema,
} from '@caisse/shared';
import type { z } from 'zod';
import { type Acteur, GERANT_PLUS, TOUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { invalide } from '../common/errors.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod.js';
import { CatalogueService } from './catalogue.service.js';

@ApiTags('Catalogue')
@ApiBearerAuth()
@Controller()
export class CatalogueController {
  constructor(private readonly service: CatalogueService) {}

  @Get('categories')
  @Autoriser(...TOUS)
  categories(@ActeurCourant() a: Acteur) {
    return this.service.categories(a);
  }

  @Post('categories')
  @Autoriser(...GERANT_PLUS)
  @ApiZodBody(creationCategorieSchema)
  creerCategorie(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(creationCategorieSchema)) b: z.infer<typeof creationCategorieSchema>,
  ) {
    return this.service.creerCategorie(a, b.nom);
  }

  @Get('products')
  @Autoriser(...TOUS)
  @ApiOperation({ summary: 'Rechercher des articles (nom ou début de code-barres)' })
  @ApiZodQuery(rechercheArticlesSchema)
  rechercher(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(rechercheArticlesSchema)) q: z.infer<typeof rechercheArticlesSchema>,
  ) {
    return this.service.rechercher(a, q);
  }

  @Post('products')
  @Autoriser(...GERANT_PLUS)
  @ApiZodBody(creationArticleSchema)
  creer(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(creationArticleSchema)) b: z.infer<typeof creationArticleSchema>,
  ) {
    return this.service.creer(a, b);
  }

  @Patch('products/:id')
  @Autoriser(...GERANT_PLUS)
  @ApiOperation({ summary: 'Modifier un article (un changement de prix est inscrit au journal)' })
  @ApiZodBody(modificationArticleSchema)
  modifier(
    @ActeurCourant() a: Acteur,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(modificationArticleSchema)) b: z.infer<typeof modificationArticleSchema>,
  ) {
    return this.service.modifier(a, id, b);
  }

  @Post('products/import')
  @Autoriser(...GERANT_PLUS)
  @ApiOperation({
    summary: 'Importer des articles depuis Excel ou CSV',
    description:
      'Colonnes : code_barres, nom, prix_ttc (obligatoires) ; taux_tva (19,25 par défaut), unite (PIECE ou KG), categorie, seuil_alerte, prix_achat. Tout ou rien.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { fichier: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: 10 * 1024 * 1024 } }))
  importer(@ActeurCourant() a: Acteur, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw invalide('FICHIER_MANQUANT', 'Choisissez un fichier à importer.');
    return this.service.importer(a, fichier);
  }
}
