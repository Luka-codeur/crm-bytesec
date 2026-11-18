import { Transaction, sql } from 'kysely';
import type { Database } from '../database/schema';

export interface DonneesClient {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse?: string | undefined;
}

/**
 * Retrouve (par e-mail, dans l'équipe du propriétaire) ou crée le client issu d'un lien public.
 * Le client créé est rattaché au propriétaire du document partagé.
 */
export async function trouverOuCreerClient(
  trx: Transaction<Database>,
  proprietaireId: string,
  d: DonneesClient,
  opts: { projetId?: string | null; statut?: 'prospect' | 'qualifie' | 'confirme' } = {},
): Promise<{ id: string; cree: boolean }> {
  const email = d.email.trim().toLowerCase();
  const equipe = trx
    .selectFrom('utilisateur')
    .select('id')
    .where('equipe_id', '=', trx.selectFrom('utilisateur').select('equipe_id').where('id', '=', proprietaireId));

  const existant = await trx
    .selectFrom('client')
    .select(['id', 'projet_id'])
    .where(sql<boolean>`lower(email) = ${email}`)
    .where('ajoute_par', 'in', equipe)
    .executeTakeFirst();

  if (existant) {
    if (opts.projetId && !existant.projet_id) {
      await trx.updateTable('client').set({ projet_id: opts.projetId }).where('id', '=', existant.id).execute();
    }
    return { id: existant.id, cree: false };
  }

  const c = await trx
    .insertInto('client')
    .values({
      nom: d.nom.trim(),
      prenom: d.prenom.trim(),
      adresse: d.adresse?.trim() ?? '',
      email,
      telephone: d.telephone.trim(),
      statut: opts.statut ?? 'prospect',
      ajoute_par: proprietaireId,
      projet_id: opts.projetId ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return { id: c.id, cree: true };
}
