// Prerequis : npm i playwright (hors depot) ; Chrome installe. Voir le README, section Tests.
// Parcours de démonstration enregistré en vidéo (front + API + Keycloak réels).
// Prérequis : base métier peuplée par backend/scripts/seed_demo.py, front sur :8082 (VITE_USE_MOCK=false).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:8082";
const API = "http://127.0.0.1:3000/api";
const OUT = process.env.OUT ?? "video";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
  locale: "fr-FR",
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(60000);

// Sous-titres + pointeur visibles dans la vidéo (persistants d'une page à l'autre via window.name).
await page.addInitScript(() => {
  const mk = () => {
    if (document.getElementById("__cap")) return;
    const d = document.createElement("div");
    d.id = "__cap";
    d.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:82%;background:rgba(11,37,69,.94);color:#fff;padding:10px 20px;border-radius:10px;font:600 18px system-ui,sans-serif;z-index:2147483647;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.35);pointer-events:none";
    document.documentElement.appendChild(d);
    const set = (t) => { d.textContent = t; d.style.display = t ? "block" : "none"; };
    window.__setCap = set;
    set(window.name.startsWith("CAP:") ? window.name.slice(4) : "");
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;width:16px;height:16px;border-radius:50%;background:rgba(230,50,50,.85);border:2px solid #fff;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:left .12s,top .12s";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mk); else mk();
});

const log = [];
const cap = async (text, ms = 2200) => {
  await page.evaluate((t) => { window.name = t ? "CAP:" + t : ""; window.__setCap && window.__setCap(t); }, text).catch(() => {});
  await page.waitForTimeout(ms);
};
const pause = (ms = 900) => page.waitForTimeout(ms);
const type = async (loc, text) => { await loc.click(); await loc.fill(""); await loc.pressSequentially(text, { delay: 35 }); };
const step = async (name, fn) => {
  try { await fn(); log.push(["ok", name]); console.log("  ok  ", name); }
  catch (e) {
    log.push(["FAIL", name]);
    console.log("  FAIL", name, "-", e.message.split("\n").slice(0, 3).join(" | ").slice(0, 260));
    await page.screenshot({ path: `${OUT}/echec-${log.length}.png` }).catch(() => {});
  }
};
const lien = () => page.getByRole("textbox", { name: /Lien de consultation/ }).inputValue();

async function kcLogin(user, label) {
  await page.waitForURL(/localhost:8080\/realms\/crm/);
  await cap(label, 1800);
  await type(page.getByLabel(/Username or email|Nom d.utilisateur/i), user);
  await type(page.locator("#password"), user);
  await page.locator("#kc-login").click();
}
async function apiToken(u) {
  const r = await fetch("http://localhost:8080/realms/crm/protocol/openid-connect/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", client_id: "crm-frontend", username: u, password: u }),
  });
  return (await r.json()).access_token;
}
/** Retour dans l'espace interne après une visite de page publique (la session Keycloak est conservée). */
async function retourEspaceInterne(chemin, attente) {
  await cap("", 0);
  await page.goto(`${BASE}${chemin}`);
  await attente();
}

let urlProjet = "";
let urlPro = "";

/* ===================== AGENT ===================== */
await step("connexion agent (Keycloak)", async () => {
  await cap("", 0);
  await page.goto(`${BASE}/clients`);
  await cap("ByteSec CRM · démonstration du MVP", 2500);
  await kcLogin("agent", "Connexion sécurisée via Keycloak · compte « agent »");
  await page.getByRole("heading", { name: "Clients" }).waitFor();
  await page.getByText("Awa Diallo").first().waitFor();
});

await step("liste et filtres clients", async () => {
  await cap("L'agent ne voit que SES clients · pas de menu « Journal »", 2800);
  await page.getByRole("button", { name: "Qualifié", exact: true }).click();
  await cap("Filtre par statut (synchronisé dans l'URL)", 2200);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await page.getByRole("button", { name: "Semaine précédente" }).click();
  await cap("Filtre par semaine de création : rien la semaine dernière", 2200);
  await page.getByRole("button", { name: "Cette semaine" }).click();
  await pause(1200);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
  await type(page.getByLabel("Rechercher un client"), "sow");
  await page.keyboard.press("Enter");
  await cap("Recherche texte : « sow »", 2000);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
});

