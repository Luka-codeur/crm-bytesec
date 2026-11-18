"""Données de démonstration (via l'API) : clients, catalogue, un projet facturé, des tâches.

À lancer sur une base métier vide, API + Keycloak démarrés (voir e2e.py pour le prérequis
« Direct access grants » du client crm-frontend, en dev uniquement).
"""
import datetime
import json
import urllib.error
import urllib.parse
import urllib.request

API = "http://127.0.0.1:3000/api"
KC = "http://localhost:8080/realms/crm/protocol/openid-connect/token"


def token(u):
    d = urllib.parse.urlencode({"grant_type": "password", "client_id": "crm-frontend", "username": u, "password": u}).encode()
    return json.load(urllib.request.urlopen(KC, d))["access_token"]


def call(tok, method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req)
        raw = r.read()
        return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> {e.code} {e.read()[:300]}")


A, C = token("agent"), token("chef")
me_a = call(A, "GET", "/me")
me_c = call(C, "GET", "/me")

# --- clients de l'agent
fatou = call(A, "POST", "/clients", {"nom": "Diop", "prenom": "Fatou", "email": "fatou.diop@banque-sahel.sn", "telephone": "+221 77 123 45 67", "adresse": "Plateau, Dakar"})
ibra = call(A, "POST", "/clients", {"nom": "Sow", "prenom": "Ibrahima", "email": "i.sow@telecom-ouest.ml", "telephone": "+223 66 12 34 56", "adresse": "ACI 2000, Bamako"})
mariam = call(A, "POST", "/clients", {"nom": "Ba", "prenom": "Mariam", "email": "mariam.ba@assurance-delta.ci", "telephone": "+225 07 08 09 10 11", "adresse": "Cocody, Abidjan"})
call(A, "POST", "/clients", {"nom": "Ndiaye", "prenom": "Cheikh", "email": "c.ndiaye@mairie-thies.sn", "telephone": "+221 76 987 65 43", "adresse": "Thiès"})
call(A, "PATCH", f"/clients/{ibra['id']}/statut", {"statut": "qualifie"})
call(A, "PATCH", f"/clients/{mariam['id']}/statut", {"statut": "qualifie"})
call(A, "PATCH", f"/clients/{mariam['id']}/statut", {"statut": "confirme"})

# --- clients du chef (invisibles pour l'agent)
call(C, "POST", "/clients", {"nom": "Kaboré", "prenom": "Salif", "email": "salif.kabore@minefid.bf", "telephone": "+226 70 11 22 33", "adresse": "Ouagadougou"})
call(C, "POST", "/clients", {"nom": "Mensah", "prenom": "Akosua", "email": "akosua@ghana-fintech.gh", "telephone": "+233 24 555 0101", "adresse": "Accra"})

# --- catalogue
f1 = call(A, "POST", "/formations", {"titre": "Sensibilisation au phishing", "description": "Reconnaître et signaler", "dureeHeures": 3, "prixCentimes": 25000000})
f2 = call(A, "POST", "/formations", {"titre": "Hygiène numérique des équipes", "description": "Mots de passe, MFA", "dureeHeures": 4, "prixCentimes": 30000000})
f3 = call(A, "POST", "/formations", {"titre": "Réponse à incident pour managers", "description": "Premiers réflexes", "dureeHeures": 6, "prixCentimes": 60000000})

# --- un projet déjà facturé pour Mariam Ba
projet = call(A, "POST", "/projets", {"nom": "Programme de sensibilisation Delta", "description": "Formation des 120 collaborateurs",
                                       "packs": [{"nom": "Pack Essentiel", "prixCentimes": 55000000, "formations": [{"id": f1["id"]}, {"id": f2["id"]}]}]})
call(A, "PATCH", f"/clients/{mariam['id']}", {"projetId": projet["id"]})
call(A, "POST", f"/projets/{projet['id']}/partager")
pf = call(A, "POST", "/proformas", {"clientId": mariam["id"], "projetIds": [projet["id"]], "tvaPourcent": 18,
                                     "lignes": [{"designation": "Pack Essentiel (120 pers.)", "quantite": 1, "prixUnitaireCentimes": 55000000}]})
call(A, "PATCH", f"/proformas/{pf['id']}/statut", {"statut": "envoyee"})
call(A, "PATCH", f"/proformas/{pf['id']}/statut", {"statut": "acceptee"})
call(A, "POST", f"/proformas/{pf['id']}/generer-facture")
# une pro forma en brouillon pour Ibrahima
call(A, "POST", "/proformas", {"clientId": ibra["id"], "tvaPourcent": 18,
                                "lignes": [{"designation": "Hygiène numérique des équipes", "quantite": 2, "prixUnitaireCentimes": 30000000}]})

# --- tâches
hier = (datetime.date.today() - datetime.timedelta(days=3)).isoformat()
demain = (datetime.date.today() + datetime.timedelta(days=4)).isoformat()
t1 = call(C, "POST", "/taches", {"titre": "Relancer les prospects du secteur bancaire", "description": "10 appels cette semaine", "assigneAId": me_a["id"], "echeance": hier})
t2 = call(C, "POST", "/taches", {"titre": "Préparer la démo pour Telecom Ouest", "description": "Slides + cas d'usage", "assigneAId": me_a["id"], "echeance": demain})
t3 = call(C, "POST", "/taches", {"titre": "Qualifier la mairie de Thiès", "assigneAId": me_a["id"]})
call(A, "PATCH", f"/taches/{t2['id']}/statut", {"statut": "en_cours"})
call(A, "PATCH", f"/taches/{t3['id']}/statut", {"statut": "en_cours"})
call(A, "PATCH", f"/taches/{t3['id']}/statut", {"statut": "terminee"})

print("données de démo créées")
