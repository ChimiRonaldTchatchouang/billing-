import { z } from 'zod';

const texte = (max: number) => z.string().trim().max(max);

export const creationFactureSchema = z.object({
  client: z.object({
    raisonSociale: texte(200).min(1, { message: 'La raison sociale du client est obligatoire.' }),
    niu: texte(30)
      .regex(/^[A-Z0-9]{8,20}$/i, { message: 'NIU invalide (lettres et chiffres).' })
      .optional(),
    adresse: texte(300).optional(),
    email: z.email({ message: 'Adresse e-mail invalide.' }).optional(),
  }),
});

export const envoiFactureSchema = z.object({
  email: z.email({ message: 'Adresse e-mail invalide.' }).optional(),
});

export const rapprochementSchema = z.object({
  statut: z.enum(['RAPPROCHE', 'ECART']),
  note: texte(300).optional(),
});

export const rapprochementGroupeSchema = rapprochementSchema.extend({
  ids: z.array(z.uuid()).min(1).max(200),
});

export const organisationSchema = z.object({
  nom: texte(200).min(1).optional(),
  niu: texte(30).nullish(),
  rccm: texte(60).nullish(),
  adresse: texte(300).nullish(),
  telephone: texte(30).nullish(),
});

export const periodeSchema = z.object({
  storeId: z.uuid().optional(),
  du: z.iso.date({ message: 'Date au format AAAA-MM-JJ.' }),
  au: z.iso.date({ message: 'Date au format AAAA-MM-JJ.' }),
});
