import { Injectable, Logger } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import type { AuthUser } from '../auth/auth';
import { clientScope } from '../common/access';
import { tranches } from '../common/documents';
import { ApiException, ListResponse } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import { trouverOuCreerClient } from '../common/public-client';
import { JournalService } from '../journal/journal.service';

type Db = Kysely<Database> | Transaction<Database>;

export interface PackInput {
  nom: string;
  description?: string | undefined;
  /** Prix final (centimes). Absent = somme des formations. */
  prixCentimes?: number | undefined;
  formations: { id: string }[];
}

export interface ProjetInput {
  nom: string;
  description?: string | undefined;
  packs: PackInput[];
}

export interface InscriptionInput {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  adresse?: string | undefined;
}

type ProjetRow = {
  id: string;
  nom: string;
  description: string;
  client_id: string | null;
  statut: 'brouillon' | 'envoye';
  envoye_le: Date | null;
  cree_le: Date;
  token_consultation: string;
};

@Injectable()
export class ProjetsService {
  private readonly logger = new Logger(ProjetsService.name);

  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly journal: JournalService,
  ) {}

  // ---------- lecture ----------

  private async packsDe(db: Db, projetIds: string[]) {
    if (!projetIds.length) return [];
    const packs = await db.selectFrom('pack').selectAll().where('projet_id', 'in', projetIds).orderBy('position').execute();
    const links = packs.length
      ? await db
          .selectFrom('pack_formation as pf')
          .innerJoin('formation as f', 'f.id', 'pf.formation_id')
          .select(['pf.pack_id', 'f.id', 'f.titre', 'f.description', 'f.duree_heures', 'f.prix_centimes'])
          .where('pf.pack_id', 'in', packs.map((p) => p.id))
          .orderBy('pf.position')
          .execute()
      : [];
    return packs.map((p) => {
      const formations = links.filter((l) => l.pack_id === p.id);
      return { pack: p, formations };
    });
  }

  private async hydrate(db: Db, rows: ProjetRow[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const packs = await this.packsDe(db, ids);
    const inscrits = await db
      .selectFrom('projet_inscription')
      .select(['projet_id', (eb) => eb.fn.countAll<number>().as('n')])
      .where('projet_id', 'in', ids)
      .groupBy('projet_id')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      description: r.description,
      // Champ hérité : les projets ne sont plus rattachés à un client, les clients s'inscrivent via le lien.
      clientId: r.client_id ?? undefined,
      statut: r.statut,
      envoyeLe: r.envoye_le ?? undefined,
      creeLe: r.cree_le,
      tokenConsultation: r.token_consultation,
      inscritsCount: Number(inscrits.find((i) => i.projet_id === r.id)?.n ?? 0),
      packs: packs
        .filter((x) => x.pack.projet_id === r.id)
        .map(({ pack: p, formations }) => ({
          id: p.id,
          nom: p.nom,
          description: p.description,
          prixCentimes: p.prix_centimes,
          prixAutoCentimes: formations.reduce((s, f) => s + f.prix_centimes, 0),
          prixPersonnalise: p.prix_personnalise,
          nbTranches: p.nb_tranches,
          tranchesCentimes: tranches(p.prix_centimes, p.nb_tranches),
          formations: formations.map((f) => ({
            id: f.id,
            titre: f.titre,
            description: f.description,
            dureeHeures: f.duree_heures,
            prixCentimes: f.prix_centimes,
          })),
        })),
    }));
  }

  /** Projets créés par l'utilisateur (agent) ou par son équipe (chef). */
  private scoped(db: Db, user: AuthUser) {
    return db
      .selectFrom('projet as p')
      .where((eb) => clientScope(eb, user, 'p.cree_par'))
      .select(['p.id', 'p.nom', 'p.description', 'p.client_id', 'p.statut', 'p.envoye_le', 'p.cree_le', 'p.token_consultation']);
  }

  async list(user: AuthUser, clientId?: string): Promise<ListResponse<unknown>> {
    let q = this.scoped(this.db, user);
    if (clientId) {
      q = q.where((eb) =>
        eb.or([
          eb('p.client_id', '=', clientId),
          eb('p.id', 'in', eb.selectFrom('projet_inscription').select('projet_id').where('client_id', '=', clientId)),
        ]),
      );
    }
    const rows = await q.orderBy('p.cree_le', 'desc').execute();
    const data = await this.hydrate(this.db, rows);
    return { data, total: data.length, page: 1, pageSize: data.length || 1 };
  }

  async get(user: AuthUser, id: string, db: Db = this.db) {
    const row = await this.scoped(db, user).where('p.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Projet introuvable.');
    return (await this.hydrate(db, [row]))[0]!;
  }

  async inscrits(user: AuthUser, id: string) {
    await this.get(user, id);
    const rows = await this.db
      .selectFrom('projet_inscription as i')
      .innerJoin('client as c', 'c.id', 'i.client_id')
      .select(['c.id', 'c.nom', 'c.prenom', 'c.email', 'c.telephone', 'c.statut', 'i.cree_le'])
      .where('i.projet_id', '=', id)
      .orderBy('i.cree_le', 'desc')
      .execute();
    return rows.map((r) => ({ id: r.id, nom: r.nom, prenom: r.prenom, email: r.email, telephone: r.telephone, statut: r.statut, inscritLe: r.cree_le }));
  }

  // ---------- écriture ----------

  private async writePacks(trx: Transaction<Database>, projetId: string, packs: PackInput[]) {
    const fids = [...new Set(packs.flatMap((p) => p.formations.map((f) => f.id)))];
    const catalogue = fids.length ? await trx.selectFrom('formation').select(['id', 'prix_centimes']).where('id', 'in', fids).execute() : [];
    if (catalogue.length !== fids.length) {
      throw new ApiException(422, 'Une formation du pack est inconnue.', 'VALIDATION', { packs: 'Formation inconnue' });
    }
    const prix = new Map(catalogue.map((f) => [f.id, f.prix_centimes]));

    await trx.deleteFrom('pack').where('projet_id', '=', projetId).execute();
    for (const [i, p] of packs.entries()) {
      const ids = [...new Set(p.formations.map((f) => f.id))];
      const auto = ids.reduce((s, id) => s + (prix.get(id) ?? 0), 0);
      const final = p.prixCentimes ?? auto;
      const pack = await trx
        .insertInto('pack')
        .values({ projet_id: projetId, nom: p.nom, description: p.description ?? '', prix_centimes: final, prix_personnalise: final !== auto, position: i })
        .returning('id')
        .executeTakeFirstOrThrow();
      if (ids.length) {
        await trx.insertInto('pack_formation').values(ids.map((formation_id, position) => ({ pack_id: pack.id, formation_id, position }))).execute();
      }
    }
  }

  async create(user: AuthUser, dto: ProjetInput) {
    const id = await this.db.transaction().execute(async (trx) => {
      const { id } = await trx
        .insertInto('projet')
        .values({ nom: dto.nom, description: dto.description ?? '', client_id: null, cree_par: user.id, envoye_le: null })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.writePacks(trx, id, dto.packs);
      return id;
    });
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, dto: Partial<ProjetInput>) {
    await this.get(user, id);
    await this.db.transaction().execute(async (trx) => {
      const set = {
        ...(dto.nom !== undefined ? { nom: dto.nom } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
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

  /** Marque le projet comme partagé (lien copié et transmis). Un projet peut n'avoir aucun pack. */
  async partager(user: AuthUser, id: string) {
    const projet = await this.get(user, id);
    await this.db.updateTable('projet').set({ statut: 'envoye', envoye_le: new Date() }).where('id', '=', id).execute();
    this.logger.log(`Projet ${id} « ${projet.nom} » partagé (lien ${projet.tokenConsultation.slice(0, 6)}…)`);
    return this.get(user, id);
  }

  // ---------- lien public (sans authentification) ----------

  private async parToken(db: Db, token: string) {
    const row = await db
      .selectFrom('projet')
      .select(['id', 'nom', 'description', 'client_id', 'statut', 'envoye_le', 'cree_le', 'token_consultation', 'cree_par'])
      .where('token_consultation', '=', token)
      .executeTakeFirst();
    if (!row) throw new ApiException(404, 'Lien invalide ou expiré.');
    return row;
  }

  /** Vue lecture seule : le prix des packs n'est donné qu'en tranches. */
  async vuePublique(token: string) {
    const row = await this.parToken(this.db, token);
    const [p] = await this.hydrate(this.db, [row]);
    return {
      nom: p!.nom,
      description: p!.description,
      packs: p!.packs.map((k) => ({
        nom: k.nom,
        description: k.description,
        nbTranches: k.nbTranches,
        tranchesCentimes: k.tranchesCentimes,
        formations: k.formations.map((f) => ({ titre: f.titre, description: f.description, dureeHeures: f.dureeHeures })),
      })),
    };
  }

  /** « S'inscrire maintenant » : le prospect devient client de l'équipe du créateur du projet. */
  async inscrire(token: string, dto: InscriptionInput) {
    await this.db.transaction().execute(async (trx) => {
      const projet = await this.parToken(trx, token);
      const email = dto.email.trim().toLowerCase();

      const { id: clientId, cree } = await trouverOuCreerClient(trx, projet.cree_par, dto, { projetId: projet.id });

      const inserted = await trx
        .insertInto('projet_inscription')
        .values({ projet_id: projet.id, client_id: clientId })
        .onConflict((oc) => oc.columns(['projet_id', 'client_id']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (inserted) {
        await this.journal.log(trx, {
          acteurId: projet.cree_par,
          acteurExterne: `${dto.prenom.trim()} ${dto.nom.trim()} (lien public)`,
          action: 'CLIENT_INSCRIT',
          cibleType: 'projet',
          cibleId: projet.id,
          cibleLibelle: projet.nom,
          clientId,
          apres: { projet: projet.nom, nouveauClient: cree },
        });
      }
    });
    // Réponse volontairement identique que l'e-mail soit déjà connu ou non (pas de fuite d'information).
    return { ok: true };
  }
}
