import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type Role = 'agent' | 'chef_equipe';

/** Utilisateur applicatif (ligne `utilisateur`) dérivé du jeton Keycloak vérifié. */
export interface AuthUser {
  id: string;
  keycloakId: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  equipeId: string;
}

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restreint une route à ces rôles (l'absence de décorateur = tout utilisateur authentifié). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
