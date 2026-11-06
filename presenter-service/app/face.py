"""Retrato animado de la presentadora: una mujer colombiana profesional INVENTADA (no es el rostro de ninguna persona real), dibujado por capas con sombras y luces suaves.
El retrato estático se prepara una sola vez; en cada fotograma solo se dibujan lo que se mueve: boca (según el volumen de la voz), parpadeo y un leve balanceo de la cabeza."""
import math
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H = 640, 480
S = 2
PAD = 12
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CX = 320

SKIN = (224, 166, 129)
SKIN_HI = (241, 196, 162)
SKIN_SH = (186, 122, 92)
HAIR = (44, 26, 20)
HAIR_HI = (112, 68, 44)
LIP_U = (168, 62, 72)
LIP_L = (190, 82, 90)


def sp(p):
    return (p[0] * S, p[1] * S)


def bez(p0, p1, p2, p3, n=24):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t ** 2
        d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def spline(pts, n=10):
    """Curva suave (Catmull-Rom) que pasa por los puntos."""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    out.append(pts[-1])
    return out


def mirror(pts):
    return [(2 * CX - x, y) for x, y in pts]


def layer(size):
    return Image.new("RGBA", size, (0, 0, 0, 0))


def blur_add(base, draw_fn, radius, size):
    """Dibuja algo en una capa transparente, la desenfoca y la suma al retrato (para sombras y luces suaves)."""
    ly = layer(size)
    draw_fn(ImageDraw.Draw(ly))
    return Image.alpha_composite(base, ly.filter(ImageFilter.GaussianBlur(radius * S)))


def ell(d, c, rx, ry, fill):
    d.ellipse([(c[0] - rx) * S, (c[1] - ry) * S, (c[0] + rx) * S, (c[1] + ry) * S], fill=fill)


def poly(d, pts, fill):
    d.polygon([sp(p) for p in pts], fill=fill)


def line(d, pts, fill, w):
    d.line([sp(p) for p in pts], fill=fill, width=int(w * S), joint="curve")


def background(size):
    im = Image.new("RGB", size)
    d = ImageDraw.Draw(im)
    for y in range(size[1]):
        t = y / size[1]
        d.line([(0, y), (size[0], y)], fill=(int(24 + 24 * t), int(22 + 20 * t), int(72 + 36 * t)))
    im = im.convert("RGBA")
    for cx, cy, r, a, col in ((120, 110, 130, 60, (129, 140, 248)), (540, 90, 95, 50, (56, 189, 248)), (560, 330, 160, 44, (129, 140, 248)), (60, 380, 110, 40, (56, 189, 248))):
        im = blur_add(im, lambda d, cx=cx, cy=cy, r=r, a=a, col=col: ell(d, (cx, cy), r, r, col + (a,)), 14, size)
    return im


