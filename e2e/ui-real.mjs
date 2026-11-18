// Prerequis : npm i playwright (hors depot) ; Chrome installe. Voir README (Tests).
import { chromium } from "playwright";

const BASE = "http://localhost:8082";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
page.setDefaultTimeout(12000);
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 220)}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on("response", (r) => { if (r.url().includes(":3000/api") && r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });

let ok = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); ok++; console.log("  ok  ", name); }
  catch (e) {
    fail++;
    console.log("  FAIL", name, "-", e.message.split("\n")[0].slice(0, 160));
    console.log("   page:", page.url(), (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
  }
};

async function login(user) {
  await page.getByLabel(/Username or email|Nom d.utilisateur/i).fill(user);
  await page.locator("#password").fill(user);
  await page.locator("#kc-login").click();
}

await page.goto(`${BASE}/clients`);
await check("redirection vers Keycloak", async () => { await page.waitForURL(/localhost:8080\/realms\/crm/); });
await login("agent");
await check("connexion agent -> liste clients", async () => {
  await page.getByRole("heading", { name: "Clients" }).waitFor();
  await page.getByText("Awa Diallo").first().waitFor(); // nom du compte Keycloak
});
await check("agent: pas de lien Journal", async () => { if (await page.getByRole("link", { name: "Journal" }).count()) throw new Error("visible"); });

await check("agent cree un client (API reelle)", async () => {
  await page.getByRole("button", { name: "Nouveau client" }).first().click();
  await page.getByLabel("Nom", { exact: true }).fill("Sarr");
  await page.getByLabel("Prénom").fill("Binta");
  await page.getByLabel("E-mail").fill("binta.sarr@example.com");
  await page.getByLabel("Téléphone").fill("771234567");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Client créé").waitFor();
  await page.getByRole("link", { name: "Binta Sarr" }).waitFor();
});
await check("recherche texte", async () => {
  await page.getByLabel("Rechercher un client").fill("sarr");
  await page.getByLabel("Rechercher un client").blur();
  await page.waitForURL(/q=sarr/);
  await page.getByRole("link", { name: "Binta Sarr" }).waitFor();
});
await check("changement de statut + historique", async () => {
  await page.getByRole("link", { name: "Binta Sarr" }).click();
  await page.getByRole("combobox", { name: "Changer le statut" }).click();
  await page.getByRole("option", { name: "Qualifié" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await page.getByText(/Statut mis à jour/).waitFor();
  await page.getByRole("tab", { name: "Historique" }).click();
  await page.getByText("Prospect").first().waitFor();
});

await check("projet: formation + pack + creation", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await page.getByLabel("Nom du projet").fill("Sensibilisation Binta");
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Binta Sarr" }).click();
  await page.getByLabel("Titre de la formation").fill("Phishing 101");
  await page.getByLabel("Durée en heures").fill("3");
  await page.getByLabel("Prix en FCFA").fill("250000");
  await page.getByRole("button", { name: "Ajouter au catalogue" }).click();
  await page.getByText("Formation ajoutée au catalogue").waitFor();
  await page.getByLabel("Nom du pack").fill("Pack Phishing");
  await page.getByLabel("Prix (FCFA)").first().fill("250000");
  await page.locator("label", { hasText: "Phishing 101" }).first().click();
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByText("Projet créé").waitFor();
  await page.getByRole("heading", { name: "Sensibilisation Binta" }).waitFor();
  await page.getByText("Phishing 101").first().waitFor();
});
await check("envoyer le projet", async () => {
  await page.getByRole("button", { name: /Envoyer au client/ }).click();
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await page.getByText("Projet envoyé au client").waitFor();
  await page.getByText("Envoyé", { exact: true }).first().waitFor();
});

await check("pro forma: creation avec totaux", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Binta Sarr" }).click();
  await page.getByLabel("Désignation ligne 1").fill("Pack Phishing");
  await page.getByLabel("Quantité ligne 1").fill("2");
  await page.getByLabel(/Prix unitaire ligne 1/).fill("100000");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await page.getByText(/PF-\d{4}-\d{4}/).first().waitFor();
});
await check("modification pro forma (journalisee)", async () => {
  await page.getByLabel(/Prix unitaire ligne 1/).fill("120000");
  await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();
  await page.getByText(/Pro forma modifiée/).waitFor();
});
await check("accepter puis generer la facture commerciale", async () => {
  await page.getByRole("button", { name: /Acceptée/ }).click();
  await page.getByRole("button", { name: /Générer la facture commerciale/ }).waitFor();
  await page.getByRole("button", { name: /Générer la facture commerciale/ }).click();
  await page.getByRole("button", { name: "Générer", exact: true }).click();
  await page.getByText("Document non modifiable").waitFor();
  await page.getByText(/FC-\d{4}-\d{4}/).first().waitFor();
  await page.getByText(/283\s?200/).first().waitFor(); // 2 x 120 000 + 18 % TVA
});
await check("facture: lecture seule", async () => {
  for (const n of ["Modifier", "Supprimer", "Enregistrer"]) if (await page.getByRole("button", { name: new RegExp(n) }).count()) throw new Error(`bouton ${n}`);
});
await check("pro forma verrouillee apres facturation", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.locator("tr", { hasText: "facturée" }).getByRole("link").first().click();
  await page.getByText(/Verrouillée/).waitFor();
});

