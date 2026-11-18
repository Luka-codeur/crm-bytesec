import { Injectable } from '@nestjs/common';
import { Kysely, Transaction, sql } from 'kysely';
import type { AuthUser } from '../auth/auth';
import { clientScope } from '../common/access';
import { ClientsService } from '../clients/clients.service';
import { empreinteFacture, empreinteProforma, totaux } from '../common/documents';
import { ApiException, ListResponse } from '../common/http';
import { trouverOuCreerClient } from '../common/public-client';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import { JournalService } from '../journal/journal.service';

type Db = Kysely<Database> | Transaction<Database>;
export type StatutProforma = 'brouillon' | 'envoyee' | 'acceptee' | 'refusee';

export interface LigneInput {
  designation: string;
  quantite: number;
  prixUnitaireCentimes: number;
}
export interface ProformaInput {
  clientId?: string | undefined;
  projetIds?: string[] | undefined;
  lignes: LigneInput[];
  tvaPourcent: number;
}
export interface DecisionInput {
  /** Nom complet du signataire (ou nom de famille si le client n'est pas encore connu). */
  nom: string;
  prenom?: string | undefined;
  email?: string | undefined;
  telephone?: string | undefined;
  adresse?: string | undefined;
  /** Empreinte du document telle que vue par le client : refus si le contenu a changé depuis. */
  hash: string;
  motif?: string | undefined;
}

const mapLignes = (rows: { designation: string; quantite: number; prix_unitaire_centimes: number }[]) =>
  rows.map((l) => ({ designation: l.designation, quantite: l.quantite, prixUnitaireCentimes: l.prix_unitaire_centimes }));

const nomComplet = (prenom: string, nom: string) => `${prenom} ${nom}`.trim();