class Face:
    def __init__(self, name: str = "Valeria", role: str = "Asistente virtual"):
        self.name, self.role = name, role
        self.size = ((W + 2 * PAD) * S, (H + 2 * PAD) * S)
        self.f_name = ImageFont.truetype(FONT_B, 20 * S)
        self.f_role = ImageFont.truetype(FONT_R, 13 * S)
        self.f_name1 = ImageFont.truetype(FONT_B, 20)
        self.f_role1 = ImageFont.truetype(FONT_R, 13)
        self.static = self._build()
        self._lvl = 0.0
        self._blink_at = 1.8
        self._blink_until = 0.0

    # ---------- retrato estático
    def _build(self) -> Image.Image:
        size = self.size
        im = background(size)
        O = (PAD, PAD)

        def shift(pts):
            return [(x + O[0], y + O[1]) for x, y in pts]
        # cabello de atrás
        def hair_back(d):
            right = spline([(CX + 4, 70), (CX + 78, 80), (CX + 122, 130), (CX + 132, 210), (CX + 140, 300), (CX + 128, 380), (CX + 150, 440), (CX + 90, 470)])
            left = mirror(right)
            poly(d, [(x + O[0], y + O[1]) for x, y in right + left[::-1]], HAIR + (255,))
        ly = layer(size)
        hair_back(ImageDraw.Draw(ly))
        im = Image.alpha_composite(im, ly)

        def hl(d):
            for sx, pts in ((1, [(CX + 112, 150), (CX + 126, 230), (CX + 118, 320)]), (-1, [(CX - 112, 150), (CX - 126, 230), (CX - 118, 320)]), (1, [(CX + 96, 340), (CX + 110, 400)]), (-1, [(CX - 96, 340), (CX - 110, 400)])):
                line(d, shift(spline(pts)), HAIR_HI + (150,), 7)
        im = blur_add(im, hl, 5, size)
        im = blur_add(im, lambda d: (ell(d, (CX - 34 + O[0], 92 + O[1]), 50, 9, HAIR_HI + (120,)), ell(d, (CX - 120 + O[0], 330 + O[1]), 9, 60, HAIR_HI + (90,)), ell(d, (CX + 120 + O[0], 330 + O[1]), 9, 60, HAIR_HI + (90,))), 7, size)
        # cuello con sombra bajo la barbilla
        ly = layer(size)
        d = ImageDraw.Draw(ly)
        poly(d, shift([(CX - 30, 255), (CX + 30, 255), (CX + 40, 345), (CX - 40, 345)]), (214, 154, 120, 255))
        ly = ly.filter(ImageFilter.GaussianBlur(1.2 * S))
        im = Image.alpha_composite(im, ly)
        im = blur_add(im, lambda d: (ell(d, (CX - 36 + O[0], 315 + O[1]), 10, 36, (120, 70, 54, 70)), ell(d, (CX + 36 + O[0], 315 + O[1]), 10, 36, (120, 70, 54, 70))), 8, size)
        im = blur_add(im, lambda d: ell(d, (CX + O[0], 298 + O[1]), 50, 16, (96, 52, 40, 105)), 7, size)
        # hombros, saco, blusa, collar
        ly = layer(size)
        d = ImageDraw.Draw(ly)
        poly(d, shift(spline([(CX - 215, 480), (CX - 200, 392), (CX - 120, 350), (CX - 50, 336), (CX + 50, 336), (CX + 120, 350), (CX + 200, 392), (CX + 215, 480)])), (30, 40, 82, 255))
        poly(d, shift([(CX - 34, 336), (CX + 34, 336), (CX, 410)]), (243, 238, 230, 255))
        poly(d, shift([(CX - 50, 336), (CX - 30, 336), (CX - 2, 412), (CX - 40, 480), (CX - 82, 480)]), (22, 30, 64, 255))
        poly(d, shift([(CX + 50, 336), (CX + 30, 336), (CX + 2, 412), (CX + 40, 480), (CX + 82, 480)]), (22, 30, 64, 255))
        line(d, shift(spline([(CX - 24, 342), (CX - 12, 366), (CX, 372), (CX + 12, 366), (CX + 24, 342)])), (222, 184, 98, 255), 1.6)
        ell(d, (CX + O[0], 374 + O[1]), 3.2, 3.2, (222, 184, 98, 255))
        im = Image.alpha_composite(im, ly)
        # cara
        right = [(CX, 92), (CX + 36, 97), (CX + 70, 120), (CX + 82, 160), (CX + 80, 205), (CX + 68, 240), (CX + 46, 270), (CX + 22, 288), (CX, 292)]
        outline = spline(right)
        face_pts = shift(outline + mirror(outline)[::-1])
        ly = layer(size)
        poly(ImageDraw.Draw(ly), face_pts, SKIN + (255,))
        fmask = ly.getchannel("A")
        im = Image.alpha_composite(im, ly)

        def clip(fn, radius, base):
            nonlocal im
            t = layer(size)
            fn(ImageDraw.Draw(t))
            t = t.filter(ImageFilter.GaussianBlur(radius * S))
            t.putalpha(ImageChops.multiply(t.getchannel("A"), fmask))
            im = Image.alpha_composite(im, t)
        clip(lambda d: (ell(d, (CX - 88 + O[0], 232 + O[1]), 30, 70, SKIN_SH + (95,)), ell(d, (CX + 88 + O[0], 232 + O[1]), 30, 70, SKIN_SH + (95,))), 16, SKIN)   # sombra de los lados
        clip(lambda d: ell(d, (CX + O[0], 272 + O[1]), 70, 24, SKIN_SH + (75,)), 12, SKIN)                                   # sombra de la mandíbula
        clip(lambda d: ell(d, (CX + O[0], 128 + O[1]), 44, 24, SKIN_HI + (120,)), 14, SKIN)                                   # luz en la frente
        clip(lambda d: (ell(d, (CX - 40 + O[0], 212 + O[1]), 22, 14, SKIN_HI + (90,)), ell(d, (CX + 40 + O[0], 212 + O[1]), 22, 14, SKIN_HI + (90,))), 9, SKIN)   # pómulos
        clip(lambda d: ell(d, (CX + O[0], 202 + O[1]), 6, 28, SKIN_HI + (110,)), 5, SKIN)                                     # puente de la nariz
        clip(lambda d: (ell(d, (CX - 44 + O[0], 232 + O[1]), 19, 12, (232, 120, 120, 48)), ell(d, (CX + 44 + O[0], 232 + O[1]), 19, 12, (232, 120, 120, 48))), 9, SKIN)   # rubor
        clip(lambda d: (ell(d, (CX - 38 + O[0], 178 + O[1]), 26, 11, (120, 70, 60, 64)), ell(d, (CX + 38 + O[0], 178 + O[1]), 26, 11, (120, 70, 60, 64))), 6, SKIN)   # sombra de ojos
        # nariz: sombras laterales y fosas
        clip(lambda d: (ell(d, (CX - 15 + O[0], 232 + O[1]), 4, 14, (120, 70, 56, 50)), ell(d, (CX + 15 + O[0], 232 + O[1]), 4, 14, (120, 70, 56, 50))), 3, SKIN)
        clip(lambda d: (ell(d, (CX - 8 + O[0], 242 + O[1]), 3.6, 2.4, (70, 34, 28, 150)), ell(d, (CX + 8 + O[0], 242 + O[1]), 3.6, 2.4, (70, 34, 28, 150))), 1.2, SKIN)
        clip(lambda d: ell(d, (CX + O[0], 238 + O[1]), 5, 4, SKIN_HI + (140,)), 2, SKIN)
        # ojos y cejas
        e = layer(size)
        for sd in (-1, 1):
            e = _eye_into(e, size, sd, O)
        im = Image.alpha_composite(im, e)
        for sd in (-1, 1):
            im = draw_brow_offset(im, size, sd, O)
        # cabello de adelante, con raya al medio y mechones sobre las sienes
        ly = layer(size)
        d = ImageDraw.Draw(ly)
        for sd in (-1, 1):
            outer = spline([(CX, 84), (CX + sd * 40, 90), (CX + sd * 78, 118), (CX + sd * 96, 170), (CX + sd * 100, 240), (CX + sd * 104, 300)])
            inner = spline([(CX + sd * 82, 300), (CX + sd * 84, 236), (CX + sd * 78, 176), (CX + sd * 62, 134), (CX + sd * 34, 110), (CX, 96)])
            poly(d, shift(outer + inner), HAIR + (255,))
        im = Image.alpha_composite(im, ly)

        def hl2(d):
            for sd in (-1, 1):
                line(d, shift(spline([(CX + sd * 30, 98), (CX + sd * 62, 114), (CX + sd * 86, 160), (CX + sd * 92, 230)])), HAIR_HI + (150,), 4)
                line(d, shift(spline([(CX + sd * 52, 100), (CX + sd * 80, 130), (CX + sd * 94, 190)])), HAIR_HI + (90,), 2)
        im = blur_add(im, hl2, 2.2, size)
        return im

    # ---------- fotograma
    def frame(self, t: float, level: float, speaking: bool) -> bytes:
        self._lvl += (max(0.0, min(1.0, level)) - self._lvl) * 0.5
        m = self._lvl
        sway = math.sin(t * 0.8) * 2.0
        bob = math.sin(t * 1.3) * 1.2 + (m * 1.5 if speaking else 0)
        im = self.static.copy()
        d = ImageDraw.Draw(im)
        O = (PAD, PAD)
        draw_mouth(im, m, O)
        if t >= self._blink_at:
            self._blink_until = t + 0.15
            self._blink_at = t + random.uniform(2.4, 5.2)
        if t < self._blink_until:
            draw_blink(im, O)
        Z = 1.28   # encuadre: la cabeza llena más el cuadro
        cw, ch = W / Z, H / Z
        x0, y0 = PAD + CX - cw / 2 - sway, PAD + 262 - ch / 2 - bob
        out = im.crop((int(x0 * S), int(y0 * S), int((x0 + cw) * S), int((y0 + ch) * S))).resize((W, H), Image.BILINEAR)
        d = ImageDraw.Draw(out)
        d.rounded_rectangle([14, 414, 300, 468], radius=14, fill=(15, 23, 42, 225))
        d.text((28, 418), self.name, font=self.f_name1, fill=(255, 255, 255, 255))
        d.text((28, 444), self.role, font=self.f_role1, fill=(165, 180, 252, 255))
        if speaking:
            for i in range(3):
                h = 6 + 8 * abs(math.sin(t * 9 + i * 1.3))
                d.rounded_rectangle([268 + i * 9, 441 - h / 2, 272 + i * 9, 441 + h / 2], radius=2, fill=(129, 140, 248, 255))
        return out.convert("RGBA").tobytes()


