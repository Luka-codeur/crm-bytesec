import { ApiError } from "../client";
import { getDb, getMockUser, MOCK_USERS, nextId, refOf } from "./db";
import { weekRange } from "@/lib/format";
import { calcTotaux } from "@/features/factures/rules";
import type {
  ActionJournal, Client, ClientsQuery, DecisionInput, FactureCommerciale, FacturePublic, FactureProforma, Inscrit, InscriptionInput,
  JournalEntree, JournalQuery, ListResponse, Pack, PackInput, ProformaPublic, Projet, ProjetPublic, StatutClient, StatutProforma,
  StatutTache, Tache, TachesQuery, Utilisateur, AvancementAgent, Formation,
} from "@/types";

const now = () => new Date().toISOString();

export function me(): Utilisateur {
  const u = getMockUser();
  if (!u) throw new ApiError(401, "UNAUTHENTICATED", "Session expirée, veuillez vous reconnecter.");
  return u;
}
const isChef = () => me().role === "chef_equipe";
function requireChef() {
  if (!isChef()) throw new ApiError(403, "FORBIDDEN", "Action réservée au chef d'équipe.");
}
const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} introuvable.`);

function paginate<T>(items: T[], page = 1, pageSize = 20): ListResponse<T> {
  const p = Math.max(1, page);
  return { data: items.slice((p - 1) * pageSize, p * pageSize), total: items.length, page: p, pageSize };
}

function log(action: ActionJournal, cible: JournalEntree["cible"], details: JournalEntree["details"], clientId?: string) {
  getDb().journal.unshift({ id: nextId("j"), acteur: refOf(me()), action, cible, details, clientId, date: now() });
}

/* ---------- Clients ---------- */
function visibleClients(): Client[] {
  const u = me();
  const equipe = new Set(MOCK_USERS.filter((x) => x.equipeId === u.equipeId).map((x) => x.id));
  return getDb().clients.filter((c) => (u.role === "chef_equipe" ? equipe.has(c.ajoutePar.id) : c.ajoutePar.id === u.id));
}
function findClient(id: string): Client {
  const c = visibleClients().find((x) => x.id === id);
  if (!c) throw notFound("Client");
  return c;
}

export const clients = {
  list(q: ClientsQuery): ListResponse<Client> {
    let items = visibleClients();
    if (q.statut?.length) items = items.filter((c) => q.statut!.includes(c.statut));
    if (q.semaine) {
      const r = weekRange(q.semaine);
      if (r) items = items.filter((c) => { const d = new Date(c.creeLe); return d >= r.start && d <= r.end; });
    }
    if (q.q) {
      const s = q.q.toLowerCase();
      items = items.filter((c) => `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(s));
    }
    if (q.ajoutePar && isChef()) items = items.filter((c) => c.ajoutePar.id === q.ajoutePar);
    items = [...items].sort((a, b) => b.creeLe.localeCompare(a.creeLe));
    return paginate(items, q.page, q.pageSize);
  },
  get: findClient,
  create(input: Omit<Client, "id" | "ajoutePar" | "creeLe" | "modifieLe">): Client {
    if (getDb().clients.some((c) => c.email.toLowerCase() === input.email.toLowerCase()))
      throw new ApiError(422, "VALIDATION", "Certains champs sont invalides.", { email: "Cet e-mail est déjà utilisé par un autre client." });
    const c: Client = { ...input, id: nextId("c"), ajoutePar: refOf(me()), creeLe: now(), modifieLe: now() };
    getDb().clients.push(c);
    return c;
  },
  update(id: string, patch: Partial<Client>): Client {
    const c = findClient(id);
    const { statut: _ignored, ...rest } = patch;
    Object.assign(c, rest, { modifieLe: now() });
    return c;
  },
  remove(id: string) {
    findClient(id);
    const d = getDb();
    d.clients = d.clients.filter((c) => c.id !== id);
  },
  setStatut(id: string, statut: StatutClient): Client {
    const c = findClient(id);
    const avant = c.statut;
    c.statut = statut;
    c.modifieLe = now();
    log("STATUT_CLIENT_MODIFIE", { type: "client", id, libelle: `${c.prenom} ${c.nom}` }, { avant: { statut: avant }, apres: { statut } }, id);
    return c;
  },
};