await step("création client avec validation", async () => {
  await cap("Création d'un client : les champs sont validés", 1800);
  await page.getByRole("button", { name: "Nouveau client" }).first().click();
  await pause(600);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await cap("Champs obligatoires signalés", 2200);
  await type(page.getByLabel("Nom", { exact: true }), "Gueye");
  await type(page.getByLabel("Prénom"), "Aminata");
  await type(page.getByLabel("E-mail"), "pas-un-email");
  await type(page.getByLabel("Téléphone"), "+221 77 555 00 11");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await cap("E-mail invalide refusé", 2000);
  await type(page.getByLabel("E-mail"), "aminata.gueye@ecobank-demo.sn");
  await type(page.getByLabel("Adresse"), "Almadies, Dakar");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Client créé").waitFor();
  await cap("Client créé", 1800);
});

await step("détail client, statut, historique", async () => {
  await page.getByRole("link", { name: "Aminata Gueye" }).click();
  await page.getByRole("heading", { name: "Aminata Gueye" }).waitFor();
  await cap("Fiche client · changement de statut avec confirmation", 2000);
  await page.getByRole("combobox", { name: "Changer le statut" }).click();
  await page.getByRole("option", { name: "Qualifié" }).click();
  await cap("Prospect → Qualifié : le changement sera tracé", 2000);
  await page.getByRole("button", { name: "Confirmer" }).click();
  await page.getByText(/Statut mis à jour/).waitFor();
  await page.getByRole("tab", { name: "Historique" }).click();
  await cap("Historique : qui, quoi, quand, avec le diff avant → après", 3200);
});

/* ---------- Projet : plus de champ client, un lien de consultation ---------- */
await step("projet: packs, prix automatique, tranches", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await cap("Projets : plus de champ « client » · chaque projet a un lien à partager", 2800);
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await type(page.getByLabel("Nom du projet"), "Cyber-sensibilisation Ecobank");
  await type(page.getByLabel("Description").first(), "Programme pour 80 collaborateurs");
  await cap("Un projet peut n'avoir aucun pack, ou en avoir plusieurs", 2400);
  await page.getByRole("button", { name: /Ajouter un pack/ }).click();
  await type(page.getByLabel("Nom du pack"), "Pack Découverte");
  await page.locator("label", { hasText: "Sensibilisation au phishing" }).first().click();
  await page.locator("label", { hasText: "Hygiène numérique" }).first().click();
  await cap("Le prix du pack se calcule automatiquement : somme des formations", 3000);
  const prix = page.getByLabel("Prix du pack (FCFA)");
  await type(prix, "500000");
  await cap("… et reste modifiable · le paiement est découpé en 3 tranches", 3200);
  await page.getByRole("button", { name: /Rétablir le prix calculé/ }).click();
  await cap("« Rétablir » ramène le prix calculé", 2000);
  await type(prix, "520000");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByRole("heading", { name: "Cyber-sensibilisation Ecobank" }).waitFor();
  await cap("Projet créé · son lien de consultation est prêt", 2400);
});

await step("copier le lien du projet", async () => {
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Lien copié dans le presse-papiers").waitFor();
  urlProjet = await lien();
  await cap("L'agent copie le lien et l'envoie par WhatsApp, e-mail, SMS…", 3000);
});

/* ---------- Le prospect, sans compte, ouvre le lien ---------- */
await step("visiteur: page publique du projet + inscription", async () => {
  await cap("", 0);
  await page.goto(urlProjet);
  await page.getByRole("heading", { name: "Cyber-sensibilisation Ecobank" }).waitFor();
  await cap("CÔTÉ PROSPECT · page publique : aucun compte requis, lecture seule", 3200);
  await page.getByText(/Paiement en 3 tranches/).first().scrollIntoViewIfNeeded();
  await cap("Le prix n'apparaît qu'en 3 tranches, jamais en total", 3200);
  await page.getByRole("button", { name: "S'inscrire maintenant" }).click();
  await pause(600);
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click();
  await cap("Formulaire validé", 1800);
  await type(page.getByLabel("Prénom"), "Awa");
  await type(page.getByLabel("Nom", { exact: true }), "Camara");
  await type(page.getByLabel("E-mail"), "awa.camara@exemple.org");
  await type(page.getByLabel("Téléphone"), "+221 77 000 11 22");
  await page.getByRole("button", { name: "Confirmer mon inscription" }).click();
  await page.getByText("Inscription enregistrée").waitFor();
  await cap("Inscription en un clic : la personne est ajoutée à la base clients", 3200);
});