await check("agent: kanban vide ou tache", async () => {
  await page.getByRole("link", { name: "Tâches" }).first().click();
  await page.getByRole("heading", { name: "Tâches de prospection" }).waitFor();
});
await check("agent: journal global refuse (403 gere)", async () => {
  await page.goto(`${BASE}/journal`);
  await page.getByText(/réservé au chef/).first().waitFor();
});

// --- chef
await page.getByRole("button", { name: "Déconnexion" }).click();
await page.waitForURL(/localhost:8080\/realms\/crm|localhost:8082/);
if (!page.url().includes("8080")) await page.goto(`${BASE}/clients`);
await page.waitForURL(/localhost:8080\/realms\/crm/);
await login("chef");
await check("chef: voit les clients de l'equipe", async () => {
  await page.getByRole("heading", { name: "Clients" }).waitFor();
  await page.getByText("Moussa Traore").first().waitFor();
  await page.getByRole("link", { name: "Binta Sarr" }).waitFor();
});
await check("chef: assigne une tache a l'agent", async () => {
  await page.getByRole("link", { name: "Tâches" }).first().click();
  await page.getByRole("button", { name: /Assigner une tâche/ }).click();
  await page.getByLabel("Titre").fill("Relancer 10 prospects");
  await page.getByRole("combobox", { name: "Agent" }).click();
  await page.getByRole("option", { name: /Diallo/ }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Tâche assignée").waitFor();
});
await check("chef: avancement d'equipe", async () => { await page.getByText("Awa Diallo").first().waitFor(); await page.getByText(/0\/1 terminées/).first().waitFor(); });
await check("chef: journal complet avec diff", async () => {
  await page.getByRole("link", { name: "Journal" }).first().click();
  await page.getByText("Journal de traçabilité").waitFor();
  for (const t of ["Changement de statut client", "Modification de pro forma", "Génération de facture commerciale"]) await page.getByText(t).first().waitFor();
  await page.getByText("Prospect").first().waitFor(); // avant -> apres
});
await page.screenshot({ path: "shot-real-chef.png" });

console.log(`\n${ok} ok, ${fail} echecs`);
const real = [...new Set(errors.filter((e) => !/favicon|hydrat|403/i.test(e)))];
console.log(real.length ? "erreurs navigateur:\n" + real.slice(0, 10).join("\n") : "aucune erreur console / HTTP 5xx");
await browser.close();
