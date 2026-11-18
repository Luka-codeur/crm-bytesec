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


def call(tok, method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
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
s, pr = call(A, "POST", "/projets", {"nom": "Projet Alpha", "clientId": cid,
                                      "packs": [{"nom": "Pack Starter", "prixCentimes": 5000000, "formations": [{"id": fo["id"]}]}]})
check("cree projet + pack + formation", s in (200, 201) and len(pr["packs"][0]["formations"]) == 1, (s, pr))
s, r = call(A, "PATCH", f"/clients/{cid}", {"projetId": pr["id"]}); check("projet assigne au client", s == 200 and r.get("projetId") == pr["id"], (s, r))
s, r = call(A, "POST", f"/projets/{pr['id']}/envoyer"); check("envoyer au client", s in (200, 201) and r["statut"] == "envoye", (s, r))

print("factures")
s, pf = call(A, "POST", "/proformas", {"clientId": cid, "projetId": pr["id"], "tvaPourcent": 18,
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
s, r = call(A, "POST", "/projets", {"nom": "x", "clientId": oid, "packs": []}); check("agent: projet sur client d'autrui (404)", s == 404, (s, r))
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
s, empty = call(A, "POST", "/projets", {"nom": "Vide", "clientId": cid, "packs": []}); check("projet sans pack cree", s in (200, 201), (s, empty))
s, r = call(A, "POST", f"/projets/{empty['id']}/envoyer"); check("envoi sans pack refuse (409)", s == 409, (s, r))
s, r = call(A, "PATCH", f"/projets/{pr['id']}", {"nom": "Projet Alpha v2"}); check("modification projet", s == 200 and r["nom"] == "Projet Alpha v2" and len(r["packs"]) == 1, (s, r))
s, r = call(A, "PATCH", f"/clients/{cid}", {"projetId": empty["id"]}); check("assignation projet du meme client", s == 200, (s, r))
s, r = call(A, "DELETE", f"/projets/{empty['id']}"); check("suppression projet", s in (200, 204), (s, r))
s, r = call(A, "GET", "/projets?clientId=" + cid); check("liste projets filtree par client", s == 200 and all(x["clientId"] == cid for x in r["data"]) and len(r["data"]) == 1, (s, r))
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

print("securite")
for path in ["/clients", "/projets", "/proformas", "/factures-commerciales", "/taches", "/journal", "/me", "/formations"]:
    s, _ = call("jeton-bidon", "GET", path); check(f"{path}: jeton invalide (401)", s == 401, s)

print(f"\n{ok} ok, {fail} echecs")
