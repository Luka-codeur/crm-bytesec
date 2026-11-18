import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Kysely } from 'kysely';
import { AuthUser, CurrentUser } from '../auth/auth';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import { ProjetsService } from './projets.service';

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

class FormationRef {
  @IsUUID() id!: string;
}

class PackDto {
  @IsString() @MinLength(1) nom!: string;
  @IsOptional() @IsString() description?: string;
  /** Prix final ; absent = somme des prix des formations. */
  @IsOptional() @IsInt() @Min(0) prixCentimes?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FormationRef) formations!: FormationRef[];
}

class CreateProjetDto {
  @IsString() @MinLength(1) nom!: string;
  @IsOptional() @IsString() description?: string;
  /** Un projet peut n'avoir aucun pack. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackDto) packs?: PackDto[];
}

class UpdateProjetDto {
  @IsOptional() @IsString() @MinLength(1) nom?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackDto) packs?: PackDto[];
}

class ListProjetsQuery {
  @IsOptional() @IsUUID() clientId?: string;
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
  @Get(':id/inscrits') inscrits(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projets.inscrits(u, id);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProjetDto) {
    return this.projets.create(u, { nom: dto.nom, description: dto.description, packs: dto.packs ?? [] });
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjetDto) {
    return this.projets.update(u, id, dto);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.projets.remove(u, id);
  }
  /** Marque le projet comme partagé : le lien de consultation a été transmis. */
  @Post(':id/partager') partager(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projets.partager(u, id);
  }
  /** Ancien nom de l'action, conservé pour compatibilité. */
  @Post(':id/envoyer') envoyer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projets.partager(u, id);
  }
}

@Module({
  providers: [ProjetsService],
  controllers: [ProjetsController, FormationsController],
  exports: [ProjetsService],
})
export class ProjetsModule {}
