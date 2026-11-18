import { Controller, Get, Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import { AuthUser, CurrentUser } from '../auth/auth';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';

@Controller()
class UsersController {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return { id: u.id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role, equipeId: u.equipeId };
  }

  /** Membres de l'équipe (agents + chef), pour les filtres et l'assignation. */
  @Get('utilisateurs/equipe')
  async equipe(@CurrentUser() u: AuthUser) {
    const rows = await this.db
      .selectFrom('utilisateur')
      .select(['id', 'nom', 'prenom', 'email', 'role', 'equipe_id'])
      .where('equipe_id', '=', u.equipeId)
      .orderBy('nom')
      .execute();
    return rows.map((r) => ({ id: r.id, nom: r.nom, prenom: r.prenom, email: r.email, role: r.role, equipeId: r.equipe_id }));
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
