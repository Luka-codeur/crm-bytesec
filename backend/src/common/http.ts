import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
  ValidationPipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION',
  429: 'TOO_MANY_REQUESTS',
};

/** Erreur métier au format { message, code } attendu par le front. */
export class ApiException extends HttpException {
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super({ message, code: code ?? CODES[status] ?? `HTTP_${status}`, details }, status);
  }
}

function flatten(errors: ValidationError[], prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors) {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) out[path] = Object.values(e.constraints)[0] ?? 'Valeur invalide';
    if (e.children?.length) Object.assign(out, flatten(e.children, path));
  }
  return out;
}

/** 422 avec { message, code: 'VALIDATION', details: { champ: message } }. */
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new UnprocessableEntityException({
        message: 'Certains champs sont invalides.',
        code: 'VALIDATION',
        details: flatten(errors),
      }),
  });

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      const message = Array.isArray(obj['message']) ? (obj['message'] as string[]).join(', ') : obj['message'];
      res.status(status).json({
        message: message ?? exception.message,
        code: obj['code'] ?? CODES[status] ?? `HTTP_${status}`,
        ...(obj['details'] !== undefined ? { details: obj['details'] } : {}),
      });
      return;
    }

    // Triggers Postgres (facture immuable, pro forma verrouillée, journal) : SQLSTATE 23001.
    const pg = exception as { code?: string; message?: string };
    if (pg.code === '23001') {
      res.status(HttpStatus.CONFLICT).json({ message: pg.message, code: 'LOCKED' });
      return;
    }
    if (pg.code === '23503') {
      res.status(HttpStatus.CONFLICT).json({ message: 'Opération impossible : élément encore référencé.', code: 'CONFLICT' });
      return;
    }
    if (pg.code === '22P02') {
      res.status(HttpStatus.NOT_FOUND).json({ message: 'Ressource introuvable.', code: 'NOT_FOUND' });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(500).json({ message: 'Erreur interne du serveur.', code: 'INTERNAL' });
  }
}

export interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageParams(page?: number, pageSize?: number) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(200, Math.max(1, Number(pageSize) || 20));
  return { page: p, pageSize: s, offset: (p - 1) * s };
}

export const refUser = (id: string, nom: string, prenom = '') => ({ id, nom: `${prenom} ${nom}`.trim() });
