"""Scénario de bout en bout contre l'API locale (npm run dev) et Keycloak.

Prérequis (dev uniquement, le realm versionné garde ce flux désactivé) :
  activer "Direct access grants" sur le client crm-frontend, par exemple
  MSYS_NO_PATHCONV=1 docker exec crm-keycloak-1 /opt/keycloak/bin/kcadm.sh ...
Repartir d'une base vide de données métier pour des résultats déterministes.
"""
import json, urllib.request, urllib.parse, urllib.error

API = "http://127.0.0.1:3000/api"
KC = "http://localhost:8080/realms/crm/protocol/openid-connect/token"
ok = fail = 0


def token(u):
    d = urllib.parse.urlencode({"grant_type": "password", "client_id": "crm-frontend", "username": u, "password": u}).encode()
    return json.load(urllib.request.urlopen(KC, d))["access_token"]


def call(tok, method, path, body=None, headers=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json", **(headers or {})})
    try:
        r = urllib.request.urlopen(req)
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def check(name, cond, info=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ok   {name}")
    else:
        fail += 1
        print(f"  FAIL {name} {info}")


A, C = token("agent"), token("chef")

print("auth")
s, _ = call("", "GET", "/me"); check("sans jeton -> 401", s == 401, s)
s, me_a = call(A, "GET", "/me"); check("agent /me", s == 200 and me_a["role"] == "agent", (s, me_a))
s, me_c = call(C, "GET", "/me"); check("chef /me", s == 200 and me_c["role"] == "chef_equipe", (s, me_c))
s, eq = call(C, "GET", "/utilisateurs/equipe"); check("equipe: 2 membres", s == 200 and len(eq) == 2, (s, eq))

print("clients")
s, cl = call(A, "POST", "/clients", {"nom": "Diop", "prenom": "Fatou", "email": "fatou@ex.com", "telephone": "770000000", "adresse": "Dakar"})
check("agent cree client", s in (200, 201) and cl["statut"] == "prospect", (s, cl))
cid = cl["id"]
s, bad = call(A, "POST", "/clients", {"nom": "X", "prenom": "Y", "email": "pas-un-mail", "telephone": "1"})
check("validation 422 avec details", s == 422 and "email" in bad.get("details", {}), (s, bad))
s, _ = call(C, "POST", "/clients", {"nom": "Ba", "prenom": "Omar", "email": "o@ex.com", "telephone": "771111111"})
s, la = call(A, "GET", "/clients"); check("agent ne voit que ses clients", la["total"] == 1, la.get("total"))
s, lc = call(C, "GET", "/clients"); check("chef voit toute l'equipe", lc["total"] >= 2, lc.get("total"))
s, f = call(C, "GET", "/clients?statut[]=prospect&statut[]=qualifie&q=diop"); check("filtre statut[] + q", s == 200 and f["total"] == 1, (s, f))
s, f = call(C, "GET", "/clients?semaine=2020-W01"); check("filtre semaine vide", s == 200 and f["total"] == 0, (s, f))
s, f = call(C, "GET", "/clients?semaine=oups"); check("semaine invalide 422", s == 422, (s, f))
s, other = call(C, "GET", "/clients?q=ba"); oid = other["data"][0]["id"]
s, r = call(A, "GET", f"/clients/{oid}"); check("agent: client d'un autre -> 404", s == 404, (s, r))
s, r = call(A, "PATCH", f"/clients/{cid}/statut", {"statut": "qualifie"}); check("changement de statut", s == 200 and r["statut"] == "qualifie", (s, r))

print("projets")
s, fo = call(A, "POST", "/formations", {"titre": "Sensibilisation phishing", "dureeHeures": 4, "prixCentimes": 5000000})
check("cree formation", s in (200, 201), (s, fo))
s, pr = call(A, "POST", "/projets", {"nom": "Projet Alpha",
                                      "packs": [{"nom": "Pack Starter", "prixCentimes": 5000000, "formations": [{"id": fo["id"]}]}]})
check("cree projet + pack + formation", s in (200, 201) and len(pr["packs"][0]["formations"]) == 1, (s, pr))
s, r = call(A, "PATCH", f"/clients/{cid}", {"projetId": pr["id"]}); check("projet assigne au client", s == 200 and r.get("projetId") == pr["id"], (s, r))
s, r = call(A, "POST", f"/projets/{pr['id']}/envoyer"); check("envoyer au client", s in (200, 201) and r["statut"] == "envoye", (s, r))

print("factures")
s, pf = call(A, "POST", "/proformas", {"clientId": cid, "projetIds": [pr["id"]], "tvaPourcent": 18,
                                        "lignes": [{"designation": "Pack Starter", "quantite": 2, "prixUnitaireCentimes": 5000000}]})
check("cree pro forma PF-", s in (200, 201) and pf["numero"].startswith("PF-"), (s, pf))
pid = pf["id"]
s, r = call(A, "POST", f"/proformas/{pid}/generer-facture"); check("facture refusee si non acceptee (409)", s == 409, (s, r))
s, r = call(A, "PATCH", f"/proformas/{pid}", {"tvaPourcent": 0}); check("modif pro forma", s == 200 and r["tvaPourcent"] == 0, (s, r))
s, r = call(A, "PATCH", f"/proformas/{pid}/statut", {"statut": "acceptee"}); check("acceptee", s == 200 and r["statut"] == "acceptee", (s, r))
s, fc = call(A, "POST", f"/proformas/{pid}/generer-facture")
check("facture commerciale FC- generee, totaux OK", s in (200, 201) and fc["numero"].startswith("FC-") and fc["totalHtCentimes"] == 10000000 and fc["totalTtcCentimes"] == 10000000, (s, fc))
s, r = call(A, "POST", f"/proformas/{pid}/generer-facture"); check("2e generation -> 409", s == 409, (s, r))
s, r = call(A, "PATCH", f"/proformas/{pid}", {"tvaPourcent": 5}); check("pro forma verrouillee -> 409", s == 409, (s, r))
s, r = call(A, "DELETE", f"/proformas/{pid}"); check("suppression pro forma verrouillee -> 409", s == 409, (s, r))
s, r = call(A, "PATCH", f"/factures-commerciales/{fc['id']}", {}); check("facture: pas de route PATCH", s == 404, (s, r))
s, r = call(A, "DELETE", f"/factures-commerciales/{fc['id']}"); check("facture: pas de route DELETE", s == 404, (s, r))
s, r = call(A, "GET", f"/proformas/{pid}"); check("pro forma pointe vers la facture", r.get("factureCommercialeId") == fc["id"], r)

print("taches")
agent_id = me_a["id"]
s, r = call(A, "POST", "/taches", {"titre": "x", "assigneAId": agent_id}); check("agent ne cree pas de tache (403)", s == 403, (s, r))
s, t = call(C, "POST", "/taches", {"titre": "Appeler 10 prospects", "assigneAId": agent_id, "echeance": "2026-12-01"})
check("chef assigne tache", s in (200, 201) and t["statut"] == "a_faire", (s, t))
s, r = call(A, "PATCH", f"/taches/{t['id']}/statut", {"statut": "en_cours"}); check("agent met a jour son statut", s == 200 and r["statut"] == "en_cours", (s, r))
s, r = call(A, "GET", "/taches/avancement-equipe"); check("avancement reserve au chef (403)", s == 403, (s, r))
s, r = call(C, "GET", "/taches/avancement-equipe"); check("chef voit l'avancement", s == 200 and any(x["enCours"] == 1 for x in r), (s, r))

print("journal")
s, r = call(A, "GET", "/journal"); check("journal global refuse a l'agent", s == 403, (s, r))
s, r = call(A, "GET", f"/journal?clientId={cid}"); check("agent: historique de son client", s == 200 and r["total"] >= 3, (s, r.get("total") if isinstance(r, dict) else r))
s, r = call(C, "GET", "/journal"); acts = {e["action"] for e in r["data"]}
check("3 types d'actions tracees", acts == {"STATUT_CLIENT_MODIFIE", "PROFORMA_MODIFIEE", "FACTURE_GENEREE"}, acts)
ev = [e for e in r["data"] if e["action"] == "STATUT_CLIENT_MODIFIE"][0]
check("diff avant/apres", ev["details"]["avant"]["statut"] == "prospect" and ev["details"]["apres"]["statut"] == "qualifie", ev)

print("cas limites: isolation entre agents")
s, r = call(A, "PATCH", f"/clients/{oid}", {"nom": "Hack"}); check("agent ne modifie pas le client d'un autre (404)", s == 404, (s, r))
s, r = call(A, "DELETE", f"/clients/{oid}"); check("agent ne supprime pas le client d'un autre (404)", s == 404, (s, r))
s, cp = call(C, "POST", "/projets", {"nom": "Projet du chef", "packs": []}); s, r = call(A, "GET", f"/projets/{cp['id']}"); check("agent: projet cree par un autre (404)", s == 404, (s, r))
s, r = call(A, "POST", "/proformas", {"clientId": oid, "tvaPourcent": 0, "lignes": [{"designation": "x", "quantite": 1, "prixUnitaireCentimes": 1}]}); check("agent: pro forma sur client d'autrui (404)", s == 404, (s, r))
s, r = call(A, "GET", f"/clients/{oid}"); check("agent: lecture client d'autrui (404)", s == 404, (s, r))
s, r = call(A, "GET", f"/journal?clientId={oid}"); check("agent: historique client d'autrui (404)", s == 404, (s, r))
s, r = call(A, "PATCH", f"/clients/{cid}/statut", {"statut": "inconnu"}); check("statut client invalide (422)", s == 422, (s, r))

print("cas limites: validations")
l1 = [{"designation": "x", "quantite": 1, "prixUnitaireCentimes": 100}]
s, r = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": []}); check("pro forma sans ligne (422)", s == 422, (s, r))
s, r = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 150, "lignes": l1}); check("TVA > 100 (422)", s == 422, (s, r))
s, r = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": [{"designation": "x", "quantite": 0, "prixUnitaireCentimes": 1}]}); check("quantite 0 (422)", s == 422, (s, r))
s, r = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": [{"designation": "x", "quantite": 1, "prixUnitaireCentimes": -5}]}); check("prix negatif (422)", s == 422, (s, r))
s, r = call(A, "GET", "/clients/pas-un-uuid"); check("identifiant non UUID (400)", s == 400, (s, r))
s, r = call(A, "POST", "/clients", {"nom": "", "prenom": "", "email": "x", "telephone": ""}); check("client vide: details par champ", s == 422 and {"nom", "prenom", "email"} <= set(r.get("details", {})), (s, r))
s, r = call(C, "POST", "/taches", {"titre": "t", "assigneAId": "00000000-0000-0000-0000-0000000000ff"}); check("tache a un inconnu (422)", s == 422, (s, r))
s, r = call(C, "PATCH", f"/taches/{t['id']}/statut", {"statut": "fini"}); check("statut tache invalide (422)", s == 422, (s, r))

