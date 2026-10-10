"""Uygulama ikonlarını üretir: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

BG = (79, 70, 229, 255)  # indigo-600
FG = (255, 255, 255, 255)
S = 1024


def bell(draw, cx, cy, size, color):
    w = size
    # gövde
    top = cy - w * 0.42
    draw.ellipse([cx - w * 0.30, top, cx + w * 0.30, top + w * 0.60], fill=color)
    draw.polygon(
        [(cx - w * 0.30, cy - w * 0.12), (cx + w * 0.30, cy - w * 0.12),
         (cx + w * 0.40, cy + w * 0.22), (cx - w * 0.40, cy + w * 0.22)],
        fill=color,
    )
    draw.rounded_rectangle([cx - w * 0.44, cy + w * 0.16, cx + w * 0.44, cy + w * 0.28], radius=w * 0.06, fill=color)
    # tokmak
    draw.ellipse([cx - w * 0.09, cy + w * 0.30, cx + w * 0.09, cy + w * 0.46], fill=color)
    # tepe
    draw.ellipse([cx - w * 0.05, top - w * 0.07, cx + w * 0.05, top + w * 0.03], fill=color)


def app_icon(scale):
    img = Image.new("RGBA", (S, S), BG)
    bell(ImageDraw.Draw(img), S / 2, S / 2, S * scale, FG)
    return img


def save(img, path, size):
    img.resize((size, size), Image.LANCZOS).save(path)


full = app_icon(0.62)
save(full, "public/icon-192.png", 192)
save(full, "public/icon-512.png", 512)
save(full.convert("RGB"), "src/app/apple-icon.png", 180)
save(full, "src/app/icon.png", 64)
# maskable: güvenli alan için daha küçük çizim
save(app_icon(0.48), "public/icon-maskable-512.png", 512)
# Android durum çubuğu rozeti: şeffaf zemin, tek renk
badge = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bell(ImageDraw.Draw(badge), S / 2, S / 2, S * 0.8, FG)
save(badge, "public/badge-96.png", 96)