/* ---------- Formations ---------- */
export const formations = {
  list: () => getDb().formations,
  create(input: Omit<Formation, "id">): Formation {
    const f = { ...input, id: nextId("f") };
    getDb().formations.push(f);
    return f;
  },
};

/* ---------- Projets ---------- */
const visibleClientIds = () => new Set(visibleClients().map((c) => c.id));

/* ---------- Outils de démonstration (calculs identiques à l'API) ---------- */
const tranchesDe = (prix: number, n = 3): number[] => {
  const base = Math.floor(prix / 100 / n) * 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? prix - base * (n - 1) : base));
};
/** Empreinte factice (non cryptographique) : suffit à démontrer le cachet en mode démo. */
const mockHash = (s: string) => {
  let h = 5381;
  const out: string[] = [];
  for (let r = 0; r < 8; r++) {
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    out.push(h.toString(16).padStart(8, "0"));
  }
  return out.join("");
};
const contenuProforma = (p: FactureProforma) => JSON.stringify([p.numero, [...p.projetIds].sort(), p.lignes, p.tvaPourcent]);
const hashProforma = (p: FactureProforma) => mockHash(contenuProforma(p));
const lienInvalide = () => new ApiError(404, "NOT_FOUND", "Lien invalide ou expiré.");
/** Propriétaire des documents partagés, pour les actions faites via un lien public. */
const proprietaire = () => MOCK_USERS.find((u) => u.id === "u-kofi")!;

function logPublic(action: ActionJournal, cible: JournalEntree["cible"], details: JournalEntree["details"], clientId: string | undefined, externe: string) {
  const o = proprietaire();
  getDb().journal.unshift({ id: nextId("j"), acteur: { id: o.id, nom: `${externe} (lien public)` }, action, cible, details, clientId, date: now() });
}

/* ---------- Projets (visibles de toute l'équipe en démo) ---------- */
function findProjet(id: string): Projet {
  const p = getDb().projets.find((x) => x.id === id);
  if (!p) throw notFound("Projet");
  return p;
}
const withCount = (p: Projet): Projet => ({ ...p, inscritsCount: getDb().inscriptions.filter((i) => i.projetId === p.id).length });

function buildPacks(inputs: PackInput[]): Pack[] {
  const catalogue = getDb().formations;
  return inputs.map((p) => {
    const formations = p.formations.map((f) => {
      const x = catalogue.find((c) => c.id === f.id);
      if (!x) throw new ApiError(422, "VALIDATION", "Une formation du pack est inconnue.");
      return x;
    });
    const auto = formations.reduce((s, x) => s + x.prixCentimes, 0);
    const prix = p.prixCentimes ?? auto;
    return { id: nextId("pk"), nom: p.nom, description: p.description, formations, prixCentimes: prix, prixAutoCentimes: auto, prixPersonnalise: prix !== auto, nbTranches: 3, tranchesCentimes: tranchesDe(prix) };
  });
}

export const projets = {
  list(q: { clientId?: string; page?: number; pageSize?: number }): ListResponse<Projet> {
    let items = getDb().projets;
    if (q.clientId) {
      items = items.filter((p) => p.clientId === q.clientId || getDb().inscriptions.some((i) => i.projetId === p.id && i.clientId === q.clientId));
    }
    return paginate([...items].sort((a, b) => b.creeLe.localeCompare(a.creeLe)).map(withCount), q.page, q.pageSize ?? 100);
  },
  get: (id: string) => withCount(findProjet(id)),
  create(input: { nom: string; description: string; packs: PackInput[] }): Projet {
    const p: Projet = {
      id: nextId("p"), nom: input.nom, description: input.description, packs: buildPacks(input.packs), statut: "brouillon",
      creeLe: now(), tokenConsultation: `mock-${nextId("tok")}`, inscritsCount: 0,
    };
    getDb().projets.push(p);
    return withCount(p);
  },
  update(id: string, patch: { nom?: string; description?: string; packs?: PackInput[] }): Projet {
    const p = findProjet(id);
    if (patch.nom !== undefined) p.nom = patch.nom;
    if (patch.description !== undefined) p.description = patch.description;
    if (patch.packs) p.packs = buildPacks(patch.packs);
    return withCount(p);
  },
  remove(id: string) {
    findProjet(id);
    const d = getDb();
    d.projets = d.projets.filter((p) => p.id !== id);
    d.inscriptions = d.inscriptions.filter((i) => i.projetId !== id);
    d.clients.forEach((c) => { if (c.projetId === id) c.projetId = undefined; });
  },
  partager(id: string): Projet {
    const p = findProjet(id);
    p.statut = "envoye";
    p.envoyeLe = now();
    return withCount(p);
  },
  inscrits(id: string): Inscrit[] {
    findProjet(id);
    return getDb().inscriptions
      .filter((i) => i.projetId === id)
      .map((i) => getDb().clients.find((c) => c.id === i.clientId))
      .filter((c): c is Client => Boolean(c))
      .map((c) => ({ id: c.id, nom: c.nom, prenom: c.prenom, email: c.email, telephone: c.telephone, statut: c.statut, inscritLe: c.creeLe }));
  },
};