print("cas limites: projets")
s, empty = call(A, "POST", "/projets", {"nom": "Vide"}); check("projet sans pack cree", s in (200, 201), (s, empty))
s, r = call(A, "POST", f"/projets/{empty['id']}/envoyer"); check("projet sans pack partageable", s in (200, 201) and r["statut"] == "envoye", (s, r))
s, r = call(A, "PATCH", f"/projets/{pr['id']}", {"nom": "Projet Alpha v2"}); check("modification projet", s == 200 and r["nom"] == "Projet Alpha v2" and len(r["packs"]) == 1, (s, r))
s, r = call(A, "PATCH", f"/clients/{cid}", {"projetId": empty["id"]}); check("assignation d'un projet a un client", s == 200, (s, r))
s, r = call(A, "PATCH", f"/clients/{cid}", {"projetId": cp["id"]}); check("assignation d'un projet hors perimetre (422)", s == 422, (s, r))
s, r = call(A, "DELETE", f"/projets/{empty['id']}"); check("suppression projet", s in (200, 204), (s, r))
s, r = call(A, "GET", "/projets"); check("liste projets de l'agent", s == 200 and {x["id"] for x in r["data"]} == {pr["id"]}, (s, r))
s, r = call(A, "GET", "/formations"); check("catalogue formations", s == 200 and any(x["id"] == fo["id"] for x in r), (s, r))

