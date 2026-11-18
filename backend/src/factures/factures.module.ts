import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser } from '../auth/auth';
import { ClientsModule } from '../clients/clients.module';
import { FacturesService, type StatutProforma } from './factures.service';

const STATUTS: StatutProforma[] = ['brouillon', 'envoyee', 'acceptee', 'refusee'];

class LigneDto {
  @IsString() @MinLength(1) designation!: string;
  @IsNumber() @Min(0.01) quantite!: number;
  @IsInt() @Min(0) prixUnitaireCentimes!: number;
}

class CreateProformaDto {
  /** Une pro forma peut être propre à un client, ou en être dépourvue (le client se déclare en validant). */
  @IsOptional() @IsUUID() clientId?: string;
  /** Une pro forma peut couvrir un ou plusieurs projets. */
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) projetIds?: string[];
  @IsArray() @ArrayMinSize(1, { message: 'Au moins une ligne est requise' }) @ValidateNested({ each: true }) @Type(() => LigneDto) lignes!: LigneDto[];
  @IsNumber() @Min(0) @Max(100) tvaPourcent!: number;
}

class UpdateProformaDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) projetIds?: string[];
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneDto) lignes?: LigneDto[];
  @IsOptional() @IsNumber() @Min(0) @Max(100) tvaPourcent?: number;
}

class StatutDto {
  @IsIn(STATUTS) statut!: StatutProforma;
}

class ListQuery {
  @IsOptional() @IsUUID() clientId?: string;
}

@Controller('proformas')
class ProformasController {
  constructor(private readonly s: FacturesService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.s.listProformas(u, q.clientId);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.getProforma(u, id);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateProformaDto) {
    return this.s.createProforma(u, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProformaDto) {
    return this.s.updateProforma(u, id, dto);
  }
  @Patch(':id/statut') statut(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatutDto) {
    return this.s.setProformaStatut(u, id, dto.statut);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.s.removeProforma(u, id);
  }
  @Post(':id/generer-facture') generer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.genererFacture(u, id);
  }
}

/** Lecture seule : aucune route d'écriture n'existe pour les factures commerciales. */
@Controller('factures-commerciales')
class FacturesCommercialesController {
  constructor(private readonly s: FacturesService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.s.listFactures(u, q.clientId);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.getFacture(u, id);
  }
}

@Module({
  imports: [ClientsModule],
  providers: [FacturesService],
  controllers: [ProformasController, FacturesCommercialesController],
  exports: [FacturesService],
})
export class FacturesModule {}
