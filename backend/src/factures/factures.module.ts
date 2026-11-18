import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Kysely, Transaction, sql } from 'kysely';
import { AuthUser, CurrentUser } from '../auth/auth';
import { ClientsModule } from '../clients/clients.module';
import { ClientsService } from '../clients/clients.service';
import { clientScope } from '../common/access';
import { ApiException, ListResponse } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import { JournalService } from '../journal/journal.service';

type Db = Kysely<Database> | Transaction<Database>;
type Statut = 'brouillon' | 'envoyee' | 'acceptee' | 'refusee';
const STATUTS: Statut[] = ['brouillon', 'envoyee', 'acceptee', 'refusee'];

class LigneDto {
  @IsString() @MinLength(1) designation!: string;
  @IsNumber() @Min(0.01) quantite!: number;
  @IsInt() @Min(0) prixUnitaireCentimes!: number;
}
class CreateProformaDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() projetId?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Au moins une ligne est requise' }) @ValidateNested({ each: true }) @Type(() => LigneDto) lignes!: LigneDto[];
  @IsNumber() @Min(0) @Max(100) tvaPourcent!: number;
}
class UpdateProformaDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() projetId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LigneDto) lignes?: LigneDto[];
  @IsOptional() @IsNumber() @Min(0) @Max(100) tvaPourcent?: number;
}
class StatutDto {
  @IsIn(STATUTS) statut!: Statut;
}
class ListQuery {
  @IsOptional() @IsUUID() clientId?: string;
}

const totaux = (lignes: { quantite: number; prixUnitaireCentimes: number }[], tva: number) => {
  const ht = Math.round(lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireCentimes, 0));
  return { totalHtCentimes: ht, totalTtcCentimes: Math.round(ht * (1 + tva / 100)) };
};

const mapLignes = (rows: { designation: string; quantite: number; prix_unitaire_centimes: number }[]) =>
  rows.map((l) => ({ designation: l.designation, quantite: l.quantite, prixUnitaireCentimes: l.prix_unitaire_centimes }));