print("cas limites: factures")
s, rf = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": l1}); pf2 = rf["id"]
s, r = call(A, "PATCH", f"/proformas/{pf2}/statut", {"statut": "refusee"}); check("pro forma refusee", s == 200 and r["statut"] == "refusee", (s, r))
s, r = call(A, "POST", f"/proformas/{pf2}/generer-facture"); check("facture depuis pro forma refusee (409)", s == 409 and r.get("code") == "NOT_ACCEPTED", (s, r))
s, r = call(A, "DELETE", f"/proformas/{pf2}"); check("suppression pro forma non facturee", s in (200, 204), (s, r))
s, r = call(A, "GET", f"/proformas/{pf2}"); check("pro forma supprimee introuvable (404)", s == 404, (s, r))
s, pf3 = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": [{"designation": "Concurrence", "quantite": 3, "prixUnitaireCentimes": 10000}]})
call(A, "PATCH", f"/proformas/{pf3['id']}/statut", {"statut": "acceptee"})
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(6) as ex:
    res = list(ex.map(lambda _: call(A, "POST", f"/proformas/{pf3['id']}/generer-facture")[0], range(6)))
check("6 generations simultanees: une seule reussit", (res.count(201) + res.count(200)) == 1 and res.count(409) == 5, res)
s, fl = call(A, "GET", f"/factures-commerciales?clientId={cid}"); check("factures du client: 2, numeros distincts", s == 200 and len(fl["data"]) == 2 and len({x["numero"] for x in fl["data"]}) == 2, (s, fl))
s, r = call(A, "GET", f"/factures-commerciales/{fc['id']}"); check("facture: snapshot des lignes", s == 200 and r["lignes"][0]["designation"] == "Pack Starter" and r["totalTtcCentimes"] == 10000000, (s, r))
s, r = call(C, "GET", f"/factures-commerciales/{fc['id']}"); check("chef lit la facture de son equipe", s == 200, (s, r))
s, r = call(C, "DELETE", f"/clients/{cid}"); check("client avec factures non supprimable (409)", s == 409, (s, r))

