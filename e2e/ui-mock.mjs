// Prerequis : npm i playwright (hors depot) ; Chrome installe. Voir le README, section Tests.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:8081";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

let ok = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); ok++; console.log("  ok  ", name); }
  catch (e) {
    fail++;
    console.log("  FAIL", name, "-", e.message.split("\n")[0].slice(0, 160));
    console.log("   page:", page.url(), (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
  }
};
const T = { timeout: 8000 };
page.setDefaultTimeout(8000);

await page.goto(`${BASE}/clients`);
await check("ecran de connexion demo", async () => { await page.getByText("Mode démo").waitFor(T); });
await page.getByRole("button", { name: /Aminata/ }).click();
await check("liste clients (chef)", async () => { await page.getByRole("heading", { name: "Clients" }).waitFor(T); await page.getByRole("link", { name: /\w+ \w+/ }).first().waitFor(T); });
await check("nav chef: Journal visible", async () => { await page.getByRole("link", { name: "Journal" }).first().waitFor(T); });

await check("filtre statut Qualifié (URL)", async () => {
  await page.getByRole("button", { name: "Qualifié", exact: true }).click();
  await page.waitForURL(/statut/, T);
});
await check("reinitialiser les filtres", async () => { await page.getByRole("button", { name: "Réinitialiser" }).click(); await page.waitForURL((u) => !u.search.includes("statut"), T); });
await check("filtre semaine precedente", async () => { await page.getByRole("button", { name: "Semaine précédente" }).click(); await page.waitForURL(/semaine=/, T); await page.getByRole("button", { name: "Réinitialiser" }).click(); });

await check("creation client + validation", async () => {
  await page.getByRole("button", { name: "Nouveau client" }).click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Nom requis", { exact: true }).waitFor(T);
  await page.getByLabel("Nom", { exact: true }).fill("Testeur");
  await page.getByLabel("Prénom").fill("Awa");
  await page.getByLabel("E-mail").fill("awa.testeur@example.com");
  await page.getByLabel("Téléphone").fill("770001122");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Client créé").waitFor(T);
});

await check("detail client + changement de statut confirme", async () => {
  await page.getByRole("link", { name: "Awa Testeur" }).first().click();
  await page.getByRole("heading", { name: "Awa Testeur" }).waitFor(T);
  await page.getByRole("combobox", { name: "Changer le statut" }).click();
  await page.getByRole("option", { name: "Qualifié" }).click();
  await page.getByRole("button", { name: "Confirmer" }).click();
  await page.getByText(/Statut mis à jour/).waitFor(T);
  await page.getByRole("tab", { name: "Historique" }).click();
  await page.getByText("Changement de statut client").first().waitFor(T);
});

await page.getByRole("link", { name: "Projets" }).first().click();
await check("liste projets", async () => { await page.getByRole("heading", { name: "Projets" }).waitFor(T); });
await check("creation projet sans client (pack + prix auto)", async () => {
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await page.getByLabel("Nom du projet").fill("Projet Playwright");
  if (await page.getByRole("combobox", { name: "Client" }).count()) throw new Error("champ client present");
  await page.getByRole("button", { name: /Ajouter un pack/ }).click();
  await page.getByLabel("Nom du pack").fill("Pack Test");
  await page.locator("label", { hasText: /h ·/ }).first().click();
  await page.getByText(/Calculé automatiquement/).waitFor(T);
  await page.getByText(/Paiement en 3 tranches/).waitFor(T);
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByText(/Projet créé/).waitFor(T);
  await page.getByRole("heading", { name: "Projet Playwright" }).waitFor(T);
});
await check("lien de consultation du projet", async () => {
  await page.getByRole("textbox", { name: /Lien de consultation/ }).waitFor(T);
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Lien copié dans le presse-papiers").waitFor(T);
});

await page.getByRole("link", { name: "Factures" }).first().click();
await check("liste factures (2 onglets)", async () => { await page.getByRole("tab", { name: "Commerciales" }).click(); await page.getByRole("tab", { name: "Pro forma" }).click(); });
let proformaUrl;
await check("creation pro forma + totaux en direct", async () => {
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Awa Testeur" }).click();
  await page.getByLabel("Désignation ligne 1").fill("Pack Test");
  await page.getByLabel("Quantité ligne 1").fill("2");
  await page.getByLabel(/Prix unitaire ligne 1/).fill("100000");
  await page.getByText(/236\s?000/).first().waitFor(T); // 200 000 + 18 % TVA
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor(T);
  proformaUrl = page.url();
});
await check("generation impossible avant acceptation", async () => {
  if (await page.getByRole("button", { name: /Générer la facture/ }).count()) throw new Error("bouton visible trop tot");
});
await check("accepter puis generer la facture (confirmation)", async () => {
  await page.getByRole("button", { name: /Acceptée/ }).click();
  await page.getByRole("button", { name: /Générer la facture commerciale/ }).click();
  await page.getByText(/irréversible/).waitFor(T);
  await page.getByRole("button", { name: "Générer", exact: true }).click();
  await page.getByText("Document non modifiable").waitFor(T);
});
await check("facture: aucun controle d'edition", async () => {
  for (const n of ["Modifier", "Supprimer", "Enregistrer"]) if (await page.getByRole("button", { name: new RegExp(n) }).count()) throw new Error(`bouton ${n} present`);
});
await check("pro forma verrouillee", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.locator("tr", { hasText: "facturée" }).getByRole("link").first().click();
  await page.getByText(/Verrouillée/).waitFor(T);
  if (await page.getByRole("button", { name: "Supprimer", exact: true }).count()) throw new Error("suppression possible");
  if (await page.getByRole("button", { name: /Enregistrer/ }).count()) throw new Error("enregistrement possible");
  if (await page.getByRole("button", { name: /Ajouter une ligne/ }).isEnabled()) throw new Error("ajout de ligne possible");
});

