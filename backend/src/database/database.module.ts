import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, types } from 'pg';
import type { Database } from './schema';

export const KYSELY = Symbol('KYSELY');
export const InjectKysely = () => Inject(KYSELY);

// BIGINT (montants en centimes) et NUMERIC -> number ; DATE -> 'YYYY-MM-DD'.
types.setTypeParser(20, (v: string) => Number(v));
types.setTypeParser(1700, (v: string) => Number(v));
types.setTypeParser(1082, (v: string) => v);

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Kysely<Database>({
          dialect: new PostgresDialect({
            pool: new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
          }),
        }),
    },
  ],
  exports: [KYSELY],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown() {
    await this.db.destroy();
  }
}