print("cas limites: taches")
s, tc = call(C, "POST", "/taches", {"titre": "Tache du chef", "assigneAId": me_c["id"]}); check("chef se cree une tache", s in (200, 201), (s, tc))
s, r = call(A, "PATCH", f"/taches/{tc['id']}/statut", {"statut": "terminee"}); check("agent ne touche pas la tache d'autrui (404)", s == 404, (s, r))
s, r = call(A, "GET", "/taches"); check("agent ne voit que ses taches", s == 200 and all(x["assigneAId"] == agent_id for x in r["data"]), (s, r))
s, r = call(A, "PATCH", f"/taches/{t['id']}", {"titre": "Hack"}); check("agent ne modifie pas une tache (403)", s == 403, (s, r))
s, r = call(A, "DELETE", f"/taches/{t['id']}"); check("agent ne supprime pas une tache (403)", s == 403, (s, r))
s, r = call(C, "PATCH", f"/taches/{t['id']}/statut", {"statut": "terminee"}); check("chef termine une tache", s == 200 and r["statut"] == "terminee", (s, r))
s, r = call(C, "GET", "/taches/avancement-equipe"); ag = [x for x in r if x["agent"]["id"] == agent_id][0]; check("avancement: compteurs coherents", ag["total"] == ag["aFaire"] + ag["enCours"] + ag["terminees"] and ag["terminees"] >= 1, ag)
s, r = call(C, "DELETE", f"/taches/{tc['id']}"); check("chef supprime une tache", s in (200, 204), (s, r))
s, r = call(C, "GET", f"/taches?assigneAId={agent_id}&statut=terminee"); check("filtre taches agent+statut", s == 200 and all(x["statut"] == "terminee" for x in r["data"]), (s, r))

print("cas limites: filtres clients")
for i in range(3):
    call(A, "POST", "/clients", {"nom": f"Pagin{i}", "prenom": "Test", "email": f"p{i}@ex.com", "telephone": "7700000"})
s, r = call(C, "GET", "/clients?pageSize=2&page=1"); check("pagination clients", s == 200 and len(r["data"]) == 2 and r["total"] >= 5, (s, r.get("total")))
s, r = call(C, "GET", f"/clients?ajoutePar={me_c['id']}"); check("filtre 'ajoute par' (chef)", s == 200 and all(x["ajoutePar"]["id"] == me_c["id"] for x in r["data"]), (s, r))
s, r = call(A, "GET", f"/clients?ajoutePar={me_c['id']}"); check("agent: filtre 'ajoute par' ignore", s == 200 and all(x["ajoutePar"]["id"] == agent_id for x in r["data"]), (s, r))
import datetime
wk = datetime.date.today().isocalendar(); semaine = f"{wk[0]}-W{wk[1]:02d}"
s, r = call(C, "GET", f"/clients?semaine={semaine}"); check("filtre semaine courante", s == 200 and r["total"] >= 5, (s, r.get("total")))
s, r = call(C, "GET", "/clients?statut=confirme"); check("filtre statut (valeur unique)", s == 200 and all(x["statut"] == "confirme" for x in r["data"]), (s, r))

print("cas limites: journal")
s, r = call(C, "GET", "/journal?action=FACTURE_GENEREE"); check("filtre journal par action", s == 200 and r["total"] >= 2 and all(e["action"] == "FACTURE_GENEREE" for e in r["data"]), (s, r.get("total")))
s, r = call(C, "GET", f"/journal?acteurId={me_c['id']}"); check("filtre journal par acteur", s == 200 and all(e["acteur"]["id"] == me_c["id"] for e in r["data"]), (s, r))
s, r = call(C, "GET", "/journal?pageSize=1&page=2"); check("pagination journal", s == 200 and len(r["data"]) == 1 and r["total"] > 1, (s, r.get("total")))
s, r = call(C, "GET", "/journal?du=2099-01-01"); check("filtre journal periode future vide", s == 200 and r["total"] == 0, (s, r))
s, r = call(C, "GET", "/journal"); check("journal trie du plus recent", [e["date"] for e in r["data"]] == sorted([e["date"] for e in r["data"]], reverse=True), None)
s, r = call(A, "POST", "/journal", {}); check("journal: pas de route d'ecriture (404)", s == 404, (s, r))

import re
import random

def pub(method, path, body=None, ip=None):
    """Appel sans authentification. L'IP simulee (X-Forwarded-For) isole la limitation de frequence par scenario."""
    return call("", method, "/public" + path, body, {"X-Forwarded-For": ip or f"10.9.{random.randint(0, 250)}.{random.randint(1, 250)}"})

TOKEN_RE = re.compile(r"^[a-f0-9]{36}$")