/* ---------- Pro forma & factures ---------- */
function findProforma(id: string): FactureProforma {
  const p = getDb().proformas.find((x) => x.id === id && (!x.clientId || visibleClientIds().has(x.clientId)));
  if (!p) throw notFound("Pro forma");
  return p;
}
function assertNotConverted(p: FactureProforma) {
  if (p.factureCommercialeId)
    throw new ApiError(409, "PROFORMA_CONVERTIE", "Cette pro forma a déjà été convertie en facture commerciale et ne peut plus être modifiée.");
}
const ttc = (p: FactureProforma) => calcTotaux(p.lignes, p.tvaPourcent).ttc;
/** Vue avec l'empreinte recalculée sur le contenu courant (comme l'API). */
const vue = (p: FactureProforma): FactureProforma => (p.signature ? { ...p, signature: { ...p.signature, hash: hashProforma(p) } } : p);

function emettre(p: FactureProforma, emetteur: { id: string; nom: string }, externe?: string): FactureCommerciale {
  if (!p.clientId) throw new ApiError(409, "CLIENT_REQUIRED", "Associez un client à la pro forma avant de générer la facture.");
  const d = getDb();
  const t = calcTotaux(p.lignes, p.tvaPourcent);
  const fc: FactureCommerciale = {
    id: nextId("fc"), numero: `FC-2026-${String(d.factures.length + 1).padStart(4, "0")}`, proformaId: p.id, clientId: p.clientId,
    lignes: p.lignes, tvaPourcent: p.tvaPourcent, totalHtCentimes: t.ht, totalTtcCentimes: t.ttc, emiseLe: now(), emisePar: emetteur,
    tokenConsultation: `mock-${nextId("tok")}`,
    signature: { nom: emetteur.nom, le: now(), hash: mockHash(`${p.numero}|${t.ttc}`), valide: true },
    signatureClient: p.decisionClient ? { ...p.decisionClient } : undefined,
  };
  d.factures.push(fc);
  p.factureCommercialeId = fc.id;
  p.factureToken = fc.tokenConsultation;
  if (externe) logPublic("FACTURE_GENEREE", { type: "facture_commerciale", id: fc.id, libelle: fc.numero }, { apres: { numero: fc.numero } }, p.clientId, externe);
  else log("FACTURE_GENEREE", { type: "facture_commerciale", id: fc.id, libelle: fc.numero }, { apres: { numero: fc.numero } }, p.clientId);
  return fc;
}

