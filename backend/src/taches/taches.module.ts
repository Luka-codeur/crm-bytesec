import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Kysely } from 'kysely';
import { AuthUser, CurrentUser, Roles } from '../auth/auth';
import { ApiException, ListResponse } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';

type Statut = 'a_faire' | 'en_cours' | 'terminee';
const STATUTS: Statut[] = ['a_faire', 'en_cours', 'terminee'];

class CreateTacheDto {
  @IsString() @MinLength(1) titre!: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() assigneAId!: string;
  @IsOptional() @IsDateString() echeance?: string;
}
class UpdateTacheDto {
  @IsOptional() @IsString() @MinLength(1) titre?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() assigneAId?: string;
  @IsOptional() @IsDateString() echeance?: string;
}
class StatutDto {
  @IsIn(STATUTS) statut!: Statut;
}
class ListQuery {
  @IsOptional() @IsUUID() assigneAId?: string;
  @IsOptional() @IsIn(STATUTS) statut?: Statut;
}

type Row = {
  id: string; titre: string; description: string; assigne_a: string; statut: Statut; echeance: string | null; cree_le: Date;
  p_id: string; p_nom: string; p_prenom: string;
};
const map = (r: Row) => ({
  id: r.id,
  titre: r.titre,
  description: r.description,
  assigneAId: r.assigne_a,
  assignePar: { id: r.p_id, nom: `${r.p_prenom} ${r.p_nom}`.trim() },
  statut: r.statut,
  echeance: r.echeance ?? undefined,
  creeLe: r.cree_le,
});

@Injectable()
class TachesService {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  /** Tâches du périmètre : celles de l'agent, ou de toute l'équipe pour le chef. */
  private scoped(user: AuthUser) {
    let q = this.db
      .selectFrom('tache as t')
      .innerJoin('utilisateur as a', 'a.id', 't.assigne_a')
      .innerJoin('utilisateur as p', 'p.id', 't.assigne_par')
      .where('a.equipe_id', '=', user.equipeId)
      .select([
        't.id', 't.titre', 't.description', 't.assigne_a', 't.statut', 't.echeance', 't.cree_le',
        'p.id as p_id', 'p.nom as p_nom', 'p.prenom as p_prenom',
      ]);
    if (user.role === 'agent') q = q.where('t.assigne_a', '=', user.id);
    return q;
  }

  async list(user: AuthUser, f: ListQuery): Promise<ListResponse<unknown>> {
    let q = this.scoped(user);
    if (f.assigneAId) q = q.where('t.assigne_a', '=', f.assigneAId);
    if (f.statut) q = q.where('t.statut', '=', f.statut);
    const rows = await q.orderBy('t.cree_le', 'desc').execute();
    return { data: rows.map(map), total: rows.length, page: 1, pageSize: rows.length || 1 };
  }

  private async get(user: AuthUser, id: string) {
    const r = await this.scoped(user).where('t.id', '=', id).executeTakeFirst();
    if (!r) throw new ApiException(404, 'Tâche introuvable.');
    return map(r);
  }

  private async assertAgentEquipe(user: AuthUser, userId: string) {
    const u = await this.db.selectFrom('utilisateur').select('id').where('id', '=', userId).where('equipe_id', '=', user.equipeId).executeTakeFirst();
    if (!u) throw new ApiException(422, 'Utilisateur inconnu dans votre équipe.', 'VALIDATION', { assigneAId: 'Utilisateur invalide' });
  }

  async create(user: AuthUser, dto: CreateTacheDto) {
    await this.assertAgentEquipe(user, dto.assigneAId);
    const { id } = await this.db
      .insertInto('tache')
      .values({ titre: dto.titre, description: dto.description ?? '', assigne_a: dto.assigneAId, assigne_par: user.id, echeance: dto.echeance ?? null })
      .returning('id')
      .executeTakeFirstOrThrow();
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateTacheDto) {
    await this.get(user, id);
    if (dto.assigneAId) await this.assertAgentEquipe(user, dto.assigneAId);
    const set = {
      ...(dto.titre !== undefined ? { titre: dto.titre } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.assigneAId !== undefined ? { assigne_a: dto.assigneAId } : {}),
      ...(dto.echeance !== undefined ? { echeance: dto.echeance } : {}),
    };
    if (Object.keys(set).length) await this.db.updateTable('tache').set(set).where('id', '=', id).execute();
    return this.get(user, id);
  }

  /** L'agent ne met à jour que ses tâches (garanti par `scoped`) ; le chef, toutes celles de l'équipe. */
  async setStatut(user: AuthUser, id: string, statut: Statut) {
    await this.get(user, id);
    await this.db.updateTable('tache').set({ statut }).where('id', '=', id).execute();
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.db.deleteFrom('tache').where('id', '=', id).execute();
  }

  async avancement(user: AuthUser) {
    const agents = await this.db
      .selectFrom('utilisateur')
      .select(['id', 'nom', 'prenom'])
      .where('equipe_id', '=', user.equipeId)
      .where('role', '=', 'agent')
      .orderBy('nom')
      .execute();
    const taches = await this.scoped(user).execute();
    return agents.map((a) => {
      const mine = taches.filter((t) => t.assigne_a === a.id).map(map);
      const count = (s: Statut) => mine.filter((t) => t.statut === s).length;
      return {
        agent: { id: a.id, nom: `${a.prenom} ${a.nom}`.trim() },
        total: mine.length,
        aFaire: count('a_faire'),
        enCours: count('en_cours'),
        terminees: count('terminee'),
        tachesEnCours: mine.filter((t) => t.statut === 'en_cours'),
      };
    });
  }
}

@Controller('taches')
class TachesController {
  constructor(private readonly s: TachesService) {}

  // Déclaré avant ':id' pour ne pas être capturé comme identifiant.
  @Get('avancement-equipe') @Roles('chef_equipe') avancement(@CurrentUser() u: AuthUser) {
    return this.s.avancement(u);
  }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.s.list(u, q);
  }
  @Post() @Roles('chef_equipe') create(@CurrentUser() u: AuthUser, @Body() dto: CreateTacheDto) {
    return this.s.create(u, dto);
  }
  @Patch(':id') @Roles('chef_equipe') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTacheDto) {
    return this.s.update(u, id, dto);
  }
  @Patch(':id/statut') statut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutDto) {
    return this.s.setStatut(u, id, dto.statut);
  }
  @Delete(':id') @Roles('chef_equipe') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.s.remove(u, id);
  }
}

@Module({ providers: [TachesService], controllers: [TachesController] })
export class TachesModule {}
