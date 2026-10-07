"""Benchmark de modelos Ollama para extracción de historias de crédito.
Uso: python bench_models.py modelo1 modelo2 ...  (OLLAMA_URL por env)"""
import json, os, sys, time, urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("DATABASE_URL", "x"); os.environ.setdefault("HUB_ADMIN_TOKEN", "x")
from app.credit import SCHEMA, SYSTEM  # noqa: E402

URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")

CASES = [
    ("sin mora", """HISTORIA DE CREDITO PERSONA NATURAL
Nombre: ANDRES FELIPE RAMIREZ   CC 80.123.456
Puntaje Score: 812   (Rango 150-950)
RESUMEN DE OBLIGACIONES
Entidad            Tipo        Cupo/Valor     Saldo        Mora   Estado
BANCOLOMBIA        T.Credito   10.000.000     2.450.000    0      AL DIA
DAVIVIENDA         Hipotecario 150.000.000    98.300.000   0      AL DIA
FALABELLA          Consumo     5.000.000      1.250.000    0      AL DIA
Total saldo obligaciones: $ 102.000.000
Total saldo en mora: $ 0
Consultas ultimos 6 meses: 2""", dict(score=812, total=102_000_000, overdue=0, creditors=3)),
    ("con mora", """CIFIN / DATACREDITO - REPORTE INFORMATIVO
Titular: MARTHA LUCIA GOMEZ  CC 52.987.654
Score: 538
OBLIGACIONES VIGENTES
BANCO DE BOGOTA  Libre inversion  Saldo: 12.800.000  Mora: 3.200.000  (60 dias)  ESTADO: EN MORA
CLARO COLOMBIA   Telefonia        Saldo: 890.000     Mora: 890.000    (120 dias) ESTADO: CASTIGADA
ADDI             Consumo          Saldo: 1.500.000   Mora: 0                      ESTADO: AL DIA
TOTAL DEUDA: $ 15.190.000   TOTAL EN MORA: $ 4.090.000""", dict(score=538, total=15_190_000, overdue=4_090_000, creditors=3)),
    ("sin score", """REPORTE DE CREDITO
Titular: PEDRO NEL SUAREZ  CC 79.111.222
Puntaje: No disponible (historial insuficiente)
Obligaciones: ninguna reportada
Total deuda: $ 0   Total mora: $ 0""", dict(score=None, total=0, overdue=0, creditors=0)),
]


def run(model, text):
    body = {"model": model, "stream": False, "format": SCHEMA, "options": {"temperature": 0},
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}]}
    req = urllib.request.Request(f"{URL}/api/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=900) as r:
        out = json.loads(r.read())
    return json.loads(out["message"]["content"]), time.time() - t


for model in sys.argv[1:]:
    ok = n = 0; total_t = 0
    for name, text, gt in CASES:
        try:
            d, dt = run(model, text)
        except Exception as e:
            print(f"{model:24} {name:10} ERROR {e}"); n += 4; continue
        total_t += dt
        checks = {"score": d.get("score") == gt["score"],
                  "total": (d.get("total_debt") or 0) == gt["total"],
                  "mora": (d.get("overdue_debt") or 0) == gt["overdue"],
                  "acreedores": len(d.get("obligations") or []) == gt["creditors"]}
        ok += sum(checks.values()); n += 4
        print(f"{model:24} {name:10} {dt:6.1f}s " + " ".join(f"{k}={'OK' if v else 'X'}" for k, v in checks.items()))
    print(f"==> {model}: {ok}/{n} aciertos, {total_t:.0f}s totales\n")