@Injectable()
export class FacturesService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly clients: ClientsService,
    private readonly journal: JournalService,
  ) {}

  // =====================================================================
  // Pro forma
  // =====================================================================

  private proformaBase(db: Db) {
    return db
      .selectFrom('proforma as p')
      .leftJoin('facture_commerciale as f', 'f.proforma_id', 'p.id')
      .leftJoin('utilisateur as s', 's.id', 'p.signe_par')
      .select([
        'p.id', 'p.numero', 'p.client_id', 'p.tva_pourcent', 'p.statut', 'p.cree_par', 'p.cree_le', 'p.modifie_le',
        'p.token_consultation', 'p.signe_le', 'p.decision_client_nom', 'p.decision_client_le', 'p.decision_hash',
        'f.id as facture_id', 'f.token_consultation as facture_token',
        's.id as s_id', 's.nom as s_nom', 's.prenom as s_prenom',
      ]);
  }

  /** Visible si le client l'est, ou (sans client) si la pro forma a été créée dans le périmètre de l'utilisateur. */
  private proformaScoped(db: Db, user: AuthUser) {
    return this.proformaBase(db)
      .leftJoin('client as c', 'c.id', 'p.client_id')
      .where((eb) =>
        eb.or([clientScope(eb, user), eb.and([eb('p.client_id', 'is', null), clientScope(eb, user, 'p.cree_par')])]),
      );
  }

  private async hydrateProformas(db: Db, rows: Awaited<ReturnType<ReturnType<FacturesService['proformaBase']>['execute']>>) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const lignes = await db.selectFrom('ligne_proforma').selectAll().where('proforma_id', 'in', ids).orderBy('position').execute();
    const liens = await db.selectFrom('proforma_projet').select(['proforma_id', 'projet_id']).where('proforma_id', 'in', ids).execute();
    return rows.map((r) => {
      const l = mapLignes(lignes.filter((x) => x.proforma_id === r.id));
      const projetIds = liens.filter((x) => x.proforma_id === r.id).map((x) => x.projet_id);
      const tva = r.tva_pourcent;
      return {
        id: r.id,
        numero: r.numero,
        clientId: r.client_id ?? undefined,
        projetIds,
        lignes: l,
        tvaPourcent: tva,
        statut: r.statut,
        factureCommercialeId: r.facture_id ?? undefined,
        factureToken: r.facture_token ?? undefined,
        tokenConsultation: r.token_consultation,
        signature: r.signe_le
          ? {
              par: { id: r.s_id ?? '', nom: nomComplet(r.s_prenom ?? '', r.s_nom ?? '') },
              le: r.signe_le,
              hash: empreinteProforma({ numero: r.numero, projetIds, lignes: l, tvaPourcent: tva }),
            }
          : undefined,
        decisionClient: r.decision_client_le ? { nom: r.decision_client_nom ?? '', le: r.decision_client_le } : undefined,
        creePar: r.cree_par,
        creeLe: r.cree_le,
        modifieLe: r.modifie_le,
      };
    });
  }

  async listProformas(user: AuthUser, clientId?: string): Promise<ListResponse<unknown>> {
    let q = this.proformaScoped(this.db, user);
    if (clientId) q = q.where('p.client_id', '=', clientId);
    const data = await this.hydrateProformas(this.db, await q.orderBy('p.cree_le', 'desc').execute());
    return { data: data.map(({ creePar: _c, ...p }) => p), total: data.length, page: 1, pageSize: data.length || 1 };
  }

  private async chargerProforma(user: AuthUser, id: string, db: Db = this.db) {
    const row = await this.proformaScoped(db, user).where('p.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Pro forma introuvable.');
    return (await this.hydrateProformas(db, [row]))[0]!;
  }

  async getProforma(user: AuthUser, id: string, db: Db = this.db) {
    const { creePar: _c, ...p } = await this.chargerProforma(user, id, db);
    return p;
  }

  /** Les projets d'une pro forma doivent être dans le périmètre de l'utilisateur. */
  private async verifierProjets(db: Db, user: AuthUser, projetIds: string[]) {
    const ids = [...new Set(projetIds)];
    if (!ids.length) return ids;
    const ok = await db
      .selectFrom('projet as p')
      .select('p.id')
      .where('p.id', 'in', ids)
      .where((eb) => clientScope(eb, user, 'p.cree_par'))
      .execute();
    if (ok.length !== ids.length) throw new ApiException(422, 'Un des projets est introuvable.', 'VALIDATION', { projetIds: 'Projet invalide' });
    return ids;
  }

  private async ecrireLignes(trx: Transaction<Database>, proformaId: string, lignes: LigneInput[]) {
    await trx.deleteFrom('ligne_proforma').where('proforma_id', '=', proformaId).execute();
    await trx
      .insertInto('ligne_proforma')
      .values(lignes.map((l, position) => ({ proforma_id: proformaId, position, designation: l.designation, quantite: l.quantite, prix_unitaire_centimes: l.prixUnitaireCentimes })))
      .execute();
  }

  private async ecrireProjets(trx: Transaction<Database>, proformaId: string, projetIds: string[]) {
    await trx.deleteFrom('proforma_projet').where('proforma_id', '=', proformaId).execute();
    if (projetIds.length) {
      await trx.insertInto('proforma_projet').values(projetIds.map((projet_id) => ({ proforma_id: proformaId, projet_id }))).execute();
    }
  }

  async createProforma(user: AuthUser, dto: ProformaInput) {
    if (dto.clientId) await this.clients.assertVisible(user, dto.clientId);
    const id = await this.db.transaction().execute(async (trx) => {
      const projetIds = await this.verifierProjets(trx, user, dto.projetIds ?? []);
      const { id } = await trx
        .insertInto('proforma')
        .values({
          numero: sql<string>`'PF-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('proforma_numero_seq')::text, 4, '0')`,
          client_id: dto.clientId ?? null,
          tva_pourcent: dto.tvaPourcent,
          cree_par: user.id,
          signe_par: null,
          signe_le: null,
          decision_client_nom: null,
          decision_client_le: null,
          decision_hash: null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.ecrireLignes(trx, id, dto.lignes);
      await this.ecrireProjets(trx, id, projetIds);
      return id;
    });
    return this.getProforma(user, id);
  }

  private async assertModifiable(user: AuthUser, id: string, db: Db = this.db) {
    const p = await this.chargerProforma(user, id, db);
    if (p.factureCommercialeId) {
      throw new ApiException(409, 'Cette pro forma est verrouillée : une facture commerciale a déjà été générée.', 'LOCKED');
    }
    return p;
  }

  async updateProforma(user: AuthUser, id: string, dto: Partial<ProformaInput>) {
    await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('proforma').select('id').where('id', '=', id).forUpdate().execute();
      const avant = await this.assertModifiable(user, id, trx);
      if (dto.clientId) await this.clients.assertVisible(user, dto.clientId, trx);
      const projetIds = dto.projetIds ? await this.verifierProjets(trx, user, dto.projetIds) : undefined;

      // Modifier un document déjà signé invalide la signature : retour en brouillon, à renvoyer.
      const reset = avant.signature ? { statut: 'brouillon' as const, signe_par: null, signe_le: null, decision_client_nom: null, decision_client_le: null, decision_hash: null } : {};
      const set = {
        ...(dto.clientId !== undefined ? { client_id: dto.clientId } : {}),
        ...(dto.tvaPourcent !== undefined ? { tva_pourcent: dto.tvaPourcent } : {}),
        ...reset,
      };
      if (Object.keys(set).length) await trx.updateTable('proforma').set(set).where('id', '=', id).execute();
      if (dto.lignes) await this.ecrireLignes(trx, id, dto.lignes);
      if (projetIds) await this.ecrireProjets(trx, id, projetIds);

      const apres = await this.chargerProforma(user, id, trx);
      const resume = (p: typeof avant) => ({ lignes: p.lignes, tvaPourcent: p.tvaPourcent, statut: p.statut, ...totaux(p.lignes, p.tvaPourcent) });
      await this.journal.log(trx, {
        acteurId: user.id,
        action: 'PROFORMA_MODIFIEE',
        cibleType: 'proforma',
        cibleId: id,
        cibleLibelle: avant.numero,
        clientId: apres.clientId ?? null,
        avant: resume(avant),
        apres: resume(apres),
      });
    });
    return this.getProforma(user, id);
  }

  async setProformaStatut(user: AuthUser, id: string, statut: StatutProforma) {
    await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('proforma').select('id').where('id', '=', id).forUpdate().execute();
      const avant = await this.assertModifiable(user, id, trx);
      if (avant.statut === statut) return;
      // Le cachet de l'émetteur est apposé dès que le document quitte l'état de brouillon.
      const signature =
        statut === 'brouillon'
          ? { signe_par: null, signe_le: null, decision_client_nom: null, decision_client_le: null, decision_hash: null }
          : avant.signature
            ? {}
            : { signe_par: user.id, signe_le: new Date() };
      await trx.updateTable('proforma').set({ statut, ...signature }).where('id', '=', id).execute();
      await this.journal.log(trx, {
        acteurId: user.id,
        action: 'PROFORMA_MODIFIEE',
        cibleType: 'proforma',
        cibleId: id,
        cibleLibelle: avant.numero,
        clientId: avant.clientId ?? null,
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

  // =====================================================================
  // Factures commerciales
  // =====================================================================

  private async hydrateFactures(
    db: Db,
    rows: {
      id: string; numero: string; proforma_id: string; client_id: string; tva_pourcent: number; total_ht_centimes: number;
      total_ttc_centimes: number; emise_le: Date; token_consultation: string; signature_nom: string | null; signature_le: Date | null;
      signature_hash: string | null; client_signataire: string | null; client_signe_le: Date | null; proforma_numero: string;
      u_id: string; u_nom: string; u_prenom: string;
    }[],
  ) {
    if (!rows.length) return [];
    const lignes = await db.selectFrom('ligne_facture_commerciale').selectAll().where('facture_id', 'in', rows.map((r) => r.id)).orderBy('position').execute();
    return rows.map((r) => {
      const l = mapLignes(lignes.filter((x) => x.facture_id === r.id));
      const recalcul = empreinteFacture({
        numero: r.numero, proformaNumero: r.proforma_numero, clientId: r.client_id, lignes: l, tvaPourcent: r.tva_pourcent,
        totalHtCentimes: r.total_ht_centimes, totalTtcCentimes: r.total_ttc_centimes, emiseLe: r.emise_le.toISOString(),
      });
      return {
        id: r.id,
        numero: r.numero,
        proformaId: r.proforma_id,
        clientId: r.client_id,
        lignes: l,
        tvaPourcent: r.tva_pourcent,
        totalHtCentimes: r.total_ht_centimes,
        totalTtcCentimes: r.total_ttc_centimes,
        emiseLe: r.emise_le,
        emisePar: { id: r.u_id, nom: nomComplet(r.u_prenom, r.u_nom) },
        tokenConsultation: r.token_consultation,
        signature: r.signature_hash
          ? { nom: r.signature_nom ?? '', le: r.signature_le ?? r.emise_le, hash: r.signature_hash, valide: recalcul === r.signature_hash }
          : undefined,
        signatureClient: r.client_signe_le ? { nom: r.client_signataire ?? '', le: r.client_signe_le } : undefined,
      };
    });
  }

  private factureBase(db: Db) {
    return db
      .selectFrom('facture_commerciale as f')
      .innerJoin('proforma as pf', 'pf.id', 'f.proforma_id')
      .innerJoin('utilisateur as u', 'u.id', 'f.emise_par')
      .select([
        'f.id', 'f.numero', 'f.proforma_id', 'f.client_id', 'f.tva_pourcent', 'f.total_ht_centimes', 'f.total_ttc_centimes', 'f.emise_le',
        'f.token_consultation', 'f.signature_nom', 'f.signature_le', 'f.signature_hash', 'f.client_signataire', 'f.client_signe_le',
        'pf.numero as proforma_numero', 'u.id as u_id', 'u.nom as u_nom', 'u.prenom as u_prenom',
      ]);
  }

  private factureScoped(user: AuthUser) {
    return this.factureBase(this.db)
      .innerJoin('client as c', 'c.id', 'f.client_id')
      .where((eb) => clientScope(eb, user));
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

  /** Émet la facture commerciale (snapshot signé, immuable) dans la transaction fournie. */
  private async emettreFacture(
    trx: Transaction<Database>,
    p: Awaited<ReturnType<FacturesService['chargerProforma']>>,
    emetteur: { id: string; nom: string },
    journalExterne?: string,
  ) {
    if (!p.clientId) throw new ApiException(409, 'Associez un client à la pro forma avant de générer la facture.', 'CLIENT_REQUIRED');
    const t = totaux(p.lignes, p.tvaPourcent);
    const emiseLe = new Date();
    const { rows } = await sql<{ numero: string }>`SELECT 'FC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('facture_numero_seq')::text, 4, '0') AS numero`.execute(trx);
    const numero = rows[0]!.numero;
    const hash = empreinteFacture({
      numero, proformaNumero: p.numero, clientId: p.clientId, lignes: p.lignes, tvaPourcent: p.tvaPourcent,
      totalHtCentimes: t.totalHtCentimes, totalTtcCentimes: t.totalTtcCentimes, emiseLe: emiseLe.toISOString(),
    });

    const facture = await trx
      .insertInto('facture_commerciale')
      .values({
        numero,
        proforma_id: p.id,
        client_id: p.clientId,
        tva_pourcent: p.tvaPourcent,
        total_ht_centimes: t.totalHtCentimes,
        total_ttc_centimes: t.totalTtcCentimes,
        emise_par: emetteur.id,
        emise_le: emiseLe,
        signature_nom: emetteur.nom,
        signature_le: emiseLe,
        signature_hash: hash,
        client_signataire: p.decisionClient?.nom ?? null,
        client_signe_le: p.decisionClient?.le ?? null,
      })
      .returning(['id', 'numero', 'token_consultation'])
      .executeTakeFirstOrThrow();
    await trx
      .insertInto('ligne_facture_commerciale')
      .values(p.lignes.map((l, position) => ({ facture_id: facture.id, position, designation: l.designation, quantite: l.quantite, prix_unitaire_centimes: l.prixUnitaireCentimes })))
      .execute();
    await this.journal.log(trx, {
      acteurId: emetteur.id,
      ...(journalExterne ? { acteurExterne: journalExterne } : {}),
      action: 'FACTURE_GENEREE',
      cibleType: 'facture_commerciale',
      cibleId: facture.id,
      cibleLibelle: facture.numero,
      clientId: p.clientId,
      apres: { proforma: p.numero, ...t },
    });
    return { id: facture.id, token: facture.token_consultation };
  }

  /** Génération manuelle depuis une pro forma acceptée, une seule fois (sérialisée par verrou de ligne). */
  async genererFacture(user: AuthUser, proformaId: string) {
    const factureId = await this.db.transaction().execute(async (trx) => {
      await trx.selectFrom('proforma').select('id').where('id', '=', proformaId).forUpdate().execute();
      const p = await this.chargerProforma(user, proformaId, trx);
      if (p.factureCommercialeId) throw new ApiException(409, 'Une facture commerciale existe déjà pour cette pro forma.', 'ALREADY_INVOICED');
      if (p.statut !== 'acceptee') throw new ApiException(409, 'Seule une pro forma acceptée peut être facturée.', 'NOT_ACCEPTED');
      return (await this.emettreFacture(trx, p, { id: user.id, nom: nomComplet(user.prenom, user.nom) })).id;
    });
    return this.getFacture(user, factureId);
  }

  // =====================================================================
  // Liens publics (sans authentification)
  // =====================================================================

  private async proformaParToken(db: Db, token: string) {
    const row = await this.proformaBase(db).where('p.token_consultation', '=', token).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Lien invalide ou expiré.');
    return (await this.hydrateProformas(db, [row]))[0]!;
  }

  async vuePubliqueProforma(token: string) {
    const p = await this.proformaParToken(this.db, token);
    const [client, projets, proprio] = await Promise.all([
      p.clientId ? this.db.selectFrom('client').select(['nom', 'prenom']).where('id', '=', p.clientId).executeTakeFirst() : undefined,
      p.projetIds.length ? this.db.selectFrom('projet').select(['id', 'nom']).where('id', 'in', p.projetIds).execute() : [],
      this.db.selectFrom('utilisateur').select(['nom', 'prenom']).where('id', '=', p.creePar).executeTakeFirst(),
    ]);
    return {
      numero: p.numero,
      emetteur: proprio ? nomComplet(proprio.prenom, proprio.nom) : 'ByteSec',
      client: client ? { nom: nomComplet(client.prenom, client.nom) } : undefined,
      projets: projets.map((x) => ({ nom: x.nom })),
      lignes: p.lignes,
      tvaPourcent: p.tvaPourcent,
      ...totaux(p.lignes, p.tvaPourcent),
      statut: p.statut,
      signature: p.signature ? { par: p.signature.par.nom, le: p.signature.le, hash: p.signature.hash } : undefined,
      hash: empreinteProforma({ numero: p.numero, projetIds: p.projetIds, lignes: p.lignes, tvaPourcent: p.tvaPourcent }),
      decision: p.decisionClient,
      // Le client ne peut trancher que lorsque l'émetteur a envoyé (et signé) la pro forma.
      peutDecider: p.statut === 'envoyee' && !p.factureCommercialeId,
      clientAIdentifier: !p.clientId,
      factureToken: p.factureToken,
    };
  }

  /** Validation ou refus par le client. La validation génère automatiquement la facture commerciale. */
  async deciderProforma(token: string, action: 'valider' | 'refuser', dto: DecisionInput) {
    return this.db.transaction().execute(async (trx) => {
      const brut = await trx.selectFrom('proforma').select('id').where('token_consultation', '=', token).forUpdate().executeTakeFirst();
      if (!brut) throw new ApiException(404, 'Lien invalide ou expiré.');
      const p = await this.proformaParToken(trx, token);

      if (p.statut !== 'envoyee' || p.factureCommercialeId) {
        throw new ApiException(409, 'Cette pro forma n’est plus en attente de décision.', 'NOT_PENDING');
      }
      const courant = empreinteProforma({ numero: p.numero, projetIds: p.projetIds, lignes: p.lignes, tvaPourcent: p.tvaPourcent });
      if (dto.hash !== courant) {
        throw new ApiException(409, 'Le document a été modifié depuis que vous l’avez ouvert. Rechargez la page.', 'DOCUMENT_MODIFIE');
      }

      const signataire = dto.prenom ? nomComplet(dto.prenom, dto.nom) : dto.nom.trim();
      const maintenant = new Date();

      if (action === 'refuser') {
        await trx
          .updateTable('proforma')
          .set({ statut: 'refusee', decision_client_nom: signataire, decision_client_le: maintenant, decision_hash: courant })
          .where('id', '=', p.id)
          .execute();
        await this.journal.log(trx, {
          acteurId: p.creePar,
          acteurExterne: `${signataire} (lien public)`,
          action: 'PROFORMA_REFUSEE_CLIENT',
          cibleType: 'proforma',
          cibleId: p.id,
          cibleLibelle: p.numero,
          clientId: p.clientId ?? null,
          avant: { statut: 'envoyee' },
          apres: { statut: 'refusee', ...(dto.motif ? { motif: dto.motif } : {}) },
        });
        return { statut: 'refusee' as const };
      }

      // Validation : si la pro forma n'a pas de client, le signataire en devient un (ajouté à la base clients).
      let clientId = p.clientId;
      if (!clientId) {
        const manque: Record<string, string> = {};
        if (!dto.prenom?.trim()) manque['prenom'] = 'Prénom requis';
        if (!dto.email?.trim()) manque['email'] = 'E-mail requis';
        if (!dto.telephone?.trim()) manque['telephone'] = 'Téléphone requis';
        if (Object.keys(manque).length) throw new ApiException(422, 'Certains champs sont invalides.', 'VALIDATION', manque);
        const c = await trouverOuCreerClient(
          trx,
          p.creePar,
          { prenom: dto.prenom!, nom: dto.nom, email: dto.email!, telephone: dto.telephone!, adresse: dto.adresse },
          { statut: 'qualifie' },
        );
        clientId = c.id;
      }

      await trx
        .updateTable('proforma')
        .set({ statut: 'acceptee', client_id: clientId, decision_client_nom: signataire, decision_client_le: maintenant, decision_hash: courant })
        .where('id', '=', p.id)
        .execute();
      await this.journal.log(trx, {
        acteurId: p.creePar,
        acteurExterne: `${signataire} (lien public)`,
        action: 'PROFORMA_VALIDEE_CLIENT',
        cibleType: 'proforma',
        cibleId: p.id,
        cibleLibelle: p.numero,
        clientId,
        avant: { statut: 'envoyee' },
        apres: { statut: 'acceptee' },
      });

      const frais = await this.proformaParToken(trx, token);
      const proprio = await trx.selectFrom('utilisateur').select(['id', 'nom', 'prenom']).where('id', '=', p.creePar).executeTakeFirstOrThrow();
      const facture = await this.emettreFacture(trx, frais, { id: proprio.id, nom: nomComplet(proprio.prenom, proprio.nom) }, `${signataire} (validation client)`);
      return { statut: 'acceptee' as const, factureToken: facture.token };
    });
  }

  async vuePubliqueFacture(token: string) {
    const row = await this.factureBase(this.db).where('f.token_consultation', '=', token).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Lien invalide ou expiré.');
    const f = (await this.hydrateFactures(this.db, [row]))[0]!;
    const client = await this.db.selectFrom('client').select(['nom', 'prenom', 'adresse', 'email', 'telephone']).where('id', '=', f.clientId).executeTakeFirstOrThrow();
    return {
      numero: f.numero,
      proformaNumero: row.proforma_numero,
      emiseLe: f.emiseLe,
      client: { nom: nomComplet(client.prenom, client.nom), adresse: client.adresse, email: client.email, telephone: client.telephone },
      lignes: f.lignes,
      tvaPourcent: f.tvaPourcent,
      totalHtCentimes: f.totalHtCentimes,
      totalTtcCentimes: f.totalTtcCentimes,
      signature: f.signature,
      signatureClient: f.signatureClient,
    };
  }
}
