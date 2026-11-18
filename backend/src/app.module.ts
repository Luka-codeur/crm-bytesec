import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { Public } from './auth/auth';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { DatabaseModule } from './database/database.module';
import { FacturesModule } from './factures/factures.module';
import { JournalModule } from './journal/journal.module';
import { ProjetsModule } from './projets/projets.module';
import { PublicModule } from './public/public.module';
import { TachesModule } from './taches/taches.module';
import { UsersModule } from './users/users.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    DatabaseModule,
    AuthModule,
    JournalModule,
    UsersModule,
    ClientsModule,
    ProjetsModule,
    FacturesModule,
    TachesModule,
    PublicModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
