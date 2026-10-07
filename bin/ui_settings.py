"""Ajustes de interfaz de Crm Hub 360 (tema, menú, dashboard). Se aplican al crear y con tenant:ui."""
import base64, json, sys, urllib.request

# Menú lateral, dashboard inicial y tema
TABS = [
    {"type": "divider", "id": "t1", "text": "Comercial"},
    "Lead",
    {"type": "url", "id": "t2", "text": "Pipeline", "url": "#Lead/kanban", "iconClass": "fas fa-columns", "aclScope": "Lead"},
    "Account", "Contact", "Opportunity",
    {"type": "divider", "id": "t3", "text": "Actividad"},
    "Task", "Meeting", "Call", "Calendar", "Email",
    {"type": "divider", "id": "t4", "text": "Ayuda"},
    {"type": "url", "id": "t5", "text": "Manual de usuario", "url": "client/custom/manual/index.html",
     "iconClass": "fas fa-book", "openInNewTab": True},
]
DASH_LAYOUT = [{"name": "Inicio", "layout": [
    {"id": "d-leads", "name": "Leads", "x": 0, "y": 0, "width": 3, "height": 5},
    {"id": "d-tasks", "name": "Tasks", "x": 3, "y": 0, "width": 1, "height": 5},
    {"id": "d-activities", "name": "Activities", "x": 0, "y": 5, "width": 2, "height": 4},
    {"id": "d-stream", "name": "Stream", "x": 2, "y": 5, "width": 2, "height": 4},
]}]
DASH_OPTIONS = {"d-leads": {"title": "Leads recientes", "entityType": "Lead", "sortBy": "createdAt", "asc": False,
                            "displayRecords": 10, "expandedLayout": {"rows": [[{"name": "name", "link": True}, {"name": "status"}, {"name": "preApprovalStatus"}]]}}}

UI_SETTINGS = {
    "theme": "CrmHub", "tabList": TABS, "quickCreateList": ["Lead", "Task", "Meeting", "Call"],
    "dashboardLayout": DASH_LAYOUT, "dashletsOptions": DASH_OPTIONS,
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
    print("ui aplicada")
