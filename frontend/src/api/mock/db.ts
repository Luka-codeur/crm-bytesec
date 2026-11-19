import type {
  Client, FactureCommerciale, FactureProforma, Formation, JournalEntree, Pack, Projet,
  RefUtilisateur, StatutClient, StatutProforma, StatutTache, Tache, Utilisateur,
} from "@/types";

export const MOCK_USERS: Utilisateur[] = [
  { id: "u-chef", prenom: "Aminata", nom: "Diallo", email: "aminata.diallo@bytesec.africa", role: "chef_equipe", equipeId: "eq-1" },
  { id: "u-kofi", prenom: "Kofi", nom: "Mensah", email: "kofi.mensah@bytesec.africa", role: "agent", equipeId: "eq-1" },
  { id: "u-fatou", prenom: "Fatou", nom: "Ndiaye", email: "fatou.ndiaye@bytesec.africa", role: "agent", equipeId: "eq-1" },
  { id: "u-jb", prenom: "Jean-Baptiste", nom: "Kaboré", email: "jb.kabore@bytesec.africa", role: "agent", equipeId: "eq-1" },
];
export const refOf = (u: Utilisateur): RefUtilisateur => ({ id: u.id, nom: `${u.prenom} ${u.nom}` });
const U = (id: string) => refOf(MOCK_USERS.find((u) => u.id === id)!);

let currentUser: Utilisateur | null = null;
export const setMockUser = (u: Utilisateur | null) => { currentUser = u; };
export const getMockUser = () => currentUser;

export interface MockDb {
  clients: Client[];
  formations: Formation[];
  projets: Projet[];
  inscriptions: { projetId: string; clientId: string }[];
  proformas: FactureProforma[];
  factures: FactureCommerciale[];
  taches: Tache[];
  journal: JournalEntree[];
  seq: number;
}

let db: MockDb | null = null;
export function getDb(): MockDb {
  if (!db) db = seed();
  return db;
}
export const nextId = (prefix: string) => `${prefix}-${++getDb().seq}`;

function daysAgo(n: number, h = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 15, 0, 0);
  return d.toISOString();
}

