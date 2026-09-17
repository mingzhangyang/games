# -*- coding: utf-8 -*-
"""Regenerate PWA icons: #667eea rounded-square + white gamepad, matching favicon SVG."""
from PIL import Image, ImageDraw
import os

OUT = 'C:/Users/mingz/Codes/games/public/icons'

BG_TOP = (124, 140, 250)    # lighter indigo
BG_BOT = (92, 106, 235)     # favicon #667eea deep end

def make_gradient(w, h, top, bottom):
    g = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        g.putpixel((0, y), c)
    return g.resize((w, h))

def draw_gamepad(img, size, scale=1.0, cx=0.5, cy=0.5):
    """Draw the favicon gamepad motif (white body, indigo controls), scaled."""
    d = ImageDraw.Draw(img)
    u = size * scale          # unit space: favicon designed on 64
    ox, oy = size * cx - u / 2, size * cy - u / 2
    s = u / 64.0
    body = [12*s+ox, 22*s+oy, 52*s+ox, 44*s+oy]
    d.rounded_rectangle(body, radius=11*s, fill=(255, 255, 255, 255))
    # d-pad cross (indigo on white)
    lw = max(2, int(round(3.4 * s)))
    ic = BG_BOT
    d.line([22*s+ox, 27.5*s+oy, 22*s+ox, 38.5*s+oy], fill=ic, width=lw)
    d.line([16.5*s+ox, 33*s+oy, 27.5*s+ox, 33*s+oy], fill=ic, width=lw)
    r = 3*s
    for (ccx, ccy) in [(39, 29), (45, 36)]:
        d.ellipse([ccx*s+ox-r, ccy*s+oy-r, ccx*s+ox+r, ccy*s+oy+r], fill=ic)

def gen_any(size, fname):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    grad = make_gradient(size, size, BG_TOP, BG_BOT).convert('RGBA')
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size-1, size-1], radius=int(size*0.24), fill=255)
    img.paste(grad, (0, 0), mask)
    draw_gamepad(img, size, scale=1.0)
    img.save(os.path.join(OUT, fname))
    print('wrote', fname, img.size)

def gen_apple(size, fname):
    # fully opaque square — iOS applies its own mask
    img = make_gradient(size, size, BG_TOP, BG_BOT).convert('RGBA')
    draw_gamepad(img, size, scale=1.0)
    img.convert('RGB').save(os.path.join(OUT, fname))
    print('wrote', fname, img.size)

def gen_maskable(size, fname):
    # full-bleed opaque background; motif inside 66% center safe zone
    img = make_gradient(size, size, BG_TOP, BG_BOT).convert('RGBA')
    draw_gamepad(img, size, scale=0.62)
    img.save(os.path.join(OUT, fname))
    print('wrote', fname, img.size)

gen_any(192, 'icon-192.png')
gen_any(512, 'icon-512.png')
gen_maskable(512, 'icon-maskable-512.png')
gen_apple(180, 'apple-touch-icon.png')
