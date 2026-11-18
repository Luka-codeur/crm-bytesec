import { ExpressionBuilder } from 'kysely';
import type { AuthUser } from '../auth/auth';

/**
 * Périmètre de visibilité des clients : un agent ne voit que ceux qu'il a
 * ajoutés, un chef d'équipe voit ceux de toute son équipe. `col` est la
 * colonne `ajoute_par` (qualifiée par l'alias de la requête).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientScope(eb: ExpressionBuilder<any, any>, user: AuthUser, col = 'c.ajoute_par') {
  if (user.role === 'agent') return eb(col, '=', user.id);
  return eb(col, 'in', eb.selectFrom('utilisateur').select('id').where('equipe_id', '=', user.equipeId));
}
