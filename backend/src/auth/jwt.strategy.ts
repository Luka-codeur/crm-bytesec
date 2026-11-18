import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Kysely } from 'kysely';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectKysely } from '../database/database.module';
import type { Database } from '../database/schema';
import type { AuthUser, Role } from './auth';

/** Équipe créée par la migration 0006 : rattachement à la première connexion. */
const EQUIPE_PAR_DEFAUT = '00000000-0000-0000-0000-000000000001';

interface KeycloakPayload {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  azp?: string;
  realm_access?: { roles?: string[] };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly clientId?: string;

  constructor(
    config: ConfigService,
    @InjectKysely() private readonly db: Kysely<Database>,
  ) {
    const issuerUrl = config.get<string>('KEYCLOAK_ISSUER_URL');
    const issuer = `${config.getOrThrow<string>('KEYCLOAK_URL')}/realms/${config.getOrThrow<string>('KEYCLOAK_REALM')}`;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Le jeton est émis avec l'URL publique de Keycloak (celle du navigateur),
      // qui peut différer de l'URL interne Docker : KEYCLOAK_ISSUER_URL la surcharge.
      issuer: issuerUrl ?? issuer,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
    });
    this.clientId = config.get<string>('KEYCLOAK_CLIENT_ID');
  }

  async validate(p: KeycloakPayload): Promise<AuthUser> {
    if (!p.sub) throw new UnauthorizedException('Jeton sans sujet');
    // Keycloak met aud=account quel que soit le client : azp identifie le client émetteur.
    if (this.clientId && p.azp !== this.clientId) {
      throw new UnauthorizedException("Jeton non émis pour cette application");
    }
    const roles = p.realm_access?.roles ?? [];
    const role: Role | undefined = roles.includes('chef_equipe')
      ? 'chef_equipe'
      : roles.includes('agent')
        ? 'agent'
        : undefined;
    if (!role) throw new ForbiddenException('Aucun rôle CRM (agent ou chef_equipe) sur ce compte');

    const email = p.email ?? `${p.preferred_username ?? p.sub}@inconnu.local`;
    const row = await this.db
      .insertInto('utilisateur')
      .values({
        keycloak_id: p.sub,
        email,
        nom: p.family_name ?? p.preferred_username ?? 'Inconnu',
        prenom: p.given_name ?? '',
        role,
        equipe_id: EQUIPE_PAR_DEFAUT,
      })
      .onConflict((oc) =>
        oc.column('keycloak_id').doUpdateSet({
          email,
          role,
          nom: p.family_name ?? p.preferred_username ?? 'Inconnu',
          prenom: p.given_name ?? '',
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      keycloakId: row.keycloak_id,
      email: row.email,
      nom: row.nom,
      prenom: row.prenom,
      role: row.role,
      equipeId: row.equipe_id,
    };
  }
}
