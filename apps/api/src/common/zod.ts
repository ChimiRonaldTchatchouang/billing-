import { applyDecorators, HttpStatus, type PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { ApiError } from './api-error.js';

z.config(z.locales.fr());

/** Valide un corps ou des paramètres avec un schéma Zod ; erreur 400 au format standard. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'REQUETE_INVALIDE',
        'Certaines informations sont manquantes ou incorrectes.',
        result.error.issues.map((i) => ({ champ: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}

/** Documente le corps attendu dans OpenAPI à partir du schéma Zod. */
export function ApiZodBody(schema: z.ZodType) {
  return ApiBody({
    schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object,
  });
}

export function ApiZodQuery(schema: z.ZodObject) {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
    properties?: Record<string, object>;
    required?: string[];
  };
  return applyDecorators(
    ...Object.entries(json.properties ?? {}).map(([name, s]) =>
      ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: s }),
    ),
  );
}