print("packs: prix automatique et tranches")
fo2 = call(A, "POST", "/formations", {"titre": "Hygiene numerique", "dureeHeures": 4, "prixCentimes": 3000000})[1]
s, pj = call(A, "POST", "/projets", {"nom": "Projet Public", "description": "Programme complet", "packs": [
    {"nom": "Pack auto", "formations": [{"id": fo["id"]}, {"id": fo2["id"]}]},
    {"nom": "Pack negocie", "prixCentimes": 7500000, "formations": [{"id": fo["id"]}, {"id": fo2["id"]}]},
    {"nom": "Pack impair", "prixCentimes": 10000001, "formations": [{"id": fo["id"]}]},
]})
check("projet avec 3 packs cree", s in (200, 201) and len(pj["packs"]) == 3, (s, pj))
pa, pn, pi = pj["packs"]
check("prix auto = somme des formations", pa["prixCentimes"] == 8000000 and pa["prixAutoCentimes"] == 8000000 and pa["prixPersonnalise"] is False, pa)
check("prix modifie conserve et signale", pn["prixCentimes"] == 7500000 and pn["prixAutoCentimes"] == 8000000 and pn["prixPersonnalise"] is True, pn)
check("3 tranches egales", pn["nbTranches"] == 3 and pn["tranchesCentimes"] == [2500000, 2500000, 2500000], pn)
check("tranches en francs entiers, la derniere absorbe le reste", pi["tranchesCentimes"] == [3333300, 3333300, 3333401] and sum(pi["tranchesCentimes"]) == 10000001, pi)
check("tranches du pack auto: somme exacte", pa["tranchesCentimes"] == [2666600, 2666600, 2666800] and sum(pa["tranchesCentimes"]) == 8000000, pa)
check("lien de consultation genere (jeton 36 hex)", bool(TOKEN_RE.match(pj["tokenConsultation"])), pj.get("tokenConsultation"))
s, r = call(A, "POST", "/projets", {"nom": "Formation inconnue", "packs": [{"nom": "x", "formations": [{"id": "00000000-0000-0000-0000-0000000000aa"}]}]}); check("pack avec formation inconnue (422)", s == 422, (s, r))
s, r = call(A, "PATCH", f"/projets/{pj['id']}", {"packs": [{"nom": "Pack unique", "formations": [{"id": fo2["id"]}]}]}); check("remplacement des packs", s == 200 and len(r["packs"]) == 1 and r["packs"][0]["prixCentimes"] == 3000000, (s, r))
s, r = call(A, "PATCH", f"/projets/{pj['id']}", {"packs": [pa and {"nom": "Pack auto", "formations": [{"id": fo["id"]}, {"id": fo2["id"]}]}]}); check("retour a un pack", s == 200 and len(r["packs"]) == 1, (s, r))
s, r = call(A, "POST", f"/projets/{pj['id']}/partager"); check("partager le projet", s in (200, 201) and r["statut"] == "envoye", (s, r))

print("lien public du projet (sans authentification)")
tok = pj["tokenConsultation"]
s, v = pub("GET", f"/projets/{tok}")
check("consultation sans jeton d'authentification (200)", s == 200 and v["nom"] == "Projet Public", (s, v))
check("details en lecture seule: packs et formations", len(v["packs"]) == 1 and len(v["packs"][0]["formations"]) == 2 and v["packs"][0]["formations"][0]["titre"], v)
check("prix affiche en 3 tranches, jamais en total", len(v["packs"][0]["tranchesCentimes"]) == 3 and "prixCentimes" not in v["packs"][0], v["packs"][0])
check("aucune donnee interne exposee", not ({"id", "clientId", "creePar", "tokenConsultation", "inscritsCount"} & set(v)) and "id" not in v["packs"][0], v)
s, r = pub("GET", "/projets/" + "0" * 36); check("jeton inconnu (404)", s == 404, (s, r))
s, r = pub("GET", "/projets/pas-un-jeton"); check("jeton mal forme (404)", s == 404, (s, r))
s, r = pub("GET", f"/projets/{tok.upper()}"); check("jeton en majuscules refuse (404)", s == 404, (s, r))