export const proformas = {
  list(q: { clientId?: string; page?: number; pageSize?: number }): ListResponse<FactureProforma> {
    const ids = visibleClientIds();
    let items = getDb().proformas.filter((p) => !p.clientId || ids.has(p.clientId));
    if (q.clientId) items = items.filter((p) => p.clientId === q.clientId);
    return paginate([...items].sort((a, b) => b.numero.localeCompare(a.numero)).map(vue), q.page, q.pageSize ?? 100);
  },
  get: (id: string) => vue(findProforma(id)),
  create(input: { clientId?: string | undefined; projetIds: string[]; lignes: FactureProforma["lignes"]; tvaPourcent: number }): FactureProforma {
    if (input.clientId) findClient(input.clientId);
    const d = getDb();
    const n = d.proformas.length + 1;
    const p: FactureProforma = {
      id: nextId("pf"), numero: `PF-2026-${String(n).padStart(4, "0")}`, clientId: input.clientId, projetIds: input.projetIds ?? [],
      lignes: input.lignes, tvaPourcent: input.tvaPourcent, statut: "brouillon", tokenConsultation: `mock-${nextId("tok")}`, creeLe: now(), modifieLe: now(),
    };
    d.proformas.push(p);
    return vue(p);
  },
  update(id: string, patch: Partial<{ clientId: string | undefined; projetIds: string[]; lignes: FactureProforma["lignes"]; tvaPourcent: number }>): FactureProforma {
    const p = findProforma(id);
    assertNotConverted(p);
    const avant = { totalTtcCentimes: ttc(p), tvaPourcent: p.tvaPourcent, lignes: p.lignes };
    if (patch.clientId) findClient(patch.clientId);
    Object.assign(p, {
      lignes: patch.lignes ?? p.lignes, tvaPourcent: patch.tvaPourcent ?? p.tvaPourcent,
      projetIds: patch.projetIds ?? p.projetIds, clientId: patch.clientId ?? p.clientId, modifieLe: now(),
    });
    // Modifier un document signé annule la signature : retour en brouillon.
    if (p.signature) {
      p.signature = undefined;
      p.decisionClient = undefined;
      p.statut = "brouillon";
    }
    const apres = { totalTtcCentimes: ttc(p), tvaPourcent: p.tvaPourcent, lignes: p.lignes };
    log("PROFORMA_MODIFIEE", { type: "proforma", id, libelle: p.numero }, { avant, apres }, p.clientId);
    return vue(p);
  },
  remove(id: string) {
    const p = findProforma(id);
    assertNotConverted(p);
    const d = getDb();
    d.proformas = d.proformas.filter((x) => x.id !== id);
  },
  setStatut(id: string, statut: StatutProforma): FactureProforma {
    const p = findProforma(id);
    assertNotConverted(p);
    const avant = p.statut;
    p.statut = statut;
    p.modifieLe = now();
    if (statut === "brouillon") {
      p.signature = undefined;
      p.decisionClient = undefined;
    } else if (!p.signature) {
      p.signature = { par: refOf(me()), le: now(), hash: "" };
    }
    log("PROFORMA_MODIFIEE", { type: "proforma", id, libelle: p.numero }, { avant: { statut: avant }, apres: { statut } }, p.clientId);
    return vue(p);
  },
  genererFacture(id: string) {
    const p = findProforma(id);
    assertNotConverted(p);
    if (p.statut !== "acceptee")
      throw new ApiError(409, "PROFORMA_NON_ACCEPTEE", "Seule une pro forma acceptée peut être convertie en facture commerciale.");
    return emettre(p, refOf(me()));
  },
};

export const facturesCommerciales = {
  list(q: { clientId?: string; page?: number; pageSize?: number }) {
    const ids = visibleClientIds();
    let items = getDb().factures.filter((f) => ids.has(f.clientId));
    if (q.clientId) items = items.filter((f) => f.clientId === q.clientId);
    return paginate([...items].sort((a, b) => b.numero.localeCompare(a.numero)), q.page, q.pageSize ?? 100);
  },
  get(id: string) {
    const f = getDb().factures.find((x) => x.id === id && visibleClientIds().has(x.clientId));
    if (!f) throw notFound("Facture");
    return f;
  },
};

