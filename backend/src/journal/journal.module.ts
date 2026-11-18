import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Kysely } from 'kysely';
import { AuthUser, CurrentUser } from '../auth/auth';
import { clientScope } from '../common/access';
import { JournalService } from './journal.service';
import { ApiException, ListResponse, pageParams } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database, JournalTable } from '../database/schema';

class JournalQuery {
  @IsOptional() @IsIn(['PROFORMA_MODIFIEE', 'FACTURE_GENEREE', 'STATUT_CLIENT_MODIFIE', 'CLIENT_INSCRIT', 'PROFORMA_VALIDEE_CLIENT', 'PROFORMA_REFUSEE_CLIENT']) action?: JournalTable['action'];
  @IsOptional() @IsString() acteurId?: string;
  @IsOptional() @IsString() du?: string;
  @IsOptional() @IsString() au?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
void Transform;

@Controller('journal')
class JournalController {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: JournalQuery): Promise<ListResponse<unknown>> {
    // Le journal global est réservé au chef ; un agent n'accède qu'à l'historique d'un de ses clients.
    if (user.role === 'agent') {
      if (!q.clientId) throw new ApiException(403, 'Accès réservé au chef d’équipe.');
      const visible = await this.db
        .selectFrom('client as c')
        .select('c.id')
        .where('c.id', '=', q.clientId)
        .where((eb) => clientScope(eb, user))
        .executeTakeFirst();
      if (!visible) throw new ApiException(404, 'Client introuvable.');
    }
    const { page, pageSize, offset } = pageParams(q.page, q.pageSize);

    let base = this.db
      .selectFrom('journal as j')
      .innerJoin('utilisateur as u', 'u.id', 'j.acteur_id')
      .where('u.equipe_id', '=', user.equipeId);
    if (q.action) base = base.where('j.action', '=', q.action);
    if (q.acteurId) base = base.where('j.acteur_id', '=', q.acteurId);
    if (q.clientId) base = base.where('j.client_id', '=', q.clientId);
    if (q.du) base = base.where('j.date', '>=', new Date(q.du));
    if (q.au) base = base.where('j.date', '<=', new Date(q.au));

    const { n } = await base.select((eb) => eb.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
    const rows = await base
      .select([
        'j.id', 'j.action', 'j.cible_type', 'j.cible_id', 'j.cible_libelle', 'j.client_id', 'j.avant', 'j.apres', 'j.date', 'j.acteur_externe',
        'u.id as acteur_id', 'u.nom as acteur_nom', 'u.prenom as acteur_prenom',
      ])
      .orderBy('j.date', 'desc')
      .limit(pageSize)
      .offset(offset)
      .execute();

    return {
      data: rows.map((r) => ({
        id: r.id,
        acteur: { id: r.acteur_id, nom: r.acteur_externe ?? `${r.acteur_prenom} ${r.acteur_nom}`.trim() },
        action: r.action,
        cible: { type: r.cible_type, id: r.cible_id, libelle: r.cible_libelle },
        details: { ...(r.avant ? { avant: r.avant } : {}), ...(r.apres ? { apres: r.apres } : {}) },
        clientId: r.client_id ?? undefined,
        date: r.date,
      })),
      total: Number(n),
      page,
      pageSize,
    };
  }
}

@Global()
@Module({ providers: [JournalService], controllers: [JournalController], exports: [JournalService] })
export class JournalModule {}

export { JournalService };