def _eye_into(base, size, side, O):
    ox, oy = O
    inner, outer = 17, 58
    ey = 186
    pt = lambda x, y: (x + ox, y + oy)
    upper = [pt(*p) for p in bez((CX + side * inner, ey + 3), (CX + side * 27, ey - 12), (CX + side * 47, ey - 12), (CX + side * outer, ey - 1))]
    lower = [pt(*p) for p in bez((CX + side * outer, ey - 1), (CX + side * 48, ey + 9), (CX + side * 28, ey + 10), (CX + side * inner, ey + 3))]
    shape = upper + lower
    ly = layer(size)
    d = ImageDraw.Draw(ly)
    poly(d, shape, (246, 241, 238, 255))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon([sp(p) for p in shape], fill=255)
    iris = layer(size)
    di = ImageDraw.Draw(iris)
    ic = (CX + side * 36 + ox, ey + oy)
    for r, col in ((10.5, (58, 34, 22)), (9.2, (96, 58, 36)), (7.6, (128, 80, 48)), (5.6, (110, 66, 40))):
        ell(di, ic, r, r, col + (255,))
    ell(di, (ic[0], ic[1] + 3), 5, 3, (170, 118, 74, 120))
    ell(di, ic, 4.2, 4.2, (14, 8, 6, 255))
    ell(di, (ic[0] - 3, ic[1] - 3.4), 2.2, 2.2, (255, 255, 255, 235))
    ell(di, (ic[0] + 3.2, ic[1] + 2.6), 1.1, 1.1, (255, 255, 255, 150))
    iris.putalpha(ImageChops.multiply(iris.getchannel("A"), mask))
    ly = Image.alpha_composite(ly, iris)
    sh = layer(size)
    ImageDraw.Draw(sh).polygon([sp(p) for p in upper + [pt(CX + side * outer, ey - 6), pt(CX + side * inner, ey - 3)]], fill=(60, 30, 20, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(2 * S))
    sh.putalpha(ImageChops.multiply(sh.getchannel("A"), mask))
    ly = Image.alpha_composite(ly, sh)
    base = Image.alpha_composite(base, ly)
    d = ImageDraw.Draw(base)
    crease = [pt(*p) for p in bez((CX + side * (inner + 6), ey - 4), (CX + side * 28, ey - 19), (CX + side * 46, ey - 19), (CX + side * (outer + 1), ey - 6))]
    line(d, crease, (150, 96, 74, 150), 1.4)
    line(d, upper + [pt(CX + side * (outer + 4), ey - 5)], (22, 12, 10, 255), 3.0)
    for k in range(4):
        p = upper[int((0.6 + k * 0.1) * (len(upper) - 1))]
        line(d, [p, (p[0] + side * 2.5, p[1] - 3.5)], (22, 12, 10, 235), 1.0)
    line(d, lower[2:-2], (90, 54, 42, 120), 1.0)
    return base


def draw_brow_offset(im, size, side, O):
    ox, oy = O
    ly = layer(size)
    d = ImageDraw.Draw(ly)
    top = bez((CX + side * 17 + ox, 164 + oy), (CX + side * 28 + ox, 153 + oy), (CX + side * 46 + ox, 150 + oy), (CX + side * 64 + ox, 160 + oy))
    bot = bez((CX + side * 64 + ox, 160 + oy), (CX + side * 46 + ox, 156 + oy), (CX + side * 28 + ox, 158 + oy), (CX + side * 17 + ox, 169 + oy))
    poly(d, top + bot, (48, 30, 24, 255))
    return Image.alpha_composite(im, ly.filter(ImageFilter.GaussianBlur(0.8 * S)))


def draw_blink(im, O):
    """Párpados cerrados sobre los ojos abiertos (pliegue + pestañas)."""
    ox, oy = O
    d = ImageDraw.Draw(im)
    for side in (-1, 1):
        inner, outer, ey = 17, 58, 186
        up = [(x + ox, y + oy) for x, y in bez((CX + side * inner, ey + 3), (CX + side * 27, ey - 12), (CX + side * 47, ey - 12), (CX + side * outer, ey - 1))]
        lo = [(x + ox, y + oy) for x, y in bez((CX + side * outer, ey - 1), (CX + side * 48, ey + 9), (CX + side * 28, ey + 10), (CX + side * inner, ey + 3))]
        poly(d, up + lo, (214, 154, 120, 255))
        line(d, [(x + ox, y + oy) for x, y in bez((CX + side * inner, ey + 3), (CX + side * 28, ey + 11), (CX + side * 48, ey + 10), (CX + side * (outer + 3), ey - 3))], (28, 16, 12, 255), 2.6)


def draw_mouth(im, m, O):
    """Labios que se abren con el volumen de la voz: cerrados, entreabiertos o abiertos con dientes y lengua."""
    ox, oy = O
    d = ImageDraw.Draw(im)
    my = 264
    narrow = 3 * m
    cl, cr = CX - 27 + narrow, CX + 27 - narrow
    h = 0 if m < 0.06 else 2 + 20 * m
    pt = lambda x, y: (x + ox, y + oy)
    up_top = [pt(*p) for p in spline([(cl, my), (CX - 13, my - 6), (CX - 5, my - 8.5), (CX, my - 6.5), (CX + 5, my - 8.5), (CX + 13, my - 6), (cr, my)])]
    up_bot = [pt(*p) for p in spline([(cr, my), (CX + 12, my + 1.5), (CX, my + 2), (CX - 12, my + 1.5), (cl, my)])]
    lo_top = [pt(*p) for p in spline([(cl, my), (CX - 12, my + 1.5 + h), (CX, my + 2 + h), (CX + 12, my + 1.5 + h), (cr, my)])]
    lo_bot = [pt(*p) for p in spline([(cr, my), (CX + 18, my + 12 + h), (CX, my + 16 + h), (CX - 18, my + 12 + h), (cl, my)])]
    if h > 0:
        mouth = [pt(*p) for p in spline([(cl, my), (CX - 12, my + 1.5), (CX, my + 2), (CX + 12, my + 1.5), (cr, my), (CX + 12, my + 1.5 + h), (CX, my + 2 + h), (CX - 12, my + 1.5 + h), (cl, my)])]
        poly(d, mouth, (92, 26, 36, 255))
        th = min(h * 0.5, 7)   # dientes de arriba
        poly(d, [pt(CX - 18, my + 2), pt(CX + 18, my + 2), pt(CX + 16, my + 2 + th), pt(CX - 16, my + 2 + th)], (248, 246, 244, 255))
        if h > 8:   # lengua
            poly(d, [pt(*p) for p in spline([(CX - 14, my + h), (CX - 6, my + h - 5), (CX + 6, my + h - 5), (CX + 14, my + h)])] + [pt(CX + 12, my + 1.5 + h), pt(CX - 12, my + 1.5 + h)], (200, 92, 104, 255))
    poly(d, lo_top + lo_bot, LIP_L + (255,))
    poly(d, up_top + up_bot, LIP_U + (255,))
    line(d, [pt(cl, my), pt(CX - 12, my + 1.2), pt(CX, my + 1.6), pt(CX + 12, my + 1.2), pt(cr, my)], (96, 30, 40, 255), 1.1) if h == 0 else None
    # brillo del labio inferior
    ell(d, (CX + ox, my + 8 + h + oy), 9, 1.8, (255, 214, 220, 150))
