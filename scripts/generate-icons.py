#!/usr/bin/env python3
"""
VUNBY — Gerador de ícones PWA
Requer: pip install Pillow

Gera os ícones a partir de um PNG base (logo.png) na mesma pasta.
Coloque o arquivo logo.png nesta pasta e execute:
  python3 generate-icons.py

Os ícones serão salvos em ../public/icons/
"""

import os
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERRO: Pillow não instalado. Execute: pip install Pillow")
    exit(1)

SCRIPT_DIR = Path(__file__).parent
INPUT = SCRIPT_DIR / "logo.png"
OUTPUT_DIR = SCRIPT_DIR.parent / "public" / "icons"

ICONS = [
    ("icon-192.png",          192, False),
    ("icon-512.png",          512, False),
    ("icon-192-maskable.png", 192, True),
    ("icon-512-maskable.png", 512, True),
    ("apple-touch-icon.png",  180, False),
    ("favicon-32.png",         32, False),
]

def make_maskable(img, size):
    """Adiciona padding de 20% para área segura do maskable icon"""
    padding = int(size * 0.1)
    inner_size = size - padding * 2
    # Fundo azul-marinho VUNBY
    bg = Image.new("RGBA", (size, size), "#003D6B")
    logo = img.resize((inner_size, inner_size), Image.LANCZOS)
    bg.paste(logo, (padding, padding), logo if logo.mode == "RGBA" else None)
    return bg

def main():
    if not INPUT.exists():
        print(f"ERRO: {INPUT} não encontrado.")
        print("Coloque o arquivo logo.png na pasta scripts/ e execute novamente.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.open(INPUT).convert("RGBA")

    for filename, size, maskable in ICONS:
        out_path = OUTPUT_DIR / filename
        if maskable:
            icon = make_maskable(img, size)
        else:
            icon = img.resize((size, size), Image.LANCZOS)
        icon.save(str(out_path), "PNG")
        print(f"✓ {filename} ({size}x{size})")

    print(f"\nÍcones salvos em: {OUTPUT_DIR}")
    print("Lembre de substituir o logo.png pela logo oficial do VUNBY!")

if __name__ == "__main__":
    main()
