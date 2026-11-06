"""Avatar de la presentadora virtual: ilustración propia (no es el rostro de una persona real) animada con la voz: la boca se abre según el volumen,
parpadea y respira. Se dibuja al doble de tamaño y se reduce para suavizar los bordes. Devuelve fotogramas RGBA para publicarlos como cámara en la sala."""
import math
import random

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 480
S = 2   # factor de sobremuestreo
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _bg() -> Image.Image:
    im = Image.new("RGB", (W * S, H * S))
    d = ImageDraw.Draw(im)
    for y in range(H * S):   # degradado índigo → azul oscuro
        t = y / (H * S)
        d.line([(0, y), (W * S, y)], fill=(int(49 + 20 * t), int(46 + 26 * t), int(129 - 10 * t)))
    for cx, cy, r, a in ((90, 90, 150, 30), (560, 380, 190, 22), (520, 60, 90, 26)):   # círculos suaves de fondo
        ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(ov).ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=(129, 140, 248, a))
        im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    return im


class Avatar:
    def __init__(self, name: str = "Valeria", role: str = "Asistente virtual"):
        self.name, self.role = name, role
        self.base = _bg()
        self._blink_at = 1.5
        self._blink_until = 0.0
        self.f_name = ImageFont.truetype(FONT_B, 20 * S)
        self.f_role = ImageFont.truetype(FONT_R, 13 * S)
        self.hair = (58, 36, 28)
        self.skin = (241, 201, 165)
        self.skin_sh = (224, 178, 142)

    def frame(self, t: float, mouth: float, speaking: bool) -> bytes:
        """Fotograma en el instante t (s). `mouth` 0..1 es cuánto abre la boca."""
        im = self.base.copy()
        d = ImageDraw.Draw(im)
        sway = math.sin(t * 0.9) * 2.5 * S     # balanceo suave de la cabeza
        breath = math.sin(t * 1.6) * 2 * S     # respiración
        cx, cy = 320 * S + sway, 215 * S
        # torso y saco
        d.ellipse([cx - 190 * S, 372 * S + breath, cx + 190 * S, 560 * S], fill=(30, 41, 80))
        d.polygon([(cx - 70 * S, 372 * S + breath), (cx, 450 * S + breath), (cx + 70 * S, 372 * S + breath)], fill=(245, 247, 255))
        d.polygon([(cx - 70 * S, 372 * S + breath), (cx - 16 * S, 372 * S + breath), (cx - 54 * S, 440 * S + breath)], fill=(22, 32, 66))
        d.polygon([(cx + 70 * S, 372 * S + breath), (cx + 16 * S, 372 * S + breath), (cx + 54 * S, 440 * S + breath)], fill=(22, 32, 66))
        # cuello
        d.rounded_rectangle([cx - 36 * S, 300 * S, cx + 36 * S, 382 * S + breath], radius=18 * S, fill=self.skin_sh)
        # pelo (atrás)
        d.ellipse([cx - 112 * S, cy - 128 * S, cx + 112 * S, cy + 150 * S], fill=self.hair)
        d.rounded_rectangle([cx - 112 * S, cy - 20 * S, cx + 112 * S, cy + 190 * S], radius=60 * S, fill=self.hair)
        # cara
        d.ellipse([cx - 88 * S, cy - 108 * S, cx + 88 * S, cy + 108 * S], fill=self.skin)
        d.ellipse([cx - 88 * S, cy + 40 * S, cx + 88 * S, cy + 118 * S], fill=self.skin)
        # flequillo
        d.pieslice([cx - 96 * S, cy - 124 * S, cx + 96 * S, cy + 40 * S], 180, 360, fill=self.hair)
        d.polygon([(cx - 96 * S, cy - 40 * S), (cx - 20 * S, cy - 88 * S), (cx + 40 * S, cy - 100 * S), (cx - 30 * S, cy - 30 * S)], fill=self.hair)
        # orejas / mejillas
        for sx in (-1, 1):
            d.ellipse([cx + sx * 88 * S - 12 * S, cy - 6 * S, cx + sx * 88 * S + 12 * S, cy + 34 * S], fill=self.skin_sh)
            d.ellipse([cx + sx * 52 * S - 20 * S, cy + 34 * S, cx + sx * 52 * S + 20 * S, cy + 58 * S], fill=(244, 170, 150))
        # ojos
        if t >= self._blink_at:
            self._blink_until = t + 0.14
            self._blink_at = t + random.uniform(2.2, 5.0)
        blink = t < self._blink_until
        ey = cy - 12 * S
        for sx in (-1, 1):
            ex = cx + sx * 36 * S
            if blink:
                d.arc([ex - 15 * S, ey - 6 * S, ex + 15 * S, ey + 10 * S], 0, 180, fill=(40, 28, 24), width=3 * S)
            else:
                d.ellipse([ex - 15 * S, ey - 11 * S, ex + 15 * S, ey + 11 * S], fill=(255, 255, 255))
                d.ellipse([ex - 8 * S, ey - 9 * S, ex + 8 * S, ey + 9 * S], fill=(70, 46, 32))
                d.ellipse([ex - 4 * S, ey - 5 * S, ex + 4 * S, ey + 3 * S], fill=(15, 10, 8))
                d.ellipse([ex - 6 * S, ey - 8 * S, ex - 1 * S, ey - 3 * S], fill=(255, 255, 255))
            d.arc([ex - 20 * S, ey - 30 * S, ex + 20 * S, ey - 6 * S], 200, 340, fill=self.hair, width=4 * S)   # ceja
        # nariz
        d.arc([cx - 9 * S, cy + 2 * S, cx + 9 * S, cy + 26 * S], 20, 160, fill=(205, 150, 118), width=2 * S)
        # boca: se abre con la voz
        my = cy + 66 * S
        m = max(0.0, min(1.0, mouth))
        if m < 0.06:
            d.arc([cx - 24 * S, my - 12 * S, cx + 24 * S, my + 10 * S], 15, 165, fill=(176, 72, 80), width=4 * S)
        else:
            hh = (5 + 22 * m) * S
            ww = (22 + 6 * m) * S
            d.ellipse([cx - ww, my - hh * 0.35, cx + ww, my + hh], fill=(120, 36, 48))
            if m > 0.25:
                d.rectangle([cx - ww * 0.62, my - hh * 0.32, cx + ww * 0.62, my + hh * 0.05], fill=(250, 248, 246))
            d.ellipse([cx - ww * 0.5, my + hh * 0.35, cx + ww * 0.5, my + hh * 0.95], fill=(214, 100, 112))
            d.arc([cx - ww, my - hh * 0.35 - 3 * S, cx + ww, my + hh * 0.2], 190, 350, fill=(176, 72, 80), width=3 * S)
        # indicador de voz y nombre
        d.rounded_rectangle([14 * S, 410 * S, 300 * S, 466 * S], radius=14 * S, fill=(15, 23, 42))
        d.text((28 * S, 416 * S), self.name, font=self.f_name, fill=(255, 255, 255))
        d.text((28 * S, 442 * S), self.role, font=self.f_role, fill=(165, 180, 252))
        if speaking:
            for i in range(3):
                h = (6 + 8 * abs(math.sin(t * 9 + i * 1.3))) * S
                d.rounded_rectangle([(270 + i * 9) * S, (438 - h / 2 / S) * S + 0, (274 + i * 9) * S, (438 + h / 2 / S) * S], radius=2 * S, fill=(129, 140, 248))
        small = im.resize((W, H), Image.LANCZOS)
        return small.convert("RGBA").tobytes()