ins = {"prenom": "Awa", "nom": "Camara", "email": "Awa.Camara@Exemple.org", "telephone": "+221 77 000 11 22", "adresse": "Dakar"}
n_avant = call(C, "GET", "/clients?pageSize=200")[1]["total"]
s, r = pub("POST", f"/projets/{tok}/inscription", ins, ip="10.1.0.1"); check("S'inscrire maintenant (200)", s == 200 and r == {"ok": True}, (s, r))
s, lc = call(A, "GET", "/clients?q=camara")
check("le prospect est ajoute a la base clients", s == 200 and lc["total"] == 1 and lc["data"][0]["statut"] == "prospect" and lc["data"][0]["email"] == "awa.camara@exemple.org", (s, lc))
check("client rattache au createur du projet et au projet", lc["data"][0]["ajoutePar"]["id"] == agent_id and lc["data"][0]["projetId"] == pj["id"], lc["data"][0])
s, r = pub("POST", f"/projets/{tok}/inscription", {**ins, "email": "awa.camara@exemple.org", "telephone": "000 000"}, ip="10.1.0.2"); check("re-inscription: pas de doublon (e-mail insensible a la casse)", s == 200 and call(C, "GET", "/clients?pageSize=200")[1]["total"] == n_avant + 1, (s, r))
s, ii = call(A, "GET", f"/projets/{pj['id']}/inscrits"); check("liste des inscrits: 1 personne", s == 200 and len(ii) == 1 and ii[0]["prenom"] == "Awa", (s, ii))
s, r = call(A, "GET", f"/projets/{pj['id']}"); check("compteur d'inscrits", r["inscritsCount"] == 1, r)
s, r = call(A, "GET", f"/projets?clientId={lc['data'][0]['id']}"); check("projets d'un client = ceux de ses inscriptions", s == 200 and [x["id"] for x in r["data"]] == [pj["id"]], (s, r))
s, r = pub("POST", f"/projets/{tok}/inscription", {"prenom": "", "nom": "", "email": "x", "telephone": ""}, ip="10.1.0.3"); check("inscription invalide (422)", s == 422 and {"prenom", "nom", "email", "telephone"} <= set(r.get("details", {})), (s, r))
s, r = pub("POST", f"/projets/{'1' * 36}/inscription", ins, ip="10.1.0.4"); check("inscription sur un jeton inconnu (404)", s == 404, (s, r))
s, r = pub("POST", f"/projets/{tok}/inscription", {**ins, "email": "fatou@ex.com"}, ip="10.1.0.5"); s2, ii = call(A, "GET", f"/projets/{pj['id']}/inscrits")
check("client existant inscrit sans etre duplique", s == 200 and len(ii) == 2 and call(C, "GET", "/clients?q=fatou")[1]["total"] == 1, (s, ii))
s, r = call(C, "GET", "/journal?action=CLIENT_INSCRIT"); check("journal: inscriptions via lien public tracees", s == 200 and r["total"] == 2 and all("(lien public)" in e["acteur"]["nom"] for e in r["data"]), (s, r))
s, r = call(A, "GET", f"/clients/{lc['data'][0]['id']}"); check("agent lit le client inscrit", s == 200, (s, r))
codes = [pub("POST", f"/projets/{tok}/inscription", {**ins, "email": f"spam{i}@x.org"}, ip="10.1.0.99")[0] for i in range(7)]
check("limitation de frequence: 429 au-dela de 5/minute", 429 in codes and codes[:5] == [200] * 5, codes)

