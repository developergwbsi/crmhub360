"""Marca genérica de DigitalAlliance Hub para los enlaces públicos que enviamos (presentaciones, videollamadas, bajas, formularios): favicon propio en vez del de la plataforma.
SVG para los navegadores modernos y PNG (generado con Pillow) de respaldo; las etiquetas <link> van incrustadas (data:) o apuntan a /favicon.svg y /favicon.ico del dominio de las salas."""
import base64
import functools
import urllib.parse

SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0891b2"/></linearGradient></defs>'
       '<rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="43" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" fill="#fff">DA</text></svg>')


@functools.lru_cache(maxsize=1)
def png() -> bytes:
    """Icono 64×64 en PNG: cuadrado redondeado con degradado y las letras «DA»."""
    import io
    from PIL import Image, ImageDraw, ImageFont
    n = 64
    g = Image.new("RGB", (n, n))
    px = g.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = (round(79 + (8 - 79) * t), round(70 + (145 - 70) * t), round(229 + (178 - 229) * t))
    mask = Image.new("L", (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, n - 1, n - 1), radius=14, fill=255)
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    out.paste(g, (0, 0), mask)
    d = ImageDraw.Draw(out)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    except OSError:
        f = ImageFont.load_default()
    w = d.textlength("DA", font=f)
    d.text(((n - w) / 2, 14), "DA", font=f, fill="white")
    b = io.BytesIO()
    out.save(b, "PNG")
    return b.getvalue()


def link_tags(inline: bool = True) -> str:
    """<link> del favicon: incrustado (autocontenido) o con rutas del dominio (/favicon.svg y /favicon.ico)."""
    if not inline:
        return '<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" sizes="64x64" href="/favicon.ico">'
    try:
        p = "data:image/png;base64," + base64.b64encode(png()).decode()
    except Exception:
        p = ""
    return (f'<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,{urllib.parse.quote(SVG)}">' + (f'<link rel="icon" type="image/png" sizes="64x64" href="{p}"><link rel="apple-touch-icon" href="{p}">' if p else ""))
