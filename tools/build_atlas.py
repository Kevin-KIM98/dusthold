"""M6 아트: Higgsfield로 만든 시트 이미지를 잘라 게임용 아틀라스(assets/*.png + assets/atlas.js)로 만든다.

게임 실행에는 필요 없다 (이미지 준비용 도구). 결과 파일만 저장소에 들어간다.
  python3 tools/build_atlas.py <원본 시트 폴더>
원본 시트 파일명은 SHEETS의 file과 같아야 한다.

- 흰 여백이 있는 불투명 시트: 여백 줄을 찾아 칸을 나눈다 (못 찾으면 똑같은 격자).
- 투명 시트: 똑같은 격자로 나눈 뒤 그림 테두리만 남긴다.
- 화면에서 쓰는 크기의 2배 정도로 줄인다 (devicePixelRatio 2 대비).
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')

# (이름, 출력 크기) — 크기가 None이면 높이만 맞춤 (h=...)
SHEETS = [
    {
        'key': 'tiles', 'file': 'tiles_sheet.png', 'cols': 4, 'rows': 3, 'transparent': False,
        'size': (128, 128),
        'names': ['tile.forest', 'tile.ruins', 'tile.farm', 'tile.reservoir',
                  'tile.box', 'tile.camp', 'tile.nest', 'tile.base',
                  'tile.fog', 'tile.entrance', 'tile.barren', 'tile.nestCleared'],
    },
    {
        'key': 'rooms', 'file': 'rooms_sheet.png', 'cols': 2, 'rows': 4, 'transparent': False,
        'size': (240, 140),
        'names': ['room.generator', 'room.water', 'room.farm', 'room.quarters',
                  'room.workshop', 'room.medbay', 'room.radio', 'room.emptyWide'],
    },
    {
        'key': 'parts', 'file': 'parts_sheet.png', 'cols': 4, 'rows': 2, 'transparent': False,
        'size': (120, 140),
        'names': ['room.shaft', 'room.storage', 'room.guard', 'cell.cave',
                  'soil.top', 'soil.deep', 'ground.strip', 'door.side'],
        'sizes': {'soil.top': (128, 128), 'soil.deep': (128, 128), 'ground.strip': (160, 120), 'door.side': (120, 100)},
        'seamless': ('soil.top', 'soil.deep'),
    },
    {
        'key': 'people', 'file': 'people_sheet.png', 'cols': 4, 'rows': 2, 'transparent': True,
        'height': 96,
        'names': ['surv.gather.0', 'surv.build.0', 'surv.combat.0', 'surv.tech.0',
                  'surv.gather.1', 'surv.build.1', 'surv.combat.1', 'surv.tech.1'],
    },
    {
        'key': 'props', 'file': 'props_sheet.png', 'cols': 4, 'rows': 2, 'transparent': True,
        'height': 96,
        'names': ['zombie.normal', 'zombie.runner', 'zombie.brute', 'turret',
                  'crane', 'scaffold', 'frame', 'pickaxe'],
        'heights': {'zombie.brute': 128, 'crane': 192, 'scaffold': 140, 'frame': 140, 'pickaxe': 48},
    },
    {
        'key': 'icons', 'file': 'icons_sheet.png', 'cols': 5, 'rows': 2, 'transparent': True,
        'height': 64,
        'names': ['icon.food', 'icon.water', 'icon.wood', 'icon.scrap', 'icon.power',
                  'icon.parts', 'icon.pop', 'icon.injured', 'icon.powerOff', 'icon.warn'],
    },
    # 화면 다듬기 7: 진행바·체력바(3조각으로 늘려 그림)·인원 배지. 줄마다 하나씩이라 투명 줄 기준으로 나눈다
    {
        'key': 'ui', 'file': 'ui_sheet.png', 'cols': 1, 'rows': 6, 'transparent': True, 'split': 'alpha_rows',
        'height': 32,
        'names': ['ui.barTrack', 'ui.barFill', 'ui.barGreen', 'ui.barYellow', 'ui.barRed', 'ui.badge'],
        'heights': {'ui.badge': 64},
    },
    # 화면 다듬기 8: 이음새 없는 안개 (지도 위에 이어서 깐다)
    {
        'key': 'fog', 'file': 'fog_sheet.png', 'cols': 1, 'rows': 1, 'transparent': False,
        'size': (256, 256), 'names': ['fog.seamless'], 'seamless': ('fog.seamless',),
    },
]

# 화면 다듬기 6: 타이틀 그림 (아틀라스 밖 한 장, JPEG)
TITLE = {'file': 'title_art.png', 'out': 'title.jpg', 'quality': 82}

WHITE = 238          # 이보다 밝으면 여백(흰색)으로 본다
GUTTER_RATIO = 0.96  # 한 줄의 이만큼이 흰색이면 여백 줄
ALPHA_MIN = 16       # 이보다 투명하면 빈 칸
HALO_CUT = 40        # 투명 시트의 흐릿한 후광(이보다 투명한 픽셀)은 완전히 지운다
INSET = 3            # 칸 가장자리의 흰 테두리 찌꺼기를 잘라낸다
PAD = 2              # 아틀라스 안에서 그림 사이 간격


def segments(flags, want):
    """여백(True)이 아닌 구간들 [(start, end)]. 개수가 want가 아니면 None"""
    out, start = [], None
    for i, g in enumerate(flags + [True]):
        if not g and start is None:
            start = i
        elif g and start is not None:
            if i - start > 8:
                out.append((start, i))
            start = None
    return out if len(out) == want else None


def equal(n, total):
    step = total / n
    return [(round(i * step), round((i + 1) * step)) for i in range(n)]


def cells_opaque(im, cols, rows):
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    col_white = [sum(1 for y in range(0, h, 2) if px[x, y] >= WHITE) / len(range(0, h, 2)) >= GUTTER_RATIO for x in range(w)]
    row_white = [sum(1 for x in range(0, w, 2) if px[x, y] >= WHITE) / len(range(0, w, 2)) >= GUTTER_RATIO for y in range(h)]
    xs = segments(col_white, cols) or equal(cols, w)
    ys = segments(row_white, rows) or equal(rows, h)
    return [(x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET) for (y0, y1) in ys for (x0, x1) in xs]


def cells_transparent(im, cols, rows):
    w, h = im.size
    boxes = []
    a = im.split()[-1]
    for (y0, y1) in equal(rows, h):
        for (x0, x1) in equal(cols, w):
            crop = a.crop((x0, y0, x1, y1)).point(lambda v: 255 if v >= ALPHA_MIN else 0)
            bb = crop.getbbox()
            boxes.append((x0 + bb[0], y0 + bb[1], x0 + bb[2], y0 + bb[3]) if bb else (x0, y0, x1, y1))
    return boxes


def cells_alpha_rows(im, rows):
    """투명한 줄을 경계로 위에서부터 rows개 그림을 찾는다 (그림 높이가 서로 달라도)"""
    a = im.split()[-1].point(lambda v: 255 if v >= ALPHA_MIN else 0)
    w, h = im.size
    px = a.load()
    empty = [all(px[x, y] == 0 for x in range(0, w, 2)) for y in range(h)]
    ys = segments(empty, rows)
    assert ys, f'투명 줄로 {rows}개를 못 나눔'
    boxes = []
    for (y0, y1) in ys:
        bb = a.crop((0, y0, w, y1)).getbbox()
        boxes.append((bb[0], y0 + bb[1], bb[2], y0 + bb[3]))
    return boxes


def make_seamless(piece):
    """반 칸 밀어 놓은 같은 그림과 가운데가 진한 마스크로 섞어 가장자리 이음새를 없앤다"""
    w, h = piece.size
    shifted = Image.new(piece.mode, (w, h))
    shifted.paste(piece, (-w // 2, -h // 2))
    shifted.paste(piece, (w - w // 2, -h // 2))
    shifted.paste(piece, (-w // 2, h - h // 2))
    shifted.paste(piece, (w - w // 2, h - h // 2))
    mask = Image.new('L', (w, h))
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            dx = min(x, w - 1 - x) / (w / 2)
            dy = min(y, h - 1 - y) / (h / 2)
            mp[x, y] = round(255 * min(1.0, min(dx, dy) * 2.2))
    return Image.composite(piece, shifted, mask)


def build(src_dir):
    os.makedirs(OUT, exist_ok=True)
    atlas = {'images': {}, 'sprites': {}}
    for sh in SHEETS:
        path = os.path.join(src_dir, sh['file'])
        if not os.path.exists(path):
            print('건너뜀 (원본 없음):', sh['file'])
            continue
        im = Image.open(path)
        im = im.convert('RGBA')
        if sh['transparent']:
            r, g, b, a = im.split()
            a = a.point(lambda v: 0 if v < HALO_CUT else v)
            im = Image.merge('RGBA', (r, g, b, a))
        if sh.get('split') == 'alpha_rows':
            boxes = cells_alpha_rows(im, sh['rows'])
        elif sh['transparent']:
            boxes = cells_transparent(im, sh['cols'], sh['rows'])
        else:
            boxes = cells_opaque(im, sh['cols'], sh['rows'])
        pieces = []
        for name, box in zip(sh['names'], boxes):
            piece = im.crop(box)
            if 'size' in sh:
                size = sh.get('sizes', {}).get(name, sh['size'])
                piece = piece.resize(size, Image.LANCZOS)
                if name in sh.get('seamless', ()):
                    piece = make_seamless(piece)
            else:
                hh = sh.get('heights', {}).get(name, sh['height'])
                ww = max(1, round(piece.width * hh / piece.height))
                piece = piece.resize((ww, hh), Image.LANCZOS)
            pieces.append((name, piece))
        # 한 줄씩 쌓는 단순 배치 (가로 최대 1024)
        max_w, x, y, row_h, places = 1024, 0, 0, 0, []
        for name, p in pieces:
            if x + p.width > max_w:
                x, y, row_h = 0, y + row_h + PAD, 0
            places.append((name, p, x, y))
            x += p.width + PAD
            row_h = max(row_h, p.height)
        W = max(px + p.width for _, p, px, _ in places)
        H = y + row_h
        assert W <= 2048 and H <= 2048, '아틀라스는 2048px 이하'
        sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for name, p, px, py in places:
            sheet.paste(p, (px, py))
            atlas['sprites'][name] = {'img': sh['key'], 'x': px, 'y': py, 'w': p.width, 'h': p.height}
        out_name = sh['key'] + '.png'
        if sh['transparent']:
            sheet.save(os.path.join(OUT, out_name), optimize=True)
        else:
            sheet.convert('RGB').save(os.path.join(OUT, out_name), optimize=True)
        atlas['images'][sh['key']] = 'assets/' + out_name
        print(f"{out_name}: {W}x{H}, {len(places)}개")
    with open(os.path.join(OUT, 'atlas.js'), 'w', encoding='utf-8') as f:
        f.write('// tools/build_atlas.py가 만든 파일. 직접 고치지 않는다.\n')
        f.write('// 이 파일이나 이미지가 없으면 게임은 도형으로 그린다.\n')
        f.write('export const ATLAS = ' + json.dumps(atlas, ensure_ascii=False, indent=1) + ';\n')
    print('assets/atlas.js:', len(atlas['sprites']), '스프라이트')
    tp = os.path.join(src_dir, TITLE['file'])
    if os.path.exists(tp):
        Image.open(tp).convert('RGB').save(os.path.join(OUT, TITLE['out']), quality=TITLE['quality'], optimize=True)
        print('assets/' + TITLE['out'])


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'src'))
