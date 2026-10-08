#!/usr/bin/env python3
"""Siembra un tenant recién provisionado: ajustes (es_ES, COP), equipos, roles ACL y usuario API.
Imprime en stdout un JSON {"api_key": "..."}; todo el log va a stderr."""
import base64
import json
import sys
import os
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ui_settings import UI_SETTINGS  # noqa: E402

base, admin_user, admin_pass = sys.argv[1], sys.argv[2], sys.argv[3]
AUTH = "Basic " + base64.b64encode(f"{admin_user}:{admin_pass}".encode()).decode()


def api(method: str, path: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(
        f"{base}/api/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": AUTH, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw else {}


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


# Perfil del administrador y de la empresa (opcional): {"first","last","phone","country","city"}
try:
    PROFILE = json.loads(sys.argv[6]) if len(sys.argv) > 6 and sys.argv[6] else {}
except ValueError:
    PROFILE = {}
# país → zona horaria y moneda por defecto
REGION = {"CO": ("America/Bogota", "COP"), "MX": ("America/Mexico_City", "MXN"), "PE": ("America/Lima", "PEN"), "CL": ("America/Santiago", "CLP"),
          "AR": ("America/Argentina/Buenos_Aires", "ARS"), "EC": ("America/Guayaquil", "USD"), "PA": ("America/Panama", "USD"), "CR": ("America/Costa_Rica", "CRC"),
          "DO": ("America/Santo_Domingo", "DOP"), "GT": ("America/Guatemala", "GTQ"), "UY": ("America/Montevideo", "UYU"), "PY": ("America/Asuncion", "PYG"),
          "BO": ("America/La_Paz", "BOB"), "VE": ("America/Caracas", "VES"), "ES": ("Europe/Madrid", "EUR"), "US": ("America/New_York", "USD")}
TZ, CUR = REGION.get(str(PROFILE.get("country", "")).upper(), ("America/Bogota", "COP"))

# Ajustes regionales y de marca
api("PUT", "Settings", {
    "language": "es_ES", "applicationName": (sys.argv[5] if len(sys.argv) > 5 else "Crm Hub 360"), "timeZone": TZ,
    "dateFormat": "DD/MM/YYYY", "timeFormat": "HH:mm", "weekStart": 1,
    "currencyList": sorted({CUR, "USD"}), "defaultCurrency": CUR, "baseCurrency": CUR,
    **UI_SETTINGS,
})
log("ajustes aplicados")

if len(sys.argv) > 4:  # correo del administrador (Gerente General)
    me = api("GET", "App/user")["user"]
    api("PUT", f"User/{me['id']}", {"emailAddress": sys.argv[4], "firstName": PROFILE.get("first") or "Gerente", "lastName": PROFILE.get("last") or "General",
                                    **({"phoneNumber": PROFILE["phone"]} if PROFILE.get("phone") else {})})
    log("correo del administrador configurado")

LEVELS = {  # scope -> (create, read, edit, delete) por rol
    "Comercial": ("yes", "own", "own", "no"),
    "Director de Equipo": ("yes", "team", "team", "own"),
    "Gerente General": ("yes", "all", "all", "all"),
}
SCOPES = ["Lead", "Account", "Contact", "Opportunity", "Task", "Call", "Meeting", "Email", "Note"]
CAMPAIGN = {"Comercial": ("no", "no", "no", "no"), "Director de Equipo": ("no", "team", "no", "no"), "Gerente General": ("yes", "all", "all", "all")}


def role_data(level: tuple) -> dict:
    c, r, e, d = level
    return {s: {"create": c, "read": r, "edit": e, "delete": d, "stream": r} for s in SCOPES}


def campaign_perm(role: str) -> dict:
    c, r, e, d = CAMPAIGN[role]
    return {"create": c, "read": r, "edit": e, "delete": d, "stream": r}


for name, level in LEVELS.items():
    api("POST", "Role", {"name": name, "data": {**role_data(level), "Campaign": campaign_perm(name), "Calendar": True},
                         "assignmentPermission": {"Comercial": "no", "Director de Equipo": "team", "Gerente General": "all"}[name],
                         "userPermission": {"Comercial": "no", "Director de Equipo": "team", "Gerente General": "all"}[name],
                         "dashboardPermission": "yes" if name != "Comercial" else "no"})
    log(f"rol creado: {name}")

_api_data = role_data(("yes", "all", "all", "no"))
_api_data["Campaign"] = {"create": "no", "read": "all", "edit": "no", "delete": "no", "stream": "no"}
_api_data["User"] = {"read": "all"}
_api_data["Import"] = True
api_role = api("POST", "Role", {"name": "Integración API (Hub)", "data": _api_data, "assignmentPermission": "all", "userPermission": "all"})
team = api("POST", "Team", {"name": "Equipo Principal"})
user = api("POST", "User", {"userName": "hub-api", "type": "api", "authMethod": "ApiKey",
                            "rolesIds": [api_role["id"]], "teamsIds": [team["id"]]})
key = api("GET", f"User/{user['id']}").get("apiKey")
if not key:
    sys.exit("no se obtuvo apiKey del usuario API")
print(json.dumps({"api_key": key}))
