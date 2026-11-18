import { Injectable } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
import type { Database, JournalTable } from '../database/schema';

type Db = Kysely<Database> | Transaction<Database>;

export interface JournalInput {
  acteurId: string;
  action: JournalTable['action'];
  cibleType: JournalTable['cible_type'];
  cibleId: string;
  cibleLibelle: string;
  clientId?: string | null;
  avant?: Record<string, unknown>;
  apres?: Record<string, unknown>;
}

/** Écrit dans le journal ; à appeler avec la transaction de l'action tracée. */
@Injectable()
export class JournalService {
  async log(db: Db, e: JournalInput) {
    await db
      .insertInto('journal')
      .values({
        acteur_id: e.acteurId,
        action: e.action,
        cible_type: e.cibleType,
        cible_id: e.cibleId,
        cible_libelle: e.cibleLibelle,
        client_id: e.clientId ?? null,
        avant: e.avant ? JSON.stringify(e.avant) : null,
        apres: e.apres ? JSON.stringify(e.apres) : null,
      })
      .execute();
  }
}
