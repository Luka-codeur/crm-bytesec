import { Injectable } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import type { AuthUser } from '../auth/auth';
import { clientScope } from '../common/access';
import { ApiException, ListResponse, pageParams } from '../common/http';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import { JournalService } from '../journal/journal.service';

type Db = Kysely<Database> | Transaction<Database>;
type Statut = 'prospect' | 'qualifie' | 'confirme';

export interface ClientListQuery {
  statut?: Statut[];
  semaine?: string;
  q?: string;
  ajoutePar?: string;
  page?: number;
  pageSize?: number;
}

/** Début (lundi 00:00 UTC) d'une semaine ISO au format 2026-W47. */
export function debutSemaineIso(semaine: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(semaine);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const isoDow = jan4.getUTCDay() || 7;
  const lundiSemaine1 = Date.UTC(year, 0, 4 - (isoDow - 1));
  return new Date(lundiSemaine1 + (week - 1) * 7 * 86_400_000);
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectKysely() private readonly db: Kysely<Database>,
    private readonly journal: JournalService,
  ) {}

  private base(db: Db, user: AuthUser) {
    return db
      .selectFrom('client as c')
      .innerJoin('utilisateur as u', 'u.id', 'c.ajoute_par')
      .where((eb) => clientScope(eb, user));
  }

  private select(db: Db, user: AuthUser) {
    return this.base(db, user).select([
      'c.id', 'c.nom', 'c.prenom', 'c.adresse', 'c.email', 'c.telephone', 'c.statut', 'c.projet_id',
      'c.cree_le', 'c.modifie_le', 'u.id as u_id', 'u.nom as u_nom', 'u.prenom as u_prenom',
    ]);
  }

  private static map(r: {
    id: string; nom: string; prenom: string; adresse: string; email: string; telephone: string; statut: Statut;
    projet_id: string | null; cree_le: Date; modifie_le: Date; u_id: string; u_nom: string; u_prenom: string;
  }) {
    return {
      id: r.id,
      nom: r.nom,
      prenom: r.prenom,
      adresse: r.adresse,
      email: r.email,
      telephone: r.telephone,
      statut: r.statut,
      projetId: r.projet_id ?? undefined,
      ajoutePar: { id: r.u_id, nom: `${r.u_prenom} ${r.u_nom}`.trim() },
      creeLe: r.cree_le,
      modifieLe: r.modifie_le,
    };
  }

  /** Lève 404 si le client n'existe pas ou sort du périmètre de l'utilisateur. */
  async assertVisible(user: AuthUser, clientId: string, db: Db = this.db) {
    const row = await this.base(db, user).where('c.id', '=', clientId).select(['c.id', 'c.nom', 'c.prenom']).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Client introuvable.');
    return row;
  }

  async list(user: AuthUser, q: ClientListQuery): Promise<ListResponse<ReturnType<typeof ClientsService.map>>> {
    const { page, pageSize, offset } = pageParams(q.page, q.pageSize);
    const filtered = (qb: ReturnType<ClientsService['select']>) => {
      let r = qb;
      if (q.statut?.length) r = r.where('c.statut', 'in', q.statut);
      if (q.ajoutePar) r = r.where('c.ajoute_par', '=', q.ajoutePar);
      if (q.semaine) {
        const debut = debutSemaineIso(q.semaine);
        if (!debut) throw new ApiException(422, 'Semaine invalide (format attendu : 2026-W47).', 'VALIDATION', { semaine: 'Format 2026-W47' });
        r = r.where('c.cree_le', '>=', debut).where('c.cree_le', '<', new Date(debut.getTime() + 7 * 86_400_000));
      }
      if (q.q) {
        const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
        r = r.where((eb) => eb.or([eb('c.nom', 'ilike', like), eb('c.prenom', 'ilike', like), eb('c.email', 'ilike', like)]));
      }
      return r;
    };
    const total = await filtered(this.select(this.db, user))
      .clearSelect()
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    const rows = await filtered(this.select(this.db, user)).orderBy('c.cree_le', 'desc').limit(pageSize).offset(offset).execute();
    return { data: rows.map(ClientsService.map), total: Number(total.n), page, pageSize };
  }

  async get(user: AuthUser, id: string, db: Db = this.db) {
    const row = await this.select(db, user).where('c.id', '=', id).executeTakeFirst();
    if (!row) throw new ApiException(404, 'Client introuvable.');
    return ClientsService.map(row);
  }

  async create(user: AuthUser, input: { nom: string; prenom: string; adresse?: string; email: string; telephone: string; statut?: Statut }) {
    const { id } = await this.db
      .insertInto('client')
      .values({ ...input, adresse: input.adresse ?? '', ajoute_par: user.id, projet_id: null })
      .returning('id')
      .executeTakeFirstOrThrow();
    return this.get(user, id);
  }

  async update(
    user: AuthUser,
    id: string,
    patch: { nom?: string; prenom?: string; adresse?: string; email?: string; telephone?: string; statut?: Statut; projetId?: string | null },
  ) {
    await this.assertVisible(user, id);
    const { projetId, statut, ...rest } = patch;
    if (projetId) {
      const p = await this.db.selectFrom('projet').select('id').where('id', '=', projetId).where('client_id', '=', id).executeTakeFirst();
      if (!p) throw new ApiException(422, 'Ce projet n’appartient pas à ce client.', 'VALIDATION', { projetId: 'Projet invalide' });
    }
    // Le statut ne change que via setStatut (journalisé) : on l'y redirige.
    if (statut) return this.setStatut(user, id, statut, { ...rest, ...(projetId !== undefined ? { projet_id: projetId } : {}) });
    const values = { ...rest, ...(projetId !== undefined ? { projet_id: projetId } : {}) };
    if (Object.keys(values).length) await this.db.updateTable('client').set(values).where('id', '=', id).execute();
    return this.get(user, id);
  }

  async setStatut(user: AuthUser, id: string, statut: Statut, extra: Record<string, unknown> = {}) {
    await this.assertVisible(user, id);
    await this.db.transaction().execute(async (trx) => {
      const avant = await trx.selectFrom('client').select(['statut', 'nom', 'prenom']).where('id', '=', id).forUpdate().executeTakeFirstOrThrow();
      await trx.updateTable('client').set({ ...extra, statut }).where('id', '=', id).execute();
      if (avant.statut !== statut) {
        await this.journal.log(trx, {
          acteurId: user.id,
          action: 'STATUT_CLIENT_MODIFIE',
          cibleType: 'client',
          cibleId: id,
          cibleLibelle: `${avant.prenom} ${avant.nom}`.trim(),
          clientId: id,
          avant: { statut: avant.statut },
          apres: { statut },
        });
      }
    });
    return this.get(user, id);
  }

  async remove(user: AuthUser, id: string) {
    await this.assertVisible(user, id);
    await this.db.deleteFrom('client').where('id', '=', id).execute();
  }
}
