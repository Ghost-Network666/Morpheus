#!/usr/bin/env python3
"""
Generate placeholder app icons for Morpheus desktop.
Requires Pillow: pip install Pillow
Creates: assets/icon.png (1024x1024), icon.ico (Windows), icon.icns (macOS stub)
"""
import os
import struct
import zlib

ASSETS = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(ASSETS, exist_ok=True)


def _png_chunk(name: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", crc)


def make_png(size: int, path: str):
    """Minimal valid PNG — solid #1e1e2e square with a centered ◈ glyph approximated."""
    # Use stdlib only; draw a simple gradient square
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGBA", (size, size), (30, 30, 46, 255))
        draw = ImageDraw.Draw(img)
        # Outer circle
        margin = size // 8
        draw.ellipse([margin, margin, size - margin, size - margin], fill=(203, 166, 247, 255))
        # Inner dark circle
        m2 = size // 4
        draw.ellipse([m2, m2, size - m2, size - m2], fill=(30, 30, 46, 255))
        # Diamond
        cx, cy, r = size // 2, size // 2, size // 5
        draw.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(203, 166, 247, 255))
        img.save(path)
        return
    except ImportError:
        pass

    # Fallback: 1-pixel solid PNG (valid but tiny)
    r, g, b = 30, 30, 46
    pixels = bytes([r, g, b] * size)  # one row
    raw = b"".join(b"\x00" + pixels for _ in range(size))
    compressed = zlib.compress(raw)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


def make_ico(png_path: str, ico_path: str):
    """Wrap the 256x256 PNG into an .ico file."""
    with open(png_path, "rb") as f:
        png_data = f.read()
    # ICO header
    header = struct.pack("<HHH", 0, 1, 1)  # reserved, type=1 (ICO), count=1
    # Directory entry: 0x00 = 256 for width/height
    entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png_data), 22)
    with open(ico_path, "wb") as f:
        f.write(header + entry + png_data)


def make_icns_stub(png_path: str, icns_path: str):
    """Minimal .icns wrapping a 1024x1024 PNG (ic10 atom)."""
    with open(png_path, "rb") as f:
        png_data = f.read()
    atom_type = b"ic10"  # 1024x1024 PNG
    atom_size = 8 + len(png_data)
    file_size = 8 + atom_size
    with open(icns_path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", file_size))
        f.write(atom_type + struct.pack(">I", atom_size) + png_data)


if __name__ == "__main__":
    print("Generating icons…")
    big = os.path.join(ASSETS, "icon.png")
    small = os.path.join(ASSETS, "icon-256.png")

    make_png(1024, big)
    make_png(256, small)
    make_ico(small, os.path.join(ASSETS, "icon.ico"))
    make_icns_stub(big, os.path.join(ASSETS, "icon.icns"))

    # Placeholder DMG background
    make_png(640, os.path.join(ASSETS, "dmg-bg.png"))

    print("Done. Icons written to assets/")
