"""Imagen de la presentadora mientras no hay una cara realista (Simli): un orbe de marca con su inicial y anillos que laten con la voz, como un asistente de voz moderno.
Se dibuja al doble de tamaño y se reduce para suavizar los bordes. Devuelve fotogramas RGBA para publicarlos como cámara en la sala."""
import math

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 480
S = 2   # factor de sobremuestreo
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _bg() -> Image.Image:
    im = Image.new("RGB", (W * S, H * S))
    d = ImageDraw.Draw(im)
    for y in range(H * S):   # degradado índigo profundo
        t = y / (H * S)
        d.line([(0, y), (W * S, y)], fill=(int(20 + 18 * t), int(18 + 14 * t), int(64 + 30 * t)))
    return im


def _orb(r: int) -> Image.Image:
    """Esfera con degradado índigo → cian y un brillo arriba a la izquierda."""
    n = r * 2
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = im.load()
    for y in range(n):
        for x in range(n):
            dx, dy = (x - r) / r, (y - r) / r
            d2 = dx * dx + dy * dy
            if d2 <= 1.0:
                t = min(1.0, max(0.0, (dx * 0.6 + dy * 0.8 + 1) / 2))
                hl = max(0.0, 1 - ((dx + 0.35) ** 2 + (dy + 0.4) ** 2) / 0.55) * 0.35
                c = (int(99 + (14 - 99) * t + 255 * hl), int(102 + (165 - 102) * t + 255 * hl), int(241 + (233 - 241) * t + 255 * hl))
                px[x, y] = (min(255, c[0]), min(255, c[1]), min(255, c[2]), 255)
    return im


class Avatar:
    def __init__(self, name: str = "Valeria", role: str = "Asistente virtual"):
        self.name, self.role = name, role
        self.base = _bg()
        self.r = 105 * S
        self.orb = _orb(self.r)
        self.f_ini = ImageFont.truetype(FONT_B, 118 * S)
        self.f_name = ImageFont.truetype(FONT_B, 22 * S)
        self.f_role = ImageFont.truetype(FONT_R, 14 * S)
        self.ini = (name.strip()[:1] or "V").upper()
        self._lvl = 0.0

    def frame(self, t: float, mouth: float, speaking: bool) -> bytes:
        """Fotograma en el instante t (s). `mouth` 0..1 es el volumen de la voz."""
        self._lvl += (max(0.0, min(1.0, mouth)) - self._lvl) * 0.45   # suaviza el volumen
        lvl = self._lvl
        im = self.base.copy().convert("RGBA")
        cx, cy = W * S // 2, 205 * S
        breath = 1 + 0.015 * math.sin(t * 1.4)
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        for i, (grow, alpha) in enumerate(((0.55, 70), (1.0, 46), (1.5, 28))):   # anillos que laten con la voz
            rr = self.r * (1.18 + 0.2 * i) * breath + lvl * grow * 38 * S * (1 + 0.25 * math.sin(t * 7 + i))
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(129, 140, 248, alpha), width=(3 if i == 0 else 2) * S)
        im = Image.alpha_composite(im, ov)
        rr = int(self.r * breath * (1 + lvl * 0.05))
        orb = self.orb.resize((rr * 2, rr * 2), Image.LANCZOS)
        im.alpha_composite(orb, (cx - rr, cy - rr))
        d = ImageDraw.Draw(im)
        bb = d.textbbox((0, 0), self.ini, font=self.f_ini)
        d.text((cx - (bb[0] + bb[2]) / 2, cy - (bb[1] + bb[3]) / 2), self.ini, font=self.f_ini, fill=(255, 255, 255, 235))
        if speaking:   # barras de voz bajo el orbe
            for i in range(-3, 4):
                h = (8 + (10 + 46 * lvl) * abs(math.sin(t * 8 + i * 0.9))) * S
                x = cx + i * 16 * S
                d.rounded_rectangle([x - 4 * S, 345 * S - h / 2, x + 4 * S, 345 * S + h / 2], radius=4 * S, fill=(165, 180, 252, 255))
        d.rounded_rectangle([W * S // 2 - 150 * S, 392 * S, W * S // 2 + 150 * S, 456 * S], radius=16 * S, fill=(15, 23, 42, 235))
        bn = d.textbbox((0, 0), self.name, font=self.f_name)
        d.text((W * S // 2 - (bn[2] - bn[0]) / 2, 400 * S), self.name, font=self.f_name, fill=(255, 255, 255, 255))
        br = d.textbbox((0, 0), self.role, font=self.f_role)
        d.text((W * S // 2 - (br[2] - br[0]) / 2, 430 * S), self.role, font=self.f_role, fill=(165, 180, 252, 255))
        return im.resize((W, H), Image.LANCZOS).convert("RGBA").tobytes()
