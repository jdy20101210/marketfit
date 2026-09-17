"""MarketFit 공식 로고(래스터 원본)를 색상별로 분리해 potrace로 벡터화합니다.

public/brand/*.svg, app/icon.svg, components/layout/logoPaths.ts 는 이 스크립트 결과(traced.json)를
정리(SVGO, 소수점 1자리)해 만든 것입니다. 로고 원본이 바뀌었을 때만 다시 실행하세요.

  pip install potracer pillow numpy
  python assets/brand/vectorize-logo.py assets/brand/traced   # → traced.json / traced.svg
"""
import sys, time, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
import potrace

SRC = Path(__file__).with_name('marketfit-logo-source.png')
OUT = sys.argv[1] if len(sys.argv) > 1 else 'traced'
SCALE = 6
# 원본 측정값 (median)
COLORS = {
    'yellow': np.array([245, 204, 95.]),
    'green': np.array([190, 219, 94.]),
    'charcoal': np.array([35, 38, 33.]),
}
WHITE = np.array([255, 255, 255.])
CROP = (68, 94, 770, 258)  # 여백 포함 (상단 스크린샷 테두리 제외)

im = Image.open(SRC).convert('RGB').crop(CROP)
W, H = im.size
big = im.resize((W * SCALE, H * SCALE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(SCALE * 0.45))
p = np.asarray(big).astype(float)

best_res = np.full(p.shape[:2], np.inf)
best_t = np.zeros(p.shape[:2])
best_i = np.zeros(p.shape[:2], dtype=np.uint8)
names = list(COLORS)
for i, name in enumerate(names, start=1):
    c = COLORS[name]
    d = c - WHITE
    t = np.clip(((p - WHITE) @ d) / (d @ d), 0, 1)
    proj = WHITE + t[..., None] * d
    res = np.linalg.norm(p - proj, axis=2)
    take = res < best_res
    best_res = np.where(take, res, best_res)
    best_t = np.where(take, t, best_t)
    best_i = np.where(take, i, best_i)
# 흰색과의 혼합 비율(alpha)이 0.5를 넘는 픽셀만 해당 색으로 채택 (가장 가까운 색 선 위에서 판단)
label = np.where(best_t > 0.5, best_i, 0).astype(np.uint8)

def fmt(v):
    return f"{v / SCALE:.2f}".rstrip('0').rstrip('.')

paths = {}
for i, name in enumerate(names, start=1):
    mask = label == i
    t0 = time.time()
    bm = potrace.Bitmap(~mask)
    plist = bm.trace(turdsize=SCALE * SCALE * 6, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.4)
    parts = []
    for curve in plist:
        s = curve.start_point
        seg = [f"M{fmt(s.x)} {fmt(s.y)}"]
        for sgm in curve.segments:
            if sgm.is_corner:
                seg.append(f"L{fmt(sgm.c.x)} {fmt(sgm.c.y)}L{fmt(sgm.end_point.x)} {fmt(sgm.end_point.y)}")
            else:
                seg.append(f"C{fmt(sgm.c1.x)} {fmt(sgm.c1.y)} {fmt(sgm.c2.x)} {fmt(sgm.c2.y)} {fmt(sgm.end_point.x)} {fmt(sgm.end_point.y)}")
        seg.append('Z')
        parts.append(''.join(seg))
    paths[name] = parts
    print(name, 'curves', len(plist), f'{time.time()-t0:.1f}s', file=sys.stderr)

json.dump({'viewBox': [0, 0, W, H], 'crop': CROP, 'paths': paths}, open(f'{OUT}.json', 'w'))
hexc = {k: '#%02x%02x%02x' % tuple(int(x) for x in v) for k, v in COLORS.items()}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*2}" height="{H*2}">']
for name in names:
    svg.append(f'<path fill="{hexc[name]}" fill-rule="evenodd" d="{"".join(paths[name])}"/>')
svg.append('</svg>')
open(f'{OUT}.svg', 'w').write('\n'.join(svg))
print(hexc, file=sys.stderr)
