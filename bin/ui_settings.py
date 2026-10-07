"""Ajustes de interfaz de Crm Hub 360 (tema, menú, dashboard). Se aplican al crear y con tenant:ui."""
import base64, json, sys, urllib.request

# Menú lateral, dashboard inicial y tema
TABS = [
    {"type": "divider", "id": "t1", "text": "Comercial"},
    "Lead",
    "Account", "Contact", "Opportunity",
    {"type": "divider", "id": "t3", "text": "Actividad"},
    "Task", "Meeting", "Call", "Calendar", "Email",
    {"type": "divider", "id": "t7", "text": "Organización"},
    "Campaign",
    {"type": "url", "id": "t8", "text": "Organigrama", "url": "#CrmHub/organigrama", "iconClass": "fas fa-sitemap", "aclScope": "Campaign"},
    {"type": "url", "id": "t13", "text": "Mensajes masivos", "url": "#CrmHub/difusion", "iconClass": "fas fa-bullhorn", "aclScope": "Campaign"},
    {"type": "url", "id": "t9", "text": "Equipos", "url": "#Team", "iconClass": "fas fa-users", "onlyAdmin": True},
    {"type": "url", "id": "t10", "text": "Usuarios", "url": "#User", "iconClass": "fas fa-user-gear", "onlyAdmin": True},
    {"type": "url", "id": "t11", "text": "Asignación de leads", "url": "#CrmHub/asignacion", "iconClass": "fas fa-shuffle", "onlyAdmin": True},
    {"type": "url", "id": "t12", "text": "Estados del pipeline", "url": "#CrmHub/pipeline", "iconClass": "fas fa-timeline", "onlyAdmin": True},
    {"type": "divider", "id": "t4", "text": "Ayuda"},
    {"type": "url", "id": "t5", "text": "Manual de usuario", "url": "#CrmHub/manual", "iconClass": "fas fa-book"},
    {"type": "url", "id": "t6", "text": "Integraciones", "url": "#CrmHub/integrations", "iconClass": "fas fa-plug", "onlyAdmin": True},
]
DASH_LAYOUT = [
    {"name": "Panel gerencial", "layout": [
        {"id": "d-panel", "name": "CrmHubPanel", "x": 0, "y": 0, "width": 4, "height": 6},
    ]},
    {"name": "Mi día", "layout": [
        {"id": "d-leads", "name": "Records", "x": 0, "y": 0, "width": 3, "height": 2},
        {"id": "d-tasks", "name": "Tasks", "x": 3, "y": 0, "width": 1, "height": 2},
        {"id": "d-activities", "name": "Activities", "x": 0, "y": 2, "width": 2, "height": 2},
        {"id": "d-stream", "name": "Stream", "x": 2, "y": 2, "width": 2, "height": 2},
    ]},
]
DASH_OPTIONS = {"d-panel": {"title": "Panel gerencial", "days": "30"},
                "d-leads": {"title": "Leads recientes", "entityType": "Lead", "displayRecords": 10, "sortBy": "createdAt", "sortDirection": "desc",
                            "expandedLayout": {"rows": [[{"name": "name", "link": True}, {"name": "status"}], [{"name": "qualificationStatus"}, {"name": "suggestedService"}]]}},
                "d-tasks": {"title": "Mis tareas"}}

UI_SETTINGS = {
    "theme": "CrmHub", "tabList": TABS, "quickCreateList": ["Lead", "Task", "Meeting", "Call"],
    "dashboardLayout": DASH_LAYOUT, "dashletsOptions": DASH_OPTIONS,
    "passwordRecoveryNoExposure": True,  # «Olvidé mi contraseña» (se muestra solo si la empresa tiene correo de salida): no revela si el usuario existe
    "recordsPerPageKanban": 25,  # Espo trae 5 por columna: parecía que faltaban leads frente a la tabla
    "assignmentNotificationsEntityList": ["Lead", "Account", "Contact", "Opportunity", "Task", "Meeting", "Call", "Email"],
}

if __name__ == "__main__":  # python3 ui_settings.py <base_url> <admin_user> <admin_pass>
    base, user, pw = sys.argv[1:4]
    auth = "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()

    def call(method, path, body=None):
        r = urllib.request.Request(f"{base}/api/v1/{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                   headers={"Authorization": auth, "Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}

    call("PUT", "Settings", UI_SETTINGS)
    me = call("GET", "App/user")["user"]["id"]
    # el administrador ya tiene Preferencias propias: se reinician el dashboard y el tema para que hereden lo nuevo
    call("PUT", f"Preferences/{me}", {"dashboardLayout": DASH_LAYOUT, "dashletsOptions": DASH_OPTIONS, "useCustomTabList": False, "theme": ""})
    roles = call("GET", "Role?maxSize=50&select=id,name")["list"]
    # el calendario debe estar disponible para los tres roles
    for r in roles:
        if r["name"] in ("Comercial", "Director de Equipo", "Gerente General"):
            data = call("GET", f"Role/{r['id']}")["data"]
            data["Calendar"] = True
            call("PUT", f"Role/{r['id']}", {"data": data})
    # campañas: gerente gestiona, director las ve (de su equipo), comercial no
    CAMP = {"Gerente General": ("yes", "all", "all", "all"), "Director de Equipo": ("no", "team", "no", "no")}
    for r in roles:
        if r["name"] in CAMP:
            c_, rd, ed, dl = CAMP[r["name"]]
            data = call("GET", f"Role/{r['id']}")["data"]
            data["Campaign"] = {"create": c_, "read": rd, "edit": ed, "delete": dl, "stream": rd}
            call("PUT", f"Role/{r['id']}", {"data": data})
    # el usuario API del Hub necesita leer campañas para ligar los leads que llegan por formularios
    api_role = next((r for r in roles if r["name"].startswith("Integración API")), None)
    if api_role:
        data = call("GET", f"Role/{api_role['id']}")["data"]
        data["Campaign"] = {"create": "no", "read": "all", "edit": "no", "delete": "no", "stream": "no"}
        data["User"] = {"read": "all"}
        # el servicio crea llamadas/leads a nombre de un asesor: necesita poder asignar a cualquier usuario
        call("PUT", f"Role/{api_role['id']}", {"data": data, "assignmentPermission": "all", "userPermission": "all"})
    print("ui aplicada")
