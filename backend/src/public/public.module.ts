import { Body, Controller, Get, HttpCode, Module, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { Public } from '../auth/auth';
import { FacturesModule } from '../factures/factures.module';
import { FacturesService } from '../factures/factures.service';
import { ProjetsModule } from '../projets/projets.module';
import { ProjetsService } from '../projets/projets.service';

/** Jeton de consultation : 36 caractères hexadécimaux (18 octets aléatoires). */
const TOKEN = /^[a-f0-9]{36}$/;
const verif = (token: string) => (TOKEN.test(token) ? token : '');

class InscriptionDto {
  @IsString() @MinLength(1) @MaxLength(100) prenom!: string;
  @IsString() @MinLength(1) @MaxLength(100) nom!: string;
  @IsEmail({}, { message: 'E-mail invalide' }) @MaxLength(254) email!: string;
  @IsString() @MinLength(3, { message: 'Téléphone requis' }) @MaxLength(40) telephone!: string;
  @IsOptional() @IsString() @MaxLength(300) adresse?: string;
}

class DecisionDto {
  @IsString() @MinLength(2, { message: 'Nom requis pour signer' }) @MaxLength(200) nom!: string;
  @IsOptional() @IsString() @MaxLength(100) prenom?: string;
  @IsOptional() @IsEmail({}, { message: 'E-mail invalide' }) @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) telephone?: string;
  @IsOptional() @IsString() @MaxLength(300) adresse?: string;
  @IsString() @Length(64, 64) hash!: string;
  @IsOptional() @IsString() @MaxLength(500) motif?: string;
}

/**
 * Liens de consultation partagés par l'agent ou le chef (projet, pro forma, facture commerciale).
 * Aucune authentification : le jeton secret du lien fait office d'autorisation, et les routes sont
 * limitées en fréquence par adresse IP.
 */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('public')
class PublicController {
  constructor(
    private readonly projets: ProjetsService,
    private readonly factures: FacturesService,
  ) {}

  @Get('projets/:token')
  projet(@Param('token') token: string) {
    return this.projets.vuePublique(verif(token));
  }

  @Post('projets/:token/inscription')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  inscription(@Param('token') token: string, @Body() dto: InscriptionDto) {
    return this.projets.inscrire(verif(token), dto);
  }

  @Get('proformas/:token')
  proforma(@Param('token') token: string) {
    return this.factures.vuePubliqueProforma(verif(token));
  }

  @Post('proformas/:token/valider')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  valider(@Param('token') token: string, @Body() dto: DecisionDto) {
    return this.factures.deciderProforma(verif(token), 'valider', dto);
  }

  @Post('proformas/:token/refuser')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  refuser(@Param('token') token: string, @Body() dto: DecisionDto) {
    return this.factures.deciderProforma(verif(token), 'refuser', dto);
  }

  @Get('factures/:token')
  facture(@Param('token') token: string) {
    return this.factures.vuePubliqueFacture(verif(token));
  }
}

@Module({ imports: [ProjetsModule, FacturesModule], controllers: [PublicController] })
export class PublicModule {}