/* ---------- Liens publics (sans authentification) ---------- */
export const publicLinks = {
  projet(token: string): ProjetPublic {
    const p = getDb().projets.find((x) => x.tokenConsultation === token);
    if (!p) throw lienInvalide();
    return {
      nom: p.nom,
      description: p.description,
      packs: p.packs.map((k) => ({
        nom: k.nom, description: k.description, nbTranches: k.nbTranches, tranchesCentimes: k.tranchesCentimes,
        formations: k.formations.map((f) => ({ titre: f.titre, description: f.description, dureeHeures: f.dureeHeures })),
      })),
    };
  },
  inscrire(token: string, d: InscriptionInput) {
    const p = getDb().projets.find((x) => x.tokenConsultation === token);
    if (!p) throw lienInvalide();
    const db = getDb();
    const email = d.email.trim().toLowerCase();
    let client = db.clients.find((c) => c.email.toLowerCase() === email);
    if (!client) {
      client = {
        id: nextId("c"), prenom: d.prenom, nom: d.nom, adresse: d.adresse ?? "", email, telephone: d.telephone, statut: "prospect",
        projetId: p.id, ajoutePar: refOf(proprietaire()), creeLe: now(), modifieLe: now(),
      };
      db.clients.push(client);
    }
    if (!db.inscriptions.some((i) => i.projetId === p.id && i.clientId === client!.id)) {
      db.inscriptions.push({ projetId: p.id, clientId: client.id });
      logPublic("CLIENT_INSCRIT", { type: "projet", id: p.id, libelle: p.nom }, { apres: { projet: p.nom } }, client.id, `${d.prenom} ${d.nom}`);
    }
    return { ok: true as const };
  },
  proforma(token: string): ProformaPublic {
    const raw = getDb().proformas.find((x) => x.tokenConsultation === token);
    if (!raw) throw lienInvalide();
    const p = vue(raw);
    const client = p.clientId ? getDb().clients.find((c) => c.id === p.clientId) : undefined;
    const t = calcTotaux(p.lignes, p.tvaPourcent);
    return {
      numero: p.numero,
      emetteur: `${proprietaire().prenom} ${proprietaire().nom}`,
      client: client ? { nom: `${client.prenom} ${client.nom}` } : undefined,
      projets: getDb().projets.filter((x) => p.projetIds.includes(x.id)).map((x) => ({ nom: x.nom })),
      lignes: p.lignes, tvaPourcent: p.tvaPourcent, totalHtCentimes: t.ht, totalTtcCentimes: t.ttc, statut: p.statut,
      signature: p.signature ? { par: p.signature.par.nom, le: p.signature.le, hash: p.signature.hash } : undefined,
      hash: hashProforma(p),
      decision: p.decisionClient,
      peutDecider: p.statut === "envoyee" && !p.factureCommercialeId,
      clientAIdentifier: !p.clientId,
      factureToken: p.factureToken,
    };
  },
  decider(token: string, action: "valider" | "refuser", d: DecisionInput): { statut: "acceptee"; factureToken: string } | { statut: "refusee" } {
    const p = getDb().proformas.find((x) => x.tokenConsultation === token);
    if (!p) throw lienInvalide();
    if (p.statut !== "envoyee" || p.factureCommercialeId) throw new ApiError(409, "NOT_PENDING", "Cette pro forma n'est plus en attente de décision.");
    if (d.hash !== hashProforma(p)) throw new ApiError(409, "DOCUMENT_MODIFIE", "Le document a été modifié depuis que vous l'avez ouvert. Rechargez la page.");
    const signataire = d.prenom ? `${d.prenom} ${d.nom}` : d.nom.trim();
    const ref = { type: "proforma" as const, id: p.id, libelle: p.numero };
    if (action === "refuser") {
      p.statut = "refusee";
      p.decisionClient = { nom: signataire, le: now() };
      logPublic("PROFORMA_REFUSEE_CLIENT", ref, { avant: { statut: "envoyee" }, apres: { statut: "refusee", ...(d.motif ? { motif: d.motif } : {}) } }, p.clientId, signataire);
      return { statut: "refusee" };
    }
    if (!p.clientId) {
      const manque: Record<string, string> = {};
      if (!d.prenom?.trim()) manque["prenom"] = "Prénom requis";
      if (!d.email?.trim()) manque["email"] = "E-mail requis";
      if (!d.telephone?.trim()) manque["telephone"] = "Téléphone requis";
      if (Object.keys(manque).length) throw new ApiError(422, "VALIDATION", "Certains champs sont invalides.", manque);
      const db = getDb();
      const email = d.email!.trim().toLowerCase();
      let c = db.clients.find((x) => x.email.toLowerCase() === email);
      if (!c) {
        c = { id: nextId("c"), prenom: d.prenom!, nom: d.nom, adresse: d.adresse ?? "", email, telephone: d.telephone!, statut: "qualifie", ajoutePar: refOf(proprietaire()), creeLe: now(), modifieLe: now() };
        db.clients.push(c);
      }
      p.clientId = c.id;
    }
    p.statut = "acceptee";
    p.decisionClient = { nom: signataire, le: now() };
    logPublic("PROFORMA_VALIDEE_CLIENT", ref, { avant: { statut: "envoyee" }, apres: { statut: "acceptee" } }, p.clientId, signataire);
    const fc = emettre(p, refOf(proprietaire()), `${signataire} (validation client)`);
    return { statut: "acceptee", factureToken: fc.tokenConsultation };
  },
  facture(token: string): FacturePublic {
    const f = getDb().factures.find((x) => x.tokenConsultation === token);
    if (!f) throw lienInvalide();
    const c = getDb().clients.find((x) => x.id === f.clientId)!;
    const pf = getDb().proformas.find((x) => x.id === f.proformaId);
    return {
      numero: f.numero, proformaNumero: pf?.numero ?? "", emiseLe: f.emiseLe,
      client: { nom: `${c.prenom} ${c.nom}`, adresse: c.adresse, email: c.email, telephone: c.telephone },
      lignes: f.lignes, tvaPourcent: f.tvaPourcent, totalHtCentimes: f.totalHtCentimes, totalTtcCentimes: f.totalTtcCentimes,
      signature: f.signature, signatureClient: f.signatureClient,
    };
  },
};

