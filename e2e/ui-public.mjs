// Prerequis : npm i playwright (hors depot) ; Chrome installe. Voir le README, section Tests.
// Parcours navigateur des liens de consultation : projet (inscription), pro forma (valider / refuser), facture signée.
// Le « visiteur » utilise un contexte de navigateur vierge (aucune session Keycloak) pour prouver l'accès anonyme.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:8082";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const errors = [];
for (const [pg, tag] of [[page, "agent"]]) {
  pg.on("console", (m) => m.type() === "error" && errors.push(`${tag} console: ${m.text().slice(0, 200)}`));
  pg.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message.slice(0, 200)}`));
}

let ok = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); ok++; console.log("  ok  ", name); }
  catch (e) {
    fail++;
    console.log("  FAIL", name, "-", e.message.split("\n").slice(0, 3).join(" | ").slice(0, 330));
    console.log("   page:", page.url(), (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 260));
  }
};

/** Ouvre un lien dans un contexte vierge (visiteur sans compte) et exécute le scénario. */
async function visiteur(url, fn) {
  const c = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const v = await c.newPage();
  v.setDefaultTimeout(15000);
  v.on("pageerror", (e) => errors.push(`visiteur pageerror: ${e.message.slice(0, 200)}`));
  try {
    await v.goto(url);
    await fn(v);
  } finally {
    await c.close();
  }
}
const lien = async () => page.getByRole("textbox", { name: /Lien de consultation/ }).inputValue();
const argent = (n) => new RegExp(String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s"));

async function login(user) {
  await page.getByLabel(/Username or email|Nom d.utilisateur/i).fill(user);
  await page.locator("#password").fill(user);
  await page.locator("#kc-login").click();
}

await page.goto(`${BASE}/clients`);
await page.waitForURL(/localhost:8080\/realms\/crm/);
await login("agent");
await page.getByRole("heading", { name: "Clients" }).waitFor();

let urlProjet = "";
await check("projet: prix auto, modification, retablissement, tranches", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await page.getByLabel("Nom du projet").fill("Cyber-sensibilisation Banque Sahel");
  await page.getByLabel("Description").first().fill("Programme pour 80 collaborateurs");
  for (const [t, h, p] of [["Phishing 101", "3", "250000"], ["Hygiene numerique", "4", "150000"]]) {
    await page.getByLabel("Titre de la formation").fill(t);
    await page.getByLabel("Durée en heures").fill(h);
    await page.getByLabel("Prix en FCFA").fill(p);
    await page.getByRole("button", { name: "Ajouter au catalogue" }).click();
    await page.getByText("Formation ajoutée au catalogue").waitFor();
  }
  await page.getByRole("button", { name: /Ajouter un pack/ }).click();
  await page.getByLabel("Nom du pack").fill("Pack Complet");
  await page.locator("label", { hasText: "Phishing 101" }).first().click();
  await page.locator("label", { hasText: "Hygiene numerique" }).first().click();
  await page.getByText(/Calculé automatiquement/).waitFor();
  const prix = page.getByLabel("Prix du pack (FCFA)");
  if ((await prix.inputValue()) !== "400000") throw new Error(`prix auto attendu 400000, obtenu ${await prix.inputValue()}`);
  await page.getByText(argent(133333)).first().waitFor();
  await prix.fill("390000");
  await page.getByRole("button", { name: /Rétablir le prix calculé/ }).waitFor();
  await page.getByText(/130\s000[\s\S]*130\s000[\s\S]*130\s000/).waitFor();
  await page.getByRole("button", { name: /Rétablir le prix calculé/ }).click();
  if ((await prix.inputValue()) !== "400000") throw new Error("retablissement du prix auto KO");
  await prix.fill("390000");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByRole("heading", { name: "Cyber-sensibilisation Banque Sahel" }).waitFor();
  await page.getByText(/prix modifié, calculé : 400\s000/).waitFor();
});

await check("lien de consultation copiable (jeton 36 hex)", async () => {
  urlProjet = await lien();
  if (!/\/p\/[a-f0-9]{36}$/.test(urlProjet)) throw new Error(`lien inattendu : ${urlProjet}`);
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Lien copié dans le presse-papiers").waitFor();
  await page.getByText("Partagé", { exact: true }).first().waitFor();
});

await check("projet sans aucun pack", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await page.getByRole("link", { name: /Nouveau projet/ }).first().click();
  await page.getByLabel("Nom du projet").fill("Projet sans pack");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.getByRole("heading", { name: "Projet sans pack" }).waitFor();
  await page.getByText("Ce projet n'a aucun pack.").waitFor();
});

await check("visiteur anonyme: projet en lecture seule, prix en 3 tranches uniquement", async () => {
  await visiteur(urlProjet, async (v) => {
    await v.getByRole("heading", { name: "Cyber-sensibilisation Banque Sahel" }).waitFor();
    if (v.url().includes("8080")) throw new Error("redirige vers Keycloak : la page n'est pas publique");
    await v.getByText("Pack Complet").waitFor();
    await v.getByText("Phishing 101").waitFor();
    await v.getByText(/Paiement en 3 tranches/).waitFor();
    await v.getByText(/Tranche 1/).waitFor();
    const txt = await v.locator("body").innerText();
    if (/390\s000|400\s000/.test(txt)) throw new Error("le prix total est affiche");
    if (!/130\s000/.test(txt)) throw new Error("tranches absentes");
    if (await v.getByRole("link", { name: "Clients" }).count()) throw new Error("navigation interne visible");
  });
});

await check("visiteur: validation du formulaire puis inscription en un clic", async () => {
  await visiteur(urlProjet, async (v) => {
    await v.getByRole("button", { name: "S'inscrire maintenant" }).click();
    await v.getByRole("button", { name: "Confirmer mon inscription" }).click();
    await v.getByText("Prénom requis").waitFor();
    await v.getByLabel("Prénom").fill("Awa");
    await v.getByLabel("Nom", { exact: true }).fill("Camara");
    await v.getByLabel("E-mail").fill("pas-un-mail");
    await v.getByLabel("Téléphone").fill("+221 77 000 11 22");
    await v.getByRole("button", { name: "Confirmer mon inscription" }).click();
    await v.getByText("E-mail invalide").waitFor();
    await v.getByLabel("E-mail").fill("awa.camara@exemple.org");
    await v.getByRole("button", { name: "Confirmer mon inscription" }).click();
    await v.getByText("Inscription enregistrée").waitFor();
  });
});

await check("agent: l'inscrit est dans la base clients et sur le projet", async () => {
  await page.getByRole("link", { name: "Projets" }).first().click();
  await page.getByRole("link", { name: "Cyber-sensibilisation Banque Sahel" }).click();
  await page.getByRole("heading", { name: /Inscrits/ }).waitFor();
  await page.getByRole("link", { name: "Awa Camara" }).waitFor();
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: "Awa Camara" }).waitFor();
  await page.getByRole("link", { name: "Awa Camara" }).click();
  await page.getByText("Prospect").first().waitFor();
  await page.getByText("Cyber-sensibilisation Banque Sahel").first().waitFor();
});

let urlPro = "";
await check("pro forma sans client sur 2 projets, pre-remplie depuis les packs", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.locator("label", { hasText: "Cyber-sensibilisation Banque Sahel" }).first().click();
  await page.locator("label", { hasText: "Projet sans pack" }).first().click();
  await page.getByRole("button", { name: /Pré-remplir les lignes/ }).click();
  await page.getByLabel("Désignation ligne 1").waitFor();
  const d = await page.getByLabel("Désignation ligne 1").inputValue();
  if (!d.includes("Pack Complet")) throw new Error(`ligne attendue : Pack Complet, obtenu ${d}`);
  await page.getByLabel("Quantité ligne 1").fill("2");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await page.getByText(/PF-\d{4}-\d{4}/).first().waitFor();
});

await check("copier le lien envoie la pro forma et la signe", async () => {
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Lien copié dans le presse-papiers").waitFor();
  await page.getByText("Envoyée", { exact: true }).first().waitFor();
  await page.getByText("Signature de l'émetteur").waitFor();
  await page.getByText(/SHA-256 : [a-f0-9]{64}/).waitFor();
  urlPro = await lien();
  if (!/\/pf\/[a-f0-9]{36}$/.test(urlPro)) throw new Error(`lien inattendu : ${urlPro}`);
});

let urlFacture = "";
await check("client anonyme: voit la pro forma signee et la VALIDE (identite demandee)", async () => {
  await visiteur(urlPro, async (v) => {
    await v.getByRole("heading", { name: /Pro forma PF-/ }).waitFor();
    await v.getByText("Signature de l'émetteur").waitFor();
    await v.getByText("Votre décision").waitFor();
    await v.getByRole("button", { name: "Valider", exact: true }).click();
    await v.getByText("Prénom requis").waitFor();
    await v.getByLabel("Prénom").fill("Ibrahima");
    await v.getByLabel("Nom", { exact: true }).fill("Sy");
    await v.getByLabel("E-mail").fill("ibra.sy@exemple.org");
    await v.getByLabel("Téléphone").fill("+221 76 111 22 33");
    await v.getByRole("button", { name: "Valider", exact: true }).click();
    await v.getByText(/La facture commerciale signée sera générée/).waitFor();
    await v.getByRole("button", { name: "Oui, valider" }).click();
    await v.getByText("Pro forma validée, merci !").waitFor();
    await v.getByRole("link", { name: "Consulter ma facture" }).click();
    await v.getByRole("heading", { name: /Facture FC-/ }).waitFor();
    urlFacture = v.url();
    await v.getByText("Document non modifiable").waitFor();
    await v.getByText("Signature valide").waitFor();
    await v.getByText("Ibrahima Sy").first().waitFor();
    await v.getByText(/Signature du client/).waitFor();
    for (const b of ["Modifier", "Supprimer", "Enregistrer"]) if (await v.getByRole("button", { name: new RegExp(b) }).count()) throw new Error(`bouton ${b}`);
  });
});

await check("la pro forma validee ne peut plus etre decidee", async () => {
  await visiteur(urlPro, async (v) => {
    await v.getByText(/Validée par Ibrahima Sy/).waitFor();
    if (await v.getByRole("button", { name: "Valider", exact: true }).count()) throw new Error("bouton Valider encore present");
    await v.getByRole("link", { name: /Consulter la facture commerciale/ }).waitFor();
  });
});

await check("agent: pro forma verrouillee, decision du client, nouveau client qualifie", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.locator("tr", { hasText: "facturée" }).getByRole("link").first().click();
  await page.getByText(/Verrouillée/).waitFor();
  await page.getByText(/Validée par Ibrahima Sy/).waitFor();
  await page.getByRole("link", { name: "Clients" }).first().click();
  await page.getByRole("link", { name: "Ibrahima Sy" }).waitFor();
  await page.locator("tr", { hasText: "Ibrahima Sy" }).getByText("Qualifié").waitFor();
});

await check("agent: lien copiable de la facture commerciale signee", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("tab", { name: "Commerciales" }).click();
  await page.getByRole("link", { name: /FC-/ }).first().click();
  await page.getByText("Signature valide").waitFor();
  const l = await lien();
  if (l !== urlFacture) throw new Error(`lien different : ${l} vs ${urlFacture}`);
});

let urlRefus = "";
await check("pro forma d'un client connu: refus par le client avec motif", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: "Awa Camara" }).click();
  await page.getByLabel("Désignation ligne 1").fill("Atelier de simulation");
  await page.getByLabel(/Prix unitaire ligne 1/).fill("150000");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Envoyée", { exact: true }).first().waitFor();
  urlRefus = await lien();
  await visiteur(urlRefus, async (v) => {
    await v.getByText("Awa Camara").first().waitFor();
    if (await v.getByLabel("E-mail").count()) throw new Error("identite redemandee pour un client connu");
    await v.getByRole("button", { name: "Refuser" }).click();
    await v.getByText("Votre nom complet est requis pour signer").waitFor();
    await v.getByLabel(/Votre nom complet/).fill("Awa Camara");
    await v.getByRole("button", { name: "Refuser" }).click();
    await v.getByLabel(/Motif/).fill("Budget insuffisant cette année");
    await v.getByRole("button", { name: "Oui, refuser" }).click();
    await v.getByText("Votre refus a bien été transmis").waitFor();
  });
  await page.reload();
  await page.getByText("Refusée", { exact: true }).first().waitFor();
  await page.getByText(/Refusée par Awa Camara/).waitFor();
});

await check("liens invalides: message clair, aucune fuite", async () => {
  for (const u of ["p", "pf", "f"]) {
    await visiteur(`${BASE}/${u}/${"0".repeat(36)}`, async (v) => {
      await v.getByText("Lien introuvable").waitFor();
    });
  }
});

await check("modifier une pro forma envoyee annule la signature", async () => {
  await page.getByRole("link", { name: "Factures" }).first().click();
  await page.getByRole("link", { name: /Nouvelle pro forma/ }).first().click();
  await page.getByLabel("Désignation ligne 1").fill("Audit");
  await page.getByLabel(/Prix unitaire ligne 1/).fill("100000");
  await page.getByRole("button", { name: "Créer la pro forma" }).click();
  await page.getByText("Pro forma créée").waitFor();
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await page.getByText("Signature de l'émetteur").waitFor();
  await page.getByLabel(/Prix unitaire ligne 1/).fill("120000");
  await page.getByRole("button", { name: /Enregistrer les modifications/ }).click();
  await page.getByText(/Pro forma modifiée/).waitFor();
  await page.getByText("Brouillon", { exact: true }).first().waitFor();
  if (await page.getByText("Signature de l'émetteur").count()) throw new Error("signature encore affichee");
});

// --- chef : le journal trace les actions des tiers
await page.getByRole("button", { name: "Déconnexion" }).click();
await page.waitForURL(/localhost:8080\/realms\/crm/);
await login("chef");
await check("chef: journal des evenements publics (lien public)", async () => {
  await page.getByRole("link", { name: "Journal" }).first().click();
  await page.getByText("Journal de traçabilité").waitFor();
  for (const t of ["Inscription via un lien de projet", "Pro forma validée par le client", "Pro forma refusée par le client", "Génération de facture commerciale"]) {
    await page.getByText(t).first().waitFor();
  }
  await page.getByText(/Awa Camara \(lien public\)/).first().waitFor();
  await page.getByText(/Ibrahima Sy \(lien public\)/).first().waitFor();
  await page.getByText(/Motif du refus.*Budget insuffisant/).first().waitFor();
});
await page.screenshot({ path: "shot-public-journal.png" });

console.log(`\n${ok} ok, ${fail} echecs`);
const reel = [...new Set(errors.filter((e) => !/favicon|hydrat|403|404/i.test(e)))];
console.log(reel.length ? "erreurs navigateur:\n" + reel.slice(0, 8).join("\n") : "aucune erreur console");
await browser.close();
