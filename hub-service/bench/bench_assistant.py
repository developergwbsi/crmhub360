"""Compara calidad narrativa (sentimiento / borrador) y alucinación entre modelos."""
import json, sys, time, urllib.request

CONV = "[WhatsApp] Cliente: Hola, quiero un crédito de 20 millones para vehículo, pero me preocupa la cuota mensual"
SYS = ("Analiza el sentimiento y la intención de compra del cliente. Responde en español con: Sentimiento "
       "(positivo/neutro/negativo), Nivel de interés (alto/medio/bajo) y una frase de justificación. "
       "No inventes datos que no estén en la conversación.")
for m in sys.argv[1:]:
    b = {"model": m, "stream": False, "options": {"temperature": 0.3},
         "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": "Conversación:\n" + CONV}]}
    t = time.time()
    r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:11434/api/chat", json.dumps(b).encode()), timeout=600)
    print(f"--- {m} ({time.time()-t:.0f}s)\n{json.loads(r.read())['message']['content'].strip()}\n")
