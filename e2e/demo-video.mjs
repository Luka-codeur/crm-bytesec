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
page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);

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
    console.log("  FAIL", name, "-", e.message.split("\n")[0].slice(0, 200));
    await page.screenshot({ path: `${OUT}/echec-${log.length}.png` }).catch(() => {});
  }
};
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

/* ===================== AGENT ===================== */
await step("connexion agent (Keycloak)", async () => {
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

await step("projet avec pack et formations, envoi", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await cap("Projets : un projet a des packs, un pack a des formations", 2200);
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await type(page.getByLabel("Nom du projet"), "Cyber-sensibilisation Ecobank");
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Aminata Gueye" }).click();
  await cap("Un projet contient un ou plusieurs packs", 1800);
  await type(page.getByLabel("Nom du pack"), "Pack Découverte");
  await type(page.getByLabel("Prix (FCFA)").first(), "400000");
  await page.locator("label", { hasText: "Sensibilisation au phishing" }).first().click();
  await page.locator("label", { hasText: "Hygiène numérique" }).first().click();
  await cap("Formations du catalogue cochées dans le pack", 2000);
  await type(page.getByLabel("Titre de la formation"), "Atelier simulation de crise");
  await type(page.getByLabel("Durée en heures"), "2");
  await type(page.getByLabel("Prix en FCFA"), "150000");
  await page.getByRole("button", { name: "Ajouter au catalogue" }).click();
  await cap("Nouvelle formation ajoutée au catalogue à la volée", 2000);
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByRole("heading", { name: "Cyber-sensibilisation Ecobank" }).waitFor();
  await cap("Projet créé · prêt à être envoyé au client", 2200);
  await page.getByRole("button", { name: /Envoyer au client/ }).click();
  await pause(800);
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await page.getByText("Projet envoyé au client").waitFor();
  await cap("Projet envoyé au client", 2000);
});

await step("pro forma: validation, calcul, statuts", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await cap("Factures : pro forma modifiables, commerciales verrouillées", 2400);
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Aminata Gueye" }).click();
  await type(page.getByLabel("Désignation ligne 1"), "Pack Découverte");
  await page.getByLabel("Quantité ligne 1").fill("2");
  await type(page.getByLabel(/Prix unitaire ligne 1/), "400000");
  await cap("Totaux HT / TVA / TTC calculés en direct", 2400);
  await type(page.getByLabel("TVA (%)"), "150");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await cap("TVA hors limites refusée", 2000);
  await type(page.getByLabel("TVA (%)"), "18");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await cap("Pro forma créée (numéro PF-… automatique)", 2200);
  await type(page.getByLabel(/Prix unitaire ligne 1/), "380000");
  await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();
  await page.getByText(/Pro forma modifiée/).waitFor();
  await cap("Modification enregistrée et journalisée", 2000);
  await cap("Cycle de vie : brouillon → envoyée → acceptée", 2000);
  await page.getByRole("button", { name: /Marquer « Envoyée »/ }).click();
  await pause(1500);
  await cap("Pas de facture possible tant que la pro forma n'est pas acceptée", 2600);
  await page.getByRole("button", { name: /Marquer « Acceptée »/ }).click();
  await page.getByRole("button", { name: /Générer la facture commerciale/ }).waitFor();
  await cap("Acceptée → le bouton « Générer la facture commerciale » apparaît", 2400);
});

await step("génération de la facture commerciale", async () => {
  await page.getByRole("button", { name: /Générer la facture commerciale/ }).click();
  await cap("Action irréversible : confirmation demandée", 2600);
  await page.getByRole("button", { name: "Générer", exact: true }).click();
  await page.getByText("Document non modifiable").waitFor();
  await cap("Facture commerciale FC-… générée · lecture seule", 2600);
  await page.emulateMedia({ media: "print" });
  await cap("Aperçu à l'impression / PDF", 3000);
  await page.emulateMedia({ media: null });
});

await step("pro forma verrouillée", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.locator("tr", { hasText: "Gueye" }).getByRole("link").first().click().catch(async () => {
    await page.locator("tr", { hasText: "facturée" }).getByRole("link").first().click();
  });
  await page.getByText(/Verrouillée/).waitFor();
  await cap("La pro forma facturée est verrouillée : ni modification ni suppression", 3200);
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("tab", { name: "Commerciales" }).click();
  await cap("Liste des factures commerciales", 2200);
});

await step("limites de l'agent", async () => {
  await page.goto(`${BASE}/journal`);
  await page.getByText(/réservé au chef/).first().waitFor();
  await cap("Journal global : accès refusé à l'agent", 2600);
  const chefTok = await apiToken("chef");
  const r = await (await fetch(`${API}/clients?q=kabor`, { headers: { Authorization: `Bearer ${chefTok}` } })).json();
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
  await page.locator("article", { hasText: "Préparer la démo" }).getByRole("combobox").click();
  await page.getByRole("option", { name: "Terminée" }).click();
  await cap("Ou via le menu de statut (accessible au clavier)", 2400);
});

await step("affichage mobile", async () => {
  await page.setViewportSize({ width: 390, height: 780 });
  await pause(800);
  await cap("Interface adaptée au mobile", 1800);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await pause(1800);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 720 });
  await pause(800);
});

/* ===================== CHEF ===================== */
await step("connexion chef d'équipe", async () => {
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await kcLogin("chef", "Déconnexion puis connexion en tant que chef d'équipe");
  await page.getByRole("heading", { name: "Clients" }).waitFor();
  await page.getByText("Moussa Traore").first().waitFor();
  await cap("Le chef voit les clients de toute l'équipe + le menu « Journal »", 3200);
  await page.getByRole("combobox", { name: "Ajouté par" }).click();
  await page.getByRole("option", { name: /Moussa/ }).click();
  await cap("Filtre « Ajouté par » (réservé au chef)", 2600);
  await page.getByRole("button", { name: "Réinitialiser" }).click();
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
  await page.getByRole("tab", { name: "Toutes les tâches" }).click();
  await cap("Toutes les tâches : filtres, modification, suppression", 2800);
});

await step("journal de traçabilité", async () => {
  await page.getByRole("link", { name: "Journal" }).first().click();
  await page.getByText("Journal de traçabilité").waitFor();
  await cap("Journal : qui, quoi, quand — lecture seule", 3200);
  await cap("Filtrer le journal par type d'action", 1500);
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: /Génération de facture/ }).click();
  await cap("Filtre par action : générations de facture", 2800);
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: "Toutes les actions" }).click();
  await page.getByRole("combobox", { name: "Filtrer par action" }).click();
  await page.getByRole("option", { name: /Modification de pro forma/ }).click();
  await cap("Modifications de pro forma avec montants avant → après", 3200);
});

await cap("Fin de la démonstration · ByteSec CRM MVP", 3500);
const video = page.video();
await ctx.close();
console.log("video:", await video.path());
const fails = log.filter((l) => l[0] === "FAIL");
console.log(`\n${log.length - fails.length}/${log.length} étapes réussies`);
await browser.close();