print("pro forma: plusieurs projets, signature, lien de consultation")
s, pj2 = call(A, "POST", "/projets", {"nom": "Second projet", "packs": []}); check("projet sans aucun pack", s in (200, 201) and pj2["packs"] == [], (s, pj2))
L = [{"designation": "Pack auto", "quantite": 2, "prixUnitaireCentimes": 8000000}, {"designation": "Atelier", "quantite": 1, "prixUnitaireCentimes": 1500000}]
s, p1 = call(A, "POST", "/proformas", {"projetIds": [pj["id"], pj2["id"]], "tvaPourcent": 18, "lignes": L})
check("pro forma SANS client sur 2 projets", s in (200, 201) and "clientId" not in p1 and sorted(p1["projetIds"]) == sorted([pj["id"], pj2["id"]]), (s, p1))
check("lien de consultation + non signee en brouillon", bool(TOKEN_RE.match(p1["tokenConsultation"])) and "signature" not in p1, p1)
s, r = call(A, "POST", "/proformas", {"projetIds": ["00000000-0000-0000-0000-0000000000bb"], "tvaPourcent": 0, "lignes": L}); check("projet inconnu (422)", s == 422, (s, r))
s, r = call(A, "POST", "/proformas", {"projetIds": [cp["id"]], "tvaPourcent": 0, "lignes": L}); check("projet hors perimetre (422)", s == 422, (s, r))
s, v = pub("GET", f"/proformas/{p1['tokenConsultation']}")
check("vue publique en brouillon: decision impossible", s == 200 and v["peutDecider"] is False and v["clientAIdentifier"] is True and v["totalHtCentimes"] == 17500000, (s, v))
s, r = pub("POST", f"/proformas/{p1['tokenConsultation']}/valider", {"nom": "Moussa Diop", "prenom": "Moussa", "email": "m@x.org", "telephone": "770", "hash": v["hash"]}, ip="10.2.0.1"); check("valider un brouillon refuse (409)", s == 409 and r["code"] == "NOT_PENDING", (s, r))
s, r = call(A, "PATCH", f"/proformas/{p1['id']}/statut", {"statut": "envoyee"}); sig = r.get("signature", {})
check("envoi = cachet electronique de l'emetteur", s == 200 and sig.get("par", {}).get("id") == agent_id and re.match(r"^[a-f0-9]{64}$", sig.get("hash", "")) and sig.get("le"), (s, r))
s, v = pub("GET", f"/proformas/{p1['tokenConsultation']}")
check("vue publique: signee, decision possible, hash identique", v["peutDecider"] is True and v["signature"]["hash"] == v["hash"] == sig["hash"] and v["projets"] and len(v["projets"]) == 2, v)
h = v["hash"]
P = f"/proformas/{p1['tokenConsultation']}"
s, r = pub("POST", P + "/valider", {"nom": "Ibrahima Sy", "hash": "f" * 64}, ip="10.2.0.2"); check("hash obsolete refuse (409 DOCUMENT_MODIFIE)", s == 409 and r["code"] == "DOCUMENT_MODIFIE", (s, r))
s, r = pub("POST", P + "/valider", {"nom": "Sy", "hash": h}, ip="10.2.0.3"); check("client inconnu: identite obligatoire (422)", s == 422 and {"prenom", "email", "telephone"} <= set(r.get("details", {})), (s, r))
s, r = pub("POST", P + "/valider", {"nom": "S", "hash": h}, ip="10.2.0.4"); check("signature trop courte (422)", s == 422, (s, r))
n0 = call(C, "GET", "/clients?pageSize=200")[1]["total"]
res = [pub("POST", P + "/valider", {"nom": "Sy", "prenom": "Ibrahima", "email": "ibra.sy@exemple.org", "telephone": "+221 76 111 22 33", "hash": h}, ip=f"10.2.1.{i}") for i in range(5)]
codes = sorted(c for c, _ in res)
check("5 validations simultanees: une seule reussit", codes == [200, 409, 409, 409, 409], codes)
ok_res = [b for c, b in res if c == 200][0]
check("validation => facture generee automatiquement", ok_res["statut"] == "acceptee" and TOKEN_RE.match(ok_res["factureToken"]), ok_res)
s, nc = call(C, "GET", "/clients?q=ibra.sy"); check("le signataire est ajoute a la base clients (qualifie)", nc["total"] == 1 and nc["data"][0]["statut"] == "qualifie" and call(C, "GET", "/clients?pageSize=200")[1]["total"] == n0 + 1, nc)
s, pf = call(A, "GET", f"/proformas/{p1['id']}")
check("pro forma acceptee, client rattache, facturee, verrouillee", pf["statut"] == "acceptee" and pf["clientId"] == nc["data"][0]["id"] and pf["factureCommercialeId"] and pf["decisionClient"]["nom"] == "Ibrahima Sy", pf)
s, r = call(A, "PATCH", f"/proformas/{p1['id']}", {"tvaPourcent": 0}); check("pro forma facturee non modifiable (409)", s == 409, (s, r))
s, fv = pub("GET", f"/factures/{ok_res['factureToken']}")
check("facture: consultation publique en lecture seule", s == 200 and fv["numero"].startswith("FC-") and fv["totalHtCentimes"] == 17500000 and fv["totalTtcCentimes"] == 20650000 and fv["client"]["nom"] == "Ibrahima Sy", (s, fv))
check("facture signee: emetteur + empreinte valide", fv["signature"]["valide"] is True and fv["signature"]["nom"] and len(fv["signature"]["hash"]) == 64, fv["signature"])
check("facture signee par le client (nom + date)", fv["signatureClient"]["nom"] == "Ibrahima Sy" and fv["signatureClient"]["le"], fv.get("signatureClient"))
s, fa = call(A, "GET", f"/factures-commerciales/{pf['factureCommercialeId']}")
check("agent: facture avec lien copiable et signature", fa["tokenConsultation"] == ok_res["factureToken"] and fa["signature"]["valide"] is True, fa)
s, r = pub("POST", P + "/refuser", {"nom": "Ibrahima Sy", "hash": h}, ip="10.2.2.1"); check("refuser apres validation (409)", s == 409, (s, r))
s, r = pub("GET", "/factures/" + "a" * 36); check("facture: jeton inconnu (404)", s == 404, (s, r))
s, jr = call(C, "GET", "/journal?pageSize=50")
acts = [(e["action"], e["acteur"]["nom"]) for e in jr["data"]]
check("journal: validation client et facture automatique", any(a == "PROFORMA_VALIDEE_CLIENT" and "Ibrahima Sy" in n for a, n in acts) and any(a == "FACTURE_GENEREE" and "validation client" in n for a, n in acts), acts[:8])

print("pro forma: refus par le client, modification apres envoi")
s, p2 = call(A, "POST", "/proformas", {"clientId": cid, "projetIds": [pj["id"]], "tvaPourcent": 18, "lignes": L})
call(A, "PATCH", f"/proformas/{p2['id']}/statut", {"statut": "envoyee"})
s, v2 = pub("GET", f"/proformas/{p2['tokenConsultation']}")
check("pro forma d'un client: nom affiche, pas d'identite a saisir", v2["client"]["nom"] and v2["clientAIdentifier"] is False, v2)
s, r = pub("POST", f"/proformas/{p2['tokenConsultation']}/refuser", {"nom": "Fatou Diop", "hash": v2["hash"], "motif": "Budget insuffisant"}, ip="10.3.0.1"); check("le client refuse", s == 200 and r["statut"] == "refusee", (s, r))
s, r = call(A, "GET", f"/proformas/{p2['id']}"); check("statut refusee, aucune facture", r["statut"] == "refusee" and "factureCommercialeId" not in r and r["decisionClient"]["nom"] == "Fatou Diop", r)
s, r = call(A, "POST", f"/proformas/{p2['id']}/generer-facture"); check("facture impossible apres refus (409)", s == 409, (s, r))
s, jr = call(C, "GET", "/journal?action=PROFORMA_REFUSEE_CLIENT"); check("journal: refus avec motif", jr["total"] == 1 and jr["data"][0]["details"]["apres"].get("motif") == "Budget insuffisant", jr)