await page.getByRole("link", { name: "Tâches" }).first().click();
await check("taches chef: avancement + assignation", async () => {
  await page.getByText("Avancement de l'équipe").first().waitFor(T);
  await page.getByRole("button", { name: /Assigner une tâche/ }).click();
  await page.getByLabel("Titre").fill("Appeler 5 prospects");
  await page.getByRole("combobox", { name: "Agent" }).click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText("Tâche assignée").waitFor(T);
});
await page.getByRole("link", { name: "Journal" }).first().click();
await check("journal: 3 types d'actions", async () => {
  await page.getByText("Journal de traçabilité").waitFor(T);
  for (const t of ["Changement de statut client", "Génération de facture commerciale", "Modification de pro forma"]) await page.getByText(t).first().waitFor(T).catch(() => { throw new Error(`manque: ${t}`); });
});

// Vue agent
await page.getByRole("button", { name: "Déconnexion" }).click();
await page.getByRole("button", { name: /Kofi/ }).click();
await check("agent: pas de Journal dans la nav", async () => {
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("heading", { name: "Clients" }).waitFor(T);
  if (await page.getByRole("link", { name: "Journal" }).count()) throw new Error("Journal visible");
});
await page.getByRole("link", { name: "Tâches" }).first().click();
await check("agent: kanban 3 colonnes", async () => { for (const c of ["À faire", "En cours", "Terminée"]) await page.getByRole("region", { name: c }).waitFor(T); });

await check("liens publics (mode demo): projet + inscription", async () => {
  const c = await browser.newContext();
  const v = await c.newPage();
  v.setDefaultTimeout(8000);
  await v.goto(`${BASE}/p/mock-p-1`);
  await v.getByRole("heading", { name: "Programme de sensibilisation 2027" }).waitFor();
  await v.getByText(/Paiement en 3 tranches/).first().waitFor();
  await v.getByRole("button", { name: "S'inscrire maintenant" }).click();
  await v.getByLabel("Prénom").fill("Test");
  await v.getByLabel("Nom", { exact: true }).fill("Public");
  await v.getByLabel("E-mail").fill("test.public@exemple.org");
  await v.getByLabel("Téléphone").fill("770000000");
  await v.getByRole("button", { name: "Confirmer mon inscription" }).click();
  await v.getByText("Inscription enregistrée").waitFor();
  await c.close();
});
await check("liens publics (mode demo): validation de pro forma -> facture signee", async () => {
  const c = await browser.newContext();
  const v = await c.newPage();
  v.setDefaultTimeout(8000);
  await v.goto(`${BASE}/pf/mock-pf-3`);
  await v.getByRole("heading", { name: /Pro forma PF-2026-0003/ }).waitFor();
  await v.getByLabel(/Votre nom complet/).fill("Awa Koné");
  await v.getByRole("button", { name: "Valider", exact: true }).click();
  await v.getByRole("button", { name: "Oui, valider" }).click();
  await v.getByText("Pro forma validée, merci !").waitFor();
  await v.getByRole("link", { name: "Consulter ma facture" }).click();
  await v.getByText("Document non modifiable").waitFor();
  await v.getByText("Signature valide").waitFor();
  await c.close();
});
await check("liens publics (mode demo): lien invalide", async () => {
  const c = await browser.newContext();
  const v = await c.newPage();
  v.setDefaultTimeout(8000);
  await v.goto(`${BASE}/p/inconnu`);
  await v.getByText("Lien introuvable").waitFor();
  await c.close();
});

await page.screenshot({ path: "shot-agent.png" });
console.log(`\n${ok} ok, ${fail} echecs`);
const real = errors.filter((e) => !/favicon|hydrat/i.test(e));
console.log(real.length ? "erreurs navigateur:\n" + [...new Set(real)].slice(0, 8).join("\n") : "aucune erreur console");
await browser.close();
