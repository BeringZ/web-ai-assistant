"""
scripts/generate-pdf-fixtures.py —— 生成 E2E 测试用 PDF
- sample-text.pdf：含 Helvetica 文本层的单页 PDF（手写 PDF 字节流）
- sample-scan.pdf：纯图片 PDF（PIL，无文本层，模拟扫描件）
"""
import io
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / 'e2e' / 'fixtures'


def build_text_pdf() -> bytes:
    """手工构造一个带文本层的单页 PDF（Helvetica，Hello PDF selection test）"""
    content_stream = b"BT /F1 24 Tf 72 720 Td (Hello PDF selection test) Tj ET"

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(content_stream)} >>\nstream\n{content_stream.decode()}\nendstream".encode(),
    ]

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode())
        out.write(obj)
        out.write(b"\nendobj\n")

    xref_pos = out.tell()
    out.write(b"xref\n")
    out.write(f"0 {len(objects) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())

    out.write(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode())
    return out.getvalue()


def build_scan_pdf() -> bytes:
    """PIL 生成纯图片 PDF（无文本层）"""
    img = Image.new('RGB', (612, 792), 'white')
    # 画几个色块模拟"扫描内容"
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    d.rectangle([80, 160, 480, 220], fill='#d1d5db')
    d.rectangle([80, 240, 400, 300], fill='#9ca3af')
    d.rectangle([80, 320, 520, 340], fill='#6b7280')
    buf = io.BytesIO()
    img.save(buf, 'PDF', resolution=100)
    return buf.getvalue()


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / 'sample-text.pdf').write_bytes(build_text_pdf())
    (FIXTURES / 'sample-scan.pdf').write_bytes(build_scan_pdf())
    for f in FIXTURES.glob('*.pdf'):
        print(f.name, f.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
