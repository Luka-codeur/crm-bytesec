import { Body, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Kysely, Transaction } from 'kysely';
import { AuthUser, CurrentUser } from '../auth/auth';
import { ClientsModule } from '../clients/clients.module';
import { ClientsService } from '../clients/clients.service';
import { clientScope } from '../common/access';
import { ApiException, ListResponse } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';

type Db = Kysely<Database> | Transaction<Database>;

// ---------- Formations (catalogue partagé) ----------

class FormationDto {
  @IsString() @MinLength(1) titre!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) dureeHeures!: number;
  @IsInt() @Min(0) prixCentimes!: number;
}

const toFormation = (r: { id: string; titre: string; description: string; duree_heures: number; prix_centimes: number }) => ({
  id: r.id,
  titre: r.titre,
  description: r.description,
  dureeHeures: r.duree_heures,
  prixCentimes: r.prix_centimes,
});

@Controller('formations')
class FormationsController {
  constructor(@InjectKysely() private readonly db: Kysely<Database>) {}

  @Get() async list() {
    const rows = await this.db.selectFrom('formation').selectAll().orderBy('titre').execute();
    return rows.map(toFormation);
  }

  @Post() async create(@Body() dto: FormationDto) {
    const row = await this.db
      .insertInto('formation')
      .values({ titre: dto.titre, description: dto.description ?? '', duree_heures: dto.dureeHeures, prix_centimes: dto.prixCentimes })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toFormation(row);
  }
}

// ---------- Projets ----------

class PackDto {
  @IsString() @MinLength(1) nom!: string;
  @IsOptional() @IsString() description?: string;
  @IsInt() @Min(0) prixCentimes!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FormationRef) formations!: FormationRef[];
}
class FormationRef {
  @IsUUID() id!: string;
}

class CreateProjetDto {
  @IsString() @MinLength(1) nom!: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() clientId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PackDto) packs!: PackDto[];
}
class UpdateProjetDto {
  @IsOptional() @IsString() @MinLength(1) nom?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackDto) packs?: PackDto[];
}
class ListProjetsQuery {
  @IsOptional() @IsUUID() clientId?: string;
}

@Injectable()
class ProjetsService {
  private readonly logger = new Logger(ProjetsService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly clients: ClientsService,
  ) {}

  private async hydrate(db: Db, rows: { id: string; nom: string; description: string; client_id: string; statut: 'brouillon' | 'envoye'; envoye_le: Date | null; cree_le: Date }[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const packs = await db.selectFrom('pack').selectAll().where('projet_id', 'in', ids).orderBy('position').execute();
    const links = packs.length
      ? await db
          .selectFrom('pack_formation as pf')
          .innerJoin('formation as f', 'f.id', 'pf.formation_id')
          .select(['pf.pack_id', 'f.id', 'f.titre', 'f.description', 'f.duree_heures', 'f.prix_centimes'])
          .where('pf.pack_id', 'in', packs.map((p) => p.id))
          .orderBy('pf.position')
          .execute()
      : [];
    return rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      description: r.description,
      clientId: r.client_id,
      statut: r.statut,
      envoyeLe: r.envoye_le ?? undefined,
      creeLe: r.cree_le,
      packs: packs
        .filter((p) => p.projet_id === r.id)
        .map((p) => ({
          id: p.id,
          nom: p.nom,
          description: p.description,
          prixCentimes: p.prix_centimes,
          formations: links.filter((l) => l.pack_id === p.id).map(toFormation),
        })),
    }));
  }

  private scoped(db: Db, user: AuthUser) {
    return db
      .selectFrom('projet as p')
      .innerJoin('client as c', 'c.id', 'p.client_id')
      .where((eb) => clientScope(eb, user))
      .select(['p.id', 'p.nom', 'p.description', 'p.client_id', 'p.statut', 'p.envoye_le', 'p.cree_le']);
  }

  async list(user: AuthUser, clientId?: string): Promise<ListResponse<unknown>> {
    let q = this.scoped(this.db, user);
    if (clientId) q = q.where('p.client_id', '=', clientId);
    const rows = await q.orderBy('p.cree_le', 'desc').execute();
    const data = await this.hydrate(this.db, rows);
    return { data, total: data.length, page: 1, pageSize: data.length || 1 };
  }

  async get(user: AuthUser, id: string, db: Db = this.db) {
    const row = await this.scoped(db, user).where('p.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Projet introuvable.');
    return (await this.hydrate(db, [row]))[0]!;
  }

  private async writePacks(trx: Transaction<Database>, projetId: string, packs: PackDto[]) {
    await trx.deleteFrom('pack').where('projet_id', '=', projetId).execute();
    for (const [i, p] of packs.entries()) {
      const pack = await trx
        .insertInto('pack')
        .values({ projet_id: projetId, nom: p.nom, description: p.description ?? '', prix_centimes: p.prixCentimes, position: i })
        .returning('id')
        .executeTakeFirstOrThrow();
      const ids = [...new Set(p.formations.map((f) => f.id))];
      if (ids.length) {
        await trx
          .insertInto('pack_formation')
          .values(ids.map((formation_id, position) => ({ pack_id: pack.id, formation_id, position })))
          .execute();
      }
    }
  }

  async create(user: AuthUser, dto: CreateProjetDto) {
    await this.clients.assertVisible(user, dto.clientId);
    const id = await this.db.transaction().execute(async (trx) => {
      const { id } = await trx
        .insertInto('projet')
        .values({ nom: dto.nom, description: dto.description ?? '', client_id: dto.clientId, cree_par: user.id, envoye_le: null })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.writePacks(trx, id, dto.packs);
      return id;
    });
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProjetDto) {
    await this.get(user, id);
    if (dto.clientId) await this.clients.assertVisible(user, dto.clientId);
    await this.db.transaction().execute(async (trx) => {
      const set = {
        ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.clientId !== undefined ? { client_id: dto.clientId } : {}),
      };
      if (Object.keys(set).length) await trx.updateTable('projet').set(set).where('id', '=', id).execute();
      if (dto.packs) await this.writePacks(trx, id, dto.packs);
    });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.get(user, id);
    await this.db.deleteFrom('projet').where('id', '=', id).execute();
  }

  /**
   * Marque le projet comme envoyé. MVP : l'envoi réel (e-mail/PDF) n'est pas
   * branché, il est simplement journalisé dans les logs applicatifs.
   */
  async envoyer(user: AuthUser, id: string) {
    const projet = await this.get(user, id);
    if (!projet.packs.length) throw new ApiException(409, 'Ajoutez au moins un pack avant d’envoyer le projet.', 'EMPTY_PROJECT');
    const client = await this.clients.get(user, projet.clientId);
    await this.db.updateTable('projet').set({ statut: 'envoye', envoye_le: new Date() }).where('id', '=', id).execute();
    this.logger.log(`Projet ${id} « ${projet.nom} » envoyé à ${client.email}`);
    return this.get(user, id);
  }
}

@Controller('projets')
class ProjetsController {
  constructor(private readonly projets: ProjetsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListProjetsQuery) {
    return this.projets.list(u, q.clientId);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projets.get(u, id);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProjetDto) {
    return this.projets.create(u, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjetDto) {
    return this.projets.update(u, id, dto);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.projets.remove(u, id);
  }
  @Post(':id/envoyer') envoyer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projets.envoyer(u, id);
  }
}

@Module({
  imports: [ClientsModule],
  providers: [ProjetsService],
  controllers: [ProjetsController, FormationsController],
})
export class ProjetsModule {}