await step("agent: l'inscrit apparaît (projet + base clients)", async () => {
  await retourEspaceInterne("/projets", async () => {
    await page.getByRole("heading", { name: "Projets" }).waitFor();
  });
  await page.getByRole("link", { name: "Cyber-sensibilisation Ecobank" }).click();
  await page.getByRole("link", { name: "Awa Camara" }).waitFor();
  await cap("CÔTÉ AGENT · l'inscrit apparaît sur le projet", 2800);
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: "Awa Camara" }).waitFor();
  await cap("… et dans la base clients (prospect, rattaché à l'agent)", 3000);
});

/* ---------- Pro forma : plusieurs projets, signature, lien ---------- */
await step("pro forma sans client, sur plusieurs projets", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await cap("Pro forma : peut couvrir plusieurs projets, avec ou sans client", 2800);
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.locator("label", { hasText: "Cyber-sensibilisation Ecobank" }).first().click();
  await page.locator("label", { hasText: "Programme de sensibilisation Delta" }).first().click();
  await cap("Deux projets sélectionnés, aucun client choisi", 2400);
  await page.getByRole("button", { name: /Pré-remplir les lignes/ }).click();
  await cap("Les lignes sont reprises depuis les packs des projets", 2600);
  await type(page.getByLabel("TVA (%)"), "150");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await cap("TVA hors limites refusée", 2000);
  await type(page.getByLabel("TVA (%)"), "18");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await cap("Pro forma créée (numéro PF-… automatique)", 2200);
});

await step("copier le lien = envoi + signature électronique", async () => {
  await cap("Copier le lien envoie la pro forma ET la signe électroniquement", 2800);
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Signature de l'émetteur").waitFor();
  urlPro = await lien();
  await cap("Cachet : nom du signataire, date et empreinte SHA-256 du contenu", 3600);
});

/* ---------- Le client valide sans compte ---------- */
await step("client: consulte et valide la pro forma", async () => {
  await cap("", 0);
  await page.goto(urlPro);
  await page.getByRole("heading", { name: /Pro forma PF-/ }).waitFor();
  await cap("CÔTÉ CLIENT · la pro forma signée, en lecture seule", 3000);
  await page.getByText("Votre décision").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await cap("Deux boutons : « Valider » et « Refuser » · identité exigée", 2800);
  await type(page.getByLabel("Prénom"), "Ibrahima");
  await type(page.getByLabel("Nom", { exact: true }), "Sy");
  await type(page.getByLabel("E-mail"), "ibra.sy@exemple.org");
  await type(page.getByLabel("Téléphone"), "+221 76 111 22 33");
  await page.getByRole("button", { name: "Valider", exact: true }).click();
  await cap("Confirmation : la facture sera générée automatiquement", 2800);
  await page.getByRole("button", { name: "Oui, valider" }).click();
  await page.getByText("Pro forma validée, merci !").waitFor();
  await cap("Validée ! La facture commerciale est générée sans intervention", 3000);
});

await step("client: facture commerciale signée", async () => {
  await page.getByRole("link", { name: "Consulter ma facture" }).click();
  await page.getByRole("heading", { name: /Facture FC-/ }).waitFor();
  await page.getByText("Document non modifiable").waitFor();
  await cap("Facture commerciale : lecture seule, avec lien de consultation", 2800);
  await page.getByText("Signature de l'émetteur").scrollIntoViewIfNeeded();
  await cap("Double signature : l'émetteur ET le client, empreinte vérifiée ✓", 3800);
  await page.emulateMedia({ media: "print" });
  await cap("Aperçu à l'impression / PDF", 3000);
  await page.emulateMedia({ media: null });
});

await step("agent: la pro forma est verrouillée, le client ajouté", async () => {
  await retourEspaceInterne("/factures", async () => {
    await page.getByRole("heading", { name: "Factures" }).waitFor();
  });
  await page.locator("tr", { hasText: "facturée" }).getByRole("link").first().click();
  await page.getByText(/Verrouillée/).waitFor();
  await cap("CÔTÉ AGENT · pro forma facturée : verrouillée, décision du client visible", 3400);
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: "Ibrahima Sy" }).waitFor();
  await cap("Le signataire a été ajouté à la base clients (qualifié)", 3000);
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("tab", { name: "Commerciales" }).click();
  await page.getByRole("link", { name: /FC-/ }).first().click();
  await page.getByText("Signature valide").waitFor();
  await cap("Facture côté agent : lien copiable à envoyer par n'importe quel canal", 3200);
});

