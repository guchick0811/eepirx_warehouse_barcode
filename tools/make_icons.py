"""產生 PWA 圖示（純 Python，不需額外套件）：深藍圓角底 + 白色條碼線條。
用法：python tools/make_icons.py
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "public" / "icons"
BG = (15, 23, 42)       # #0f172a
FG = (255, 255, 255)
ACCENT = (56, 189, 248)  # #38bdf8

# 條碼線條：(相對 x 起點, 相對寬度)，以 0~1 表示
BARS = [(0.18, 0.04), (0.25, 0.02), (0.30, 0.05), (0.38, 0.02), (0.43, 0.03), (0.49, 0.05),
        (0.57, 0.02), (0.62, 0.04), (0.69, 0.02), (0.74, 0.05), (0.82, 0.02)]


def pixel(x: float, y: float, size: int, maskable: bool):
    u, v = x / size, y / size
    # 圓角（maskable 版不留圓角，交給系統裁切）
    if not maskable:
        r = 0.2
        cx = min(max(u, r), 1 - r)
        cy = min(max(v, r), 1 - r)
        if (u - cx) ** 2 + (v - cy) ** 2 > r * r:
            return None
    # 條碼區域
    if 0.30 <= v <= 0.70:
        for bx, bw in BARS:
            if bx <= u < bx + bw:
                return FG
    # 掃描線
    if 0.49 <= v <= 0.515 and 0.12 <= u <= 0.88:
        return ACCENT
    return BG


def png(size: int, maskable: bool) -> bytes:
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            p = pixel(x + 0.5, y + 0.5, size, maskable)
            row += bytes(p) + b"\xff" if p else b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="20" fill="#0f172a"/>
<g fill="#fff">{bars}</g>
<rect x="12" y="49" width="76" height="2.5" fill="#38bdf8"/>
</svg>"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon-192.png").write_bytes(png(192, False))
    (OUT / "icon-512.png").write_bytes(png(512, True))
    (OUT / "apple-touch-icon.png").write_bytes(png(180, True))
    bars = "".join(f'<rect x="{bx*100:.1f}" y="30" width="{bw*100:.1f}" height="40"/>' for bx, bw in BARS)
    (OUT / "favicon.svg").write_text(SVG.format(bars=bars), encoding="utf-8")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
