import { empreinteFacture, empreinteProforma, tranches, totaux } from './documents';

describe('tranches', () => {
  it('somme exactement au prix, en francs entiers', () => {
    for (const prix of [0, 100, 25_000_000, 10_000_001, 8_000_000, 33_333_300, 1]) {
      const t = tranches(prix, 3);
      expect(t).toHaveLength(3);
      expect(t.reduce((a, b) => a + b, 0)).toBe(prix);
    }
  });

  it('250 000 FCFA => 83 333 / 83 333 / 83 334', () => {
    expect(tranches(25_000_000)).toEqual([8_333_300, 8_333_300, 8_333_400]);
  });

  it('la dernière tranche absorbe le reste', () => {
    const t = tranches(10_000_001);
    expect(t[0]).toBe(t[1]);
    expect(t[2]).toBeGreaterThanOrEqual(t[0]!);
  });

  it('au moins une tranche', () => {
    expect(tranches(500, 0)).toEqual([500]);
  });
});

describe('totaux', () => {
  it('calcule HT et TTC arrondis', () => {
    expect(totaux([{ quantite: 2, prixUnitaireCentimes: 8_000_000 }, { quantite: 1, prixUnitaireCentimes: 1_500_000 }], 18)).toEqual({
      totalHtCentimes: 17_500_000,
      totalTtcCentimes: 20_650_000,
    });
  });
});

describe('empreintes (cachet électronique)', () => {
  const base = {
    numero: 'PF-2026-0001',
    projetIds: ['b', 'a'],
    lignes: [{ designation: 'Pack', quantite: 2, prixUnitaireCentimes: 100 }],
    tvaPourcent: 18,
  };

  it('est un SHA-256 hexadécimal', () => {
    expect(empreinteProforma(base)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ne dépend pas de l'ordre des projets", () => {
    expect(empreinteProforma(base)).toBe(empreinteProforma({ ...base, projetIds: ['a', 'b'] }));
  });

  it('change dès que le contenu change', () => {
    const h = empreinteProforma(base);
    expect(empreinteProforma({ ...base, tvaPourcent: 10 })).not.toBe(h);
    expect(empreinteProforma({ ...base, lignes: [{ designation: 'Pack', quantite: 3, prixUnitaireCentimes: 100 }] })).not.toBe(h);
    expect(empreinteProforma({ ...base, numero: 'PF-2026-0002' })).not.toBe(h);
  });

  it("l'empreinte de facture détecte toute altération", () => {
    const f = {
      numero: 'FC-2026-0001',
      proformaNumero: 'PF-2026-0001',
      clientId: 'c1',
      lignes: base.lignes,
      tvaPourcent: 18,
      totalHtCentimes: 200,
      totalTtcCentimes: 236,
      emiseLe: '2026-11-18T10:00:00.000Z',
    };
    const h = empreinteFacture(f);
    expect(empreinteFacture({ ...f })).toBe(h);
    expect(empreinteFacture({ ...f, totalTtcCentimes: 237 })).not.toBe(h);
    expect(empreinteFacture({ ...f, clientId: 'c2' })).not.toBe(h);
  });
});