@Injectable()
class FacturesService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly clients: ClientsService,
    private readonly journal: JournalService,
  ) {}

  // ---------- Pro forma ----------

  private proformaScoped(db: Db, user: AuthUser) {
    return db
      .selectFrom('proforma as p')
      .innerJoin('client as c', 'c.id', 'p.client_id')
      .leftJoin('facture_commerciale as f', 'f.proforma_id', 'p.id')
      .where((eb) => clientScope(eb, user))
      .select([
        'p.id', 'p.numero', 'p.client_id', 'p.projet_id', 'p.tva_pourcent', 'p.statut', 'p.cree_le', 'p.modifie_le',
        'f.id as facture_id',
      ]);
  }

  private async hydrateProformas(db: Db, rows: Awaited<ReturnType<ReturnType<FacturesService['proformaScoped']>['execute']>>) {
    if (!rows.length) return [];
    const lignes = await db
      .selectFrom('ligne_proforma')
      .selectAll()
      .where('proforma_id', 'in', rows.map((r) => r.id))
      .orderBy('position')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      clientId: r.client_id,
      projetId: r.projet_id ?? undefined,
      lignes: mapLignes(lignes.filter((l) => l.proforma_id === r.id)),
      tvaPourcent: r.tva_pourcent,
      statut: r.statut,
      factureCommercialeId: r.facture_id ?? undefined,
      creeLe: r.cree_le,
      modifieLe: r.modifie_le,
    }));
  }

  async listProformas(user: AuthUser, clientId?: string): Promise<ListResponse<unknown>> {
    let q = this.proformaScoped(this.db, user);
    if (clientId) q = q.where('p.client_id', '=', clientId);
    const data = await this.hydrateProformas(this.db, await q.orderBy('p.cree_le', 'desc').execute());
    return { data, total: data.length, page: 1, pageSize: data.length || 1 };
  }

  async getProforma(user: AuthUser, id: string, db: Db = this.db) {
    const row = await this.proformaScoped(db, user).where('p.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Pro forma introuvable.');
    return (await this.hydrateProformas(db, [row]))[0]!;
  }

  private async checkProjet(user: AuthUser, clientId: string, projetId?: string) {
    if (!projetId) return;
    const p = await this.db.selectFrom('projet').select('id').where('id', '=', projetId).where('client_id', '=', clientId).executeTakeFirst();
    if (!p) throw new ApiException(422, 'Ce projet n’appartient pas à ce client.', 'VALIDATION', { projetId: 'Projet invalide' });
  }

  private async writeLignes(trx: Transaction<Database>, proformaId: string, lignes: LigneDto[]) {
    await trx.deleteFrom('ligne_proforma').where('proforma_id', '=', proformaId).execute();
    await trx
      .insertInto('ligne_proforma')
      .values(
        lignes.map((l, position) => ({
          proforma_id: proformaId,
          position,
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire_centimes: l.prixUnitaireCentimes,
        })),
      )
      .execute();
  }

  async createProforma(user: AuthUser, dto: CreateProformaDto) {
    await this.clients.assertVisible(user, dto.clientId);
    await this.checkProjet(user, dto.clientId, dto.projetId);
    const id = await this.db.transaction().execute(async (trx) => {
      const { id } = await trx
        .insertInto('proforma')
        .values({
          numero: sql<string>`'PF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('proforma_numero_seq')::text, 4, '0')`,
          client_id: dto.clientId,
          projet_id: dto.projetId ?? null,
          tva_pourcent: dto.tvaPourcent,
          cree_par: user.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.writeLignes(trx, id, dto.lignes);
      return id;
    });
    return this.getProforma(user, id);
  }

  private async assertModifiable(user: AuthUser, id: string, db: Db = this.db) {
    const p = await this.getProforma(user, id, db);
    if (p.factureCommercialeId) {
      throw new ApiException(409, 'Cette pro forma est verrouillée : une facture commerciale a déjà été générée.', 'LOCKED');
    }
    return p;
  }

  async updateProforma(user: AuthUser, id: string, dto: UpdateProformaDto) {
    await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('proforma').select('id').where('id', '=', id).forUpdate().execute();
      const avant = await this.assertModifiable(user, id, trx);
      const clientId = dto.clientId ?? avant.clientId;
      if (dto.clientId) await this.clients.assertVisible(user, dto.clientId, trx);
      await this.checkProjet(user, clientId, dto.projetId ?? undefined);

      const set = {
        ...(dto.clientId !== undefined ? { client_id: dto.clientId } : {}),
        ...(dto.projetId !== undefined ? { projet_id: dto.projetId } : {}),
        ...(dto.tvaPourcent !== undefined ? { tva_pourcent: dto.tvaPourcent } : {}),
      };
      if (Object.keys(set).length) await trx.updateTable('proforma').set(set).where('id', '=', id).execute();
      if (dto.lignes) await this.writeLignes(trx, id, dto.lignes);

      const apres = await this.getProforma(user, id, trx);
      await this.journal.log(trx, {
        acteurId: user.id,
        action: 'PROFORMA_MODIFIEE',
        cibleType: 'proforma',
        cibleId: id,
        cibleLibelle: avant.numero,
        clientId: apres.clientId,
        avant: { lignes: avant.lignes, tvaPourcent: avant.tvaPourcent, ...totaux(avant.lignes, avant.tvaPourcent) },
        apres: { lignes: apres.lignes, tvaPourcent: apres.tvaPourcent, ...totaux(apres.lignes, apres.tvaPourcent) },
      });
    });
    return this.getProforma(user, id);
  }

  async setProformaStatut(user: AuthUser, id: string, statut: Statut) {
    await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('proforma').select('id').where('id', '=', id).forUpdate().execute();
      const avant = await this.assertModifiable(user, id, trx);
      if (avant.statut === statut) return;
      await trx.updateTable('proforma').set({ statut }).where('id', '=', id).execute();
      await this.journal.log(trx, {
        acteurId: user.id,
        action: 'PROFORMA_MODIFIEE',
        cibleType: 'proforma',
        cibleId: id,
        cibleLibelle: avant.numero,
        clientId: avant.clientId,
        avant: { statut: avant.statut },
        apres: { statut },
      });
    });
    return this.getProforma(user, id);
  }

  async removeProforma(user: AuthUser, id: string) {
    await this.assertModifiable(user, id);
    await this.db.deleteFrom('proforma').where('id', '=', id).execute();
  }

  // ---------- Factures commerciales ----------

  private async hydrateFactures(db: Db, rows: { id: string; numero: string; proforma_id: string; client_id: string; tva_pourcent: number; total_ht_centimes: number; total_ttc_centimes: number; emise_le: Date; u_id: string; u_nom: string; u_prenom: string }[]) {
    if (!rows.length) return [];
    const lignes = await db
      .selectFrom('ligne_facture_commerciale')
      .selectAll()
      .where('facture_id', 'in', rows.map((r) => r.id))
      .orderBy('position')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      proformaId: r.proforma_id,
      clientId: r.client_id,
      lignes: mapLignes(lignes.filter((l) => l.facture_id === r.id)),
      tvaPourcent: r.tva_pourcent,
      totalHtCentimes: r.total_ht_centimes,
      totalTtcCentimes: r.total_ttc_centimes,
      emiseLe: r.emise_le,
      emisePar: { id: r.u_id, nom: `${r.u_prenom} ${r.u_nom}`.trim() },
    }));
  }

  private factureScoped(user: AuthUser) {
    return this.db
      .selectFrom('facture_commerciale as f')
      .innerJoin('client as c', 'c.id', 'f.client_id')
      .innerJoin('utilisateur as u', 'u.id', 'f.emise_par')
      .where((eb) => clientScope(eb, user))
      .select([
        'f.id', 'f.numero', 'f.proforma_id', 'f.client_id', 'f.tva_pourcent', 'f.total_ht_centimes',
        'f.total_ttc_centimes', 'f.emise_le', 'u.id as u_id', 'u.nom as u_nom', 'u.prenom as u_prenom',
      ]);
  }

  async listFactures(user: AuthUser, clientId?: string): Promise<ListResponse<unknown>> {
    let q = this.factureScoped(user);
    if (clientId) q = q.where('f.client_id', '=', clientId);
    const data = await this.hydrateFactures(this.db, await q.orderBy('f.emise_le', 'desc').execute());
    return { data, total: data.length, page: 1, pageSize: data.length || 1 };
  }

  async getFacture(user: AuthUser, id: string) {
    const row = await this.factureScoped(user).where('f.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Facture introuvable.');
    return (await this.hydrateFactures(this.db, [row]))[0]!;
  }

  /** Génère la facture commerciale (snapshot immuable) depuis une pro forma acceptée, en une transaction. */
  async genererFacture(user: AuthUser, proformaId: string) {
    const factureId = await this.db.transaction().execute(async (trx) => {
      // Verrou : deux générations simultanées sont sérialisées, la seconde voit la facture.
      await trx.selectFrom('proforma').select('id').where('id', '=', proformaId).forUpdate().execute();
      const p = await this.getProforma(user, proformaId, trx);
      if (p.factureCommercialeId) throw new ApiException(409, 'Une facture commerciale existe déjà pour cette pro forma.', 'ALREADY_INVOICED');
      if (p.statut !== 'acceptee') throw new ApiException(409, 'Seule une pro forma acceptée peut être facturée.', 'NOT_ACCEPTED');
      const t = totaux(p.lignes, p.tvaPourcent);

      const facture = await trx
        .insertInto('facture_commerciale')
        .values({
          numero: sql<string>`'FC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('facture_numero_seq')::text, 4, '0')`,
          proforma_id: p.id,
          client_id: p.clientId,
          tva_pourcent: p.tvaPourcent,
          total_ht_centimes: t.totalHtCentimes,
          total_ttc_centimes: t.totalTtcCentimes,
          emise_par: user.id,
        })
        .returning(['id', 'numero'])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('ligne_facture_commerciale')
        .values(
          p.lignes.map((l, position) => ({
            facture_id: facture.id,
            position,
            designation: l.designation,
            quantite: l.quantite,
            prix_unitaire_centimes: l.prixUnitaireCentimes,
          })),
        )
        .execute();
      await this.journal.log(trx, {
        acteurId: user.id,
        action: 'FACTURE_GENEREE',
        cibleType: 'facture_commerciale',
        cibleId: facture.id,
        cibleLibelle: facture.numero,
        clientId: p.clientId,
        apres: { proforma: p.numero, ...t },
      });
      return facture.id;
    });
    return this.getFacture(user, factureId);
  }
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

@Module({ imports: [ClientsModule], providers: [FacturesService], controllers: [ProformasController, FacturesCommercialesController] })
export class FacturesModule {}