s, p3 = call(A, "POST", "/proformas", {"clientId": cid, "tvaPourcent": 18, "lignes": L})
call(A, "PATCH", f"/proformas/{p3['id']}/statut", {"statut": "envoyee"})
h_ancien = pub("GET", f"/proformas/{p3['tokenConsultation']}")[1]["hash"]
s, r = call(A, "PATCH", f"/proformas/{p3['id']}", {"tvaPourcent": 10}); check("modifier apres envoi: retour en brouillon, signature annulee", s == 200 and r["statut"] == "brouillon" and "signature" not in r, (s, r))
s, r = pub("POST", f"/proformas/{p3['tokenConsultation']}/valider", {"nom": "Fatou Diop", "hash": h_ancien}, ip="10.3.0.2"); check("ancien lien: plus de decision possible (409)", s == 409, (s, r))
call(A, "PATCH", f"/proformas/{p3['id']}/statut", {"statut": "envoyee"})
h_nouveau = pub("GET", f"/proformas/{p3['tokenConsultation']}")[1]["hash"]
check("nouvelle empreinte apres modification", h_nouveau != h_ancien, (h_ancien, h_nouveau))
s, r = pub("POST", f"/proformas/{p3['tokenConsultation']}/valider", {"nom": "Fatou Diop", "hash": h_ancien}, ip="10.3.0.3"); check("empreinte de l'ancienne version refusee (409)", s == 409 and r["code"] == "DOCUMENT_MODIFIE", (s, r))
s, r = pub("POST", f"/proformas/{p3['tokenConsultation']}/valider", {"nom": "Fatou Diop", "hash": h_nouveau}, ip="10.3.0.4"); check("client existant valide avec son nom (signature)", s == 200 and r["statut"] == "acceptee", (s, r))

print("pro forma sans client: facturation manuelle impossible")
s, p4 = call(A, "POST", "/proformas", {"tvaPourcent": 0, "lignes": L})
call(A, "PATCH", f"/proformas/{p4['id']}/statut", {"statut": "acceptee"})
s, r = call(A, "POST", f"/proformas/{p4['id']}/generer-facture"); check("sans client: facture refusee (409 CLIENT_REQUIRED)", s == 409 and r["code"] == "CLIENT_REQUIRED", (s, r))
s, r = call(A, "PATCH", f"/proformas/{p4['id']}", {"clientId": cid}); s2, r2 = call(A, "PATCH", f"/proformas/{p4['id']}/statut", {"statut": "acceptee"})
s, r = call(A, "POST", f"/proformas/{p4['id']}/generer-facture"); check("une fois le client associe: facture generee et signee", s in (200, 201) and r["signature"]["valide"] is True and "signatureClient" not in r, (s, r))
s, r = call(C, "GET", "/factures-commerciales"); check("toutes les factures ont un lien et une signature valide", all(f["tokenConsultation"] and f["signature"]["valide"] for f in r["data"]), None)

print("liens publics: robustesse")
s, r = pub("POST", f"/projets/{tok}/inscription", {**ins, "email": "long@x.org", "nom": "N" * 101}, ip="10.7.0.1"); check("nom trop long refuse (422)", s == 422, (s, r))
s, r = pub("POST", f"/projets/{tok}/inscription", {**ins, "email": "long@x.org", "adresse": "A" * 301}, ip="10.7.0.2"); check("adresse trop longue refusee (422)", s == 422, (s, r))
s, r = pub("POST", f"/projets/{tok}/inscription", {**ins, "email": "x@x.org", "role": "chef_equipe", "ajoutePar": me_c["id"]}, ip="10.7.0.3"); s2, c2 = call(C, "GET", "/clients?q=x@x.org")
check("champs inconnus ignores (pas d'elevation)", s == 200 and c2["data"][0]["ajoutePar"]["id"] == agent_id, (s, c2))
s, r = call(A, "DELETE", f"/projets/{pj['id']}"); check("projet reference par une pro forma: suppression refusee (409)", s == 409, (s, r))
s, r = call(A, "GET", "/projets"); check("projets: jetons uniques", len({x["tokenConsultation"] for x in r["data"]}) == len(r["data"]), None)

print("securite")
for path in ["/clients", "/projets", "/proformas", "/factures-commerciales", "/taches", "/journal", "/me", "/formations"]:
    s, _ = call("jeton-bidon", "GET", path); check(f"{path}: jeton invalide (401)", s == 401, s)

print(f"\n{ok} ok, {fail} echecs")