await step("client: refuse une pro forma avec motif", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Awa Camara" }).click();
  await type(page.getByLabel("Désignation ligne 1"), "Atelier simulation de crise");
  await type(page.getByLabel(/Prix unitaire ligne 1/), "150000");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Signature de l'émetteur").waitFor();
  const url = await lien();
  await cap("", 0);
  await page.goto(url);
  await page.getByRole("heading", { name: /Pro forma PF-/ }).waitFor();
  await cap("Pro forma d'un client connu : il signe simplement de son nom", 2800);
  await type(page.getByLabel(/Votre nom complet/), "Awa Camara");
  await page.getByRole("button", { name: "Refuser" }).click();
  await type(page.getByLabel(/Motif/), "Budget insuffisant cette année");
  await cap("Refus avec motif facultatif", 2400);
  await page.getByRole("button", { name: "Oui, refuser" }).click();
  await page.getByText("Votre refus a bien été transmis").waitFor();
  await cap("Refus transmis : aucune facture n'est générée", 2800);
});

await step("liens invalides", async () => {
  await cap("", 0);
  await page.goto(`${BASE}/p/${"0".repeat(36)}`);
  await page.getByText("Lien introuvable").waitFor();
  await cap("Lien inconnu ou mal formé : message clair, aucune information divulguée", 3000);
});

/* ---------- Limites de l'agent ---------- */
await step("limites de l'agent", async () => {
  await retourEspaceInterne("/journal", async () => {
    await page.getByText(/réservé au chef/).first().waitFor();
  });
  await cap("Journal global : accès refusé à l'agent", 2600);
  const chefTok = await apiToken("chef");
  const r = await (await fetch(`${API}/clients?q=kabor`, { headers: { Authorization: `Bearer ${chefTok}` } })).json();
  await cap("", 0);
  await page.goto(`${BASE}/clients/${r.data[0].id}`);
  await page.getByText(/introuvable/i).first().waitFor();
  await cap("Client d'un autre utilisateur : introuvable pour l'agent", 3000);
});

await step("tâches de l'agent (kanban)", async () => {
  await page.getByRole("link", { name: "Tâches" }).first().click();
  await page.getByRole("heading", { name: "Tâches de prospection" }).waitFor();
  await cap("Tâches de l'agent · badge « En retard » sur l'échéance dépassée", 3000);
  const card = page.locator("article", { hasText: "Relancer les prospects" });
  await card.dragTo(page.getByRole("region", { name: "En cours" }));
  await cap("Glisser-déposer : la tâche passe « En cours »", 2600);
});

/* ===================== CHEF ===================== */
await step("connexion chef d'équipe", async () => {
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await kcLogin("chef", "Déconnexion puis connexion en tant que chef d'équipe");
  await page.getByRole("heading", { name: "Clients" }).waitFor();
  await page.getByText("Moussa Traore").first().waitFor();
  await cap("Le chef voit les clients de toute l'équipe + le menu « Journal »", 3200);
});

await step("avancement d'équipe et assignation", async () => {
  await page.getByRole("link", { name: "Tâches" }).first().click();
  await page.getByText("Avancement de l'équipe").first().waitFor();
  await cap("Chef : avancement de l'équipe, par agent", 3200);
  await cap("Le chef assigne une tâche de prospection à un agent", 1600);
  await page.getByRole("button", { name: /Assigner une tâche/ }).click();
  await type(page.getByLabel("Titre"), "Relancer 5 clients confirmés");
  await page.getByRole("combobox", { name: "Agent" }).click();
  await page.getByRole("option", { name: /Diallo/ }).click();
  await page.getByLabel("Échéance").fill("2026-12-05");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Tâche assignée").waitFor();
  await cap("Tâche assignée à l'agent", 2200);
});

await step("journal: actions internes ET événements publics", async () => {
  await page.getByRole("link", { name: "Journal" }).first().click();
  await page.getByText("Journal de traçabilité").waitFor();
  await cap("Journal : qui, quoi, quand — y compris les actions des clients via les liens", 3600);
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: /Pro forma validée par le client/ }).click();
  await cap("Validation d'une pro forma par le client, tracée avec sa signature", 3200);
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: /Inscription via un lien/ }).click();
  await cap("Inscription d'un prospect via le lien du projet", 3000);
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: /Pro forma refusée par le client/ }).click();
  await cap("Refus d'une pro forma, avec le motif saisi", 3200);
});

await cap("Fin de la démonstration · ByteSec CRM MVP", 3500);
const video = page.video();
await ctx.close();
console.log("video:", await video.path());
const fails = log.filter((l) => l[0] === "FAIL");
console.log(`\n${log.length - fails.length}/${log.length} étapes réussies`);
await browser.close();
