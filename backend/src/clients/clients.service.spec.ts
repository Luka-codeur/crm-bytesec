import { debutSemaineIso } from './clients.service';

describe('debutSemaineIso', () => {
  it('renvoie le lundi 00:00 UTC de la semaine ISO', () => {
    expect(debutSemaineIso('2026-W47')?.toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('gère la semaine 1 qui commence avant le 1er janvier', () => {
    expect(debutSemaineIso('2026-W01')?.toISOString()).toBe('2025-12-29T00:00:00.000Z');
  });

  it('rejette un format invalide', () => {
    expect(debutSemaineIso('2026-47')).toBeNull();
    expect(debutSemaineIso('n’importe quoi')).toBeNull();
  });
});