/* ---------- Tâches ---------- */
function visibleTaches(): Tache[] {
  const u = me();
  return getDb().taches.filter((t) => u.role === "chef_equipe" || t.assigneAId === u.id);
}
function findTache(id: string) {
  const t = visibleTaches().find((x) => x.id === id);
  if (!t) throw notFound("Tâche");
  return t;
}
export const taches = {
  list(q: TachesQuery): ListResponse<Tache> {
    let items = visibleTaches();
    if (q.assigneAId) items = items.filter((t) => t.assigneAId === q.assigneAId);
    if (q.statut) items = items.filter((t) => t.statut === q.statut);
    return paginate(items, 1, 500);
  },
  create(input: Pick<Tache, "titre" | "description" | "assigneAId" | "echeance">): Tache {
    requireChef();
    const t: Tache = { ...input, id: nextId("t"), statut: "a_faire", assignePar: refOf(me()), creeLe: now() };
    getDb().taches.push(t);
    return t;
  },
  update(id: string, patch: Partial<Tache>): Tache {
    requireChef();
    return Object.assign(findTache(id), patch);
  },
  remove(id: string) {
    requireChef();
    findTache(id);
    const d = getDb();
    d.taches = d.taches.filter((t) => t.id !== id);
  },
  setStatut(id: string, statut: StatutTache): Tache {
    const t = findTache(id);
    t.statut = statut;
    return t;
  },
  avancement(): AvancementAgent[] {
    requireChef();
    const u = me();
    return MOCK_USERS.filter((a) => a.role === "agent" && a.equipeId === u.equipeId).map((a) => {
      const ts = getDb().taches.filter((t) => t.assigneAId === a.id);
      return {
        agent: refOf(a), total: ts.length,
        aFaire: ts.filter((t) => t.statut === "a_faire").length,
        enCours: ts.filter((t) => t.statut === "en_cours").length,
        terminees: ts.filter((t) => t.statut === "terminee").length,
        tachesEnCours: ts.filter((t) => t.statut === "en_cours"),
      };
    });
  },
};

/* ---------- Journal ---------- */
export const journal = {
  list(q: JournalQuery): ListResponse<JournalEntree> {
    if (!isChef()) {
      if (!q.clientId) throw new ApiError(403, "FORBIDDEN", "Le journal est réservé au chef d'équipe.");
      findClient(q.clientId);
    }
    let items = getDb().journal;
    if (q.clientId) items = items.filter((e) => e.clientId === q.clientId);
    if (q.action) items = items.filter((e) => e.action === q.action);
    if (q.acteurId) items = items.filter((e) => e.acteur.id === q.acteurId);
    if (q.du) items = items.filter((e) => e.date.slice(0, 10) >= q.du!);
    if (q.au) items = items.filter((e) => e.date.slice(0, 10) <= q.au!);
    return paginate(items, q.page, q.pageSize ?? 10);
  },
};

export const equipe = {
  list: () => MOCK_USERS.filter((u) => u.equipeId === me().equipeId),
};