function seed(): MockDb {
  const people: [string, string, string, string][] = [
    ["Moussa", "Traoré", "Rue 312, Hamdallaye ACI, Bamako", "+223 76 12 45 89"],
    ["Awa", "Koné", "Cocody Riviera 3, Abidjan", "+225 07 58 21 33 10"],
    ["Cheikh", "Sow", "Sicap Liberté 6, Dakar", "+221 77 645 12 90"],
    ["Mariam", "Ouédraogo", "Secteur 15, Ouaga 2000, Ouagadougou", "+226 70 22 81 46"],
    ["Kwame", "Asante", "Osu, Oxford Street, Accra", "+233 24 555 0192"],
    ["Nadia", "Benali", "Boulevard Anfa, Casablanca", "+212 6 61 23 45 67"],
    ["Ibrahima", "Camara", "Kaloum, Conakry", "+224 622 11 47 85"],
    ["Chantal", "Mbarga", "Bastos, Yaoundé", "+237 6 77 88 12 03"],
    ["Olivier", "Dubois", "12 rue de la République, Lyon", "+33 6 12 34 56 78"],
    ["Aïssatou", "Bah", "Point E, Dakar", "+221 78 301 44 12"],
    ["Emmanuel", "Kouassi", "Plateau, Abidjan", "+225 05 44 90 12 77"],
    ["Salimata", "Sanogo", "Badalabougou, Bamako", "+223 66 90 32 17"],
    ["Yves", "Nkurunziza", "Rohero, Bujumbura", "+257 79 12 34 56"],
    ["Rokia", "Cissé", "Plateau, Niamey", "+227 96 45 12 33"],
    ["Thierry", "Agbodjan", "Bè Kpota, Lomé", "+228 90 11 22 33"],
  ];
  const auteurs = ["u-kofi", "u-fatou", "u-jb", "u-kofi", "u-chef"];
  const statuts: StatutClient[] = ["prospect", "qualifie", "confirme"];
  const clients: Client[] = people.map(([prenom, nom, adresse, telephone], i) => {
    const d = daysAgo(i * 2 + 1, 9 + (i % 7));
    return {
      id: `c-${i + 1}`, prenom, nom, adresse, telephone,
      email: `${prenom}.${nom}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z.]/g, "") + "@exemple.africa",
      statut: statuts[i % 3]!, ajoutePar: U(auteurs[i % 5]!), creeLe: d, modifieLe: d,
    };
  });

  const f = (id: number, titre: string, description: string, dureeHeures: number, prix: number): Formation =>
    ({ id: `f-${id}`, titre, description, dureeHeures, prixCentimes: prix * 100 });
  const formations: Formation[] = [
    f(1, "Sensibilisation au phishing", "Reconnaître et signaler les e-mails frauduleux.", 4, 150000),
    f(2, "Sécurité des postes de travail", "Durcissement Windows/macOS et bonnes pratiques.", 7, 250000),
    f(3, "Gestion des mots de passe", "Coffres-forts, MFA et politiques de mots de passe.", 3, 100000),
    f(4, "Protection des données personnelles", "Conformité et traitement des données sensibles.", 7, 300000),
    f(5, "Tests d'intrusion – initiation", "Méthodologie et outils de pentest.", 21, 950000),
    f(6, "Sécurité du cloud", "IAM, chiffrement et surveillance sur le cloud.", 14, 700000),
    f(7, "Réponse aux incidents", "Organiser une cellule de crise cyber.", 14, 650000),
    f(8, "Hygiène numérique pour dirigeants", "Les fondamentaux pour la direction générale.", 3, 200000),
  ];
  const pack = (id: string, nom: string, description: string, ids: number[]): Pack => {
    const fs = ids.map((i) => formations[i - 1]!);
    const prix = fs.reduce((s, x) => s + x.prixCentimes, 0);
    const base = Math.floor(prix / 100 / 3) * 100;
    return {
      id, nom, description, formations: fs, prixCentimes: prix, prixAutoCentimes: prix, prixPersonnalise: false, nbTranches: 3,
      tranchesCentimes: [base, base, prix - base * 2],
    };
  };
  const projets: Projet[] = [
    { id: "p-1", tokenConsultation: "mock-p-1", inscritsCount: 0, nom: "Programme de sensibilisation 2027", description: "Sensibilisation de 120 collaborateurs.", clientId: "c-2", packs: [pack("pk-1", "Essentiels", "Socle de sensibilisation", [1, 3]), pack("pk-2", "Direction", "Pour le comité de direction", [8])], statut: "envoye", envoyeLe: daysAgo(3), creeLe: daysAgo(6) },
    { id: "p-2", tokenConsultation: "mock-p-2", inscritsCount: 0, nom: "Montée en compétences SOC", description: "Formation de l'équipe sécurité interne.", clientId: "c-3", packs: [pack("pk-3", "Offensif", "", [5]), pack("pk-4", "Défensif", "", [7, 6])], statut: "envoye", envoyeLe: daysAgo(10), creeLe: daysAgo(14) },
    { id: "p-3", tokenConsultation: "mock-p-3", inscritsCount: 0, nom: "Conformité données clients", description: "Mise en conformité du service client.", clientId: "c-5", packs: [pack("pk-5", "Conformité", "", [4, 3])], statut: "brouillon", creeLe: daysAgo(2) },
    { id: "p-4", tokenConsultation: "mock-p-4", inscritsCount: 0, nom: "Migration cloud sécurisée", description: "Accompagnement migration vers le cloud.", clientId: "c-6", packs: [pack("pk-6", "Cloud", "", [6, 2])], statut: "brouillon", creeLe: daysAgo(4) },
    { id: "p-5", tokenConsultation: "mock-p-5", inscritsCount: 0, nom: "Parcours cyber agence Lyon", description: "Parcours complet pour l'agence.", clientId: "c-9", packs: [pack("pk-7", "Découverte", "", [1, 2, 3])], statut: "envoye", envoyeLe: daysAgo(1), creeLe: daysAgo(8) },
  ];
  for (const p of projets) {
    const c = clients.find((x) => x.id === p.clientId!)!;
    if (!c.projetId) c.projetId = p.id;
  }

  const L = (designation: string, quantite: number, prix: number) => ({ designation, quantite, prixUnitaireCentimes: prix * 100 });
  const pf = (n: number, clientId: string, statut: StatutProforma, lignes: ReturnType<typeof L>[], jours: number, projetId?: string): FactureProforma => ({
    id: `pf-${n}`, numero: `PF-2026-${String(n).padStart(4, "0")}`, clientId, projetIds: projetId ? [projetId] : [], lignes, tvaPourcent: 18, statut,
    tokenConsultation: `mock-pf-${n}`, creeLe: daysAgo(jours), modifieLe: daysAgo(Math.max(0, jours - 1)),
    // Les pro forma envoyées ou acceptées portent déjà le cachet de l'émetteur.
    signature: statut === "brouillon" ? undefined : { par: U("u-chef"), le: daysAgo(jours), hash: "" },
  });
  const proformas: FactureProforma[] = [
    pf(1, "c-3", "acceptee", [L("Tests d'intrusion – initiation", 4, 950000), L("Réponse aux incidents", 4, 650000)], 12, "p-2"),
    pf(2, "c-6", "acceptee", [L("Sécurité du cloud", 3, 700000), L("Sécurité des postes de travail", 3, 250000)], 5, "p-4"),
    pf(3, "c-2", "envoyee", [L("Sensibilisation au phishing", 6, 150000), L("Gestion des mots de passe", 6, 100000)], 4, "p-1"),
    pf(4, "c-9", "brouillon", [L("Parcours Découverte", 1, 500000)], 2, "p-5"),
    pf(5, "c-5", "refusee", [L("Protection des données personnelles", 2, 300000)], 9, "p-3"),
    pf(6, "c-1", "brouillon", [L("Audit de sensibilisation", 1, 400000), L("Atelier dirigeants", 2, 200000)], 1),
  ];
  const ht = (p: FactureProforma) => p.lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireCentimes, 0);
  const p1 = proformas[0]!;
  const factures: FactureCommerciale[] = [{
    id: "fc-1", numero: "FC-2026-0001", proformaId: p1.id, clientId: p1.clientId!, lignes: p1.lignes, tvaPourcent: 18,
    totalHtCentimes: ht(p1), totalTtcCentimes: Math.round(ht(p1) * 1.18), emiseLe: daysAgo(8), emisePar: U("u-chef"),
    tokenConsultation: "mock-fc-1", signature: { nom: "Aminata Diallo", le: daysAgo(8), hash: "0".repeat(64), valide: true },
  }];
  p1.factureToken = "mock-fc-1";
  p1.factureCommercialeId = "fc-1";

  const t = (n: number, titre: string, agent: string, statut: StatutTache, echeanceJours?: number): Tache => ({
    id: `t-${n}`, titre, description: "", assigneAId: agent, assignePar: U("u-chef"), statut,
    echeance: echeanceJours === undefined ? undefined : daysAgo(-echeanceJours, 18), creeLe: daysAgo(10 - (n % 5)),
  });
  const taches: Tache[] = [
    t(1, "Relancer Moussa Traoré", "u-kofi", "a_faire", 2),
    t(2, "Préparer la démo phishing", "u-kofi", "en_cours", -1),
    t(3, "Qualifier le besoin de Kwame Asante", "u-kofi", "en_cours", 4),
    t(4, "Envoyer la proposition à Olivier Dubois", "u-kofi", "terminee", -3),
    t(5, "Mettre à jour les coordonnées clients", "u-kofi", "a_faire"),
    t(6, "Rendez-vous avec Awa Koné", "u-fatou", "terminee", -2),
    t(7, "Rédiger la pro forma Ibrahima Camara", "u-fatou", "en_cours", 1),
    t(8, "Appeler Yves Nkurunziza", "u-fatou", "a_faire", -2),
    t(9, "Planifier la session cloud", "u-fatou", "a_faire", 7),
    t(10, "Visite client à Ouagadougou", "u-jb", "en_cours", 3),
    t(11, "Compte rendu réunion Cheikh Sow", "u-jb", "terminee", -5),
    t(12, "Prospection salon Cyber Africa", "u-jb", "a_faire", 10),
  ];
  taches.forEach((x) => (x.description = `Tâche assignée par Aminata Diallo : ${x.titre.toLowerCase()}.`));

  const journal: JournalEntree[] = [];
  const nomClient = (id: string) => { const c = clients.find((x) => x.id === id)!; return `${c.prenom} ${c.nom}`; };
  const transitions: [StatutClient, StatutClient][] = [["prospect", "qualifie"], ["qualifie", "confirme"]];
  for (let i = 0; i < 20; i++) {
    const clientId = `c-${(i % 15) + 1}`;
    const acteur = U(auteurs[i % 5]!);
    const date = daysAgo(Math.floor(i * 1.3), 8 + (i % 9));
    const kind = i % 4;
    if (kind === 3 && i < 4) {
      journal.push({ id: `j-${i + 1}`, acteur: U("u-chef"), action: "FACTURE_GENEREE", cible: { type: "facture_commerciale", id: "fc-1", libelle: "FC-2026-0001" }, details: { apres: { numero: "FC-2026-0001" } }, clientId: "c-3", date });
    } else if (kind === 1 || kind === 3) {
      const p = proformas[i % 6]!;
      const tot = Math.round(ht(p) * 1.18);
      journal.push({ id: `j-${i + 1}`, acteur, action: "PROFORMA_MODIFIEE", cible: { type: "proforma", id: p.id, libelle: p.numero }, details: { avant: { totalTtcCentimes: tot - 5000000 }, apres: { totalTtcCentimes: tot } }, clientId: p.clientId, date });
    } else {
      const [avant, apres] = transitions[i % 2]!;
      journal.push({ id: `j-${i + 1}`, acteur, action: "STATUT_CLIENT_MODIFIE", cible: { type: "client", id: clientId, libelle: nomClient(clientId) }, details: { avant: { statut: avant }, apres: { statut: apres } }, clientId, date });
    }
  }
  journal.sort((a, b) => b.date.localeCompare(a.date));

  const inscriptions = projets.filter((p) => p.clientId).map((p) => ({ projetId: p.id, clientId: p.clientId! }));

  return { clients, formations, projets, inscriptions, proformas, factures, taches, journal, seq: 100 };
}
