"""Draw COCO-18 skeletons (Castcut's NormalizedBody: 0-1 of the canvas) the OpenPose way.

Her right limbs are drawn warm (red/orange), her left cool (blue/green), so a left-right swap
is visible on a contact sheet. Used by sheet.py and refs-sheet.py.
"""
from PIL import Image, ImageDraw, ImageFont

LIMBS = [
    (1, 2, (255, 60, 0)), (2, 3, (255, 140, 0)), (3, 4, (255, 200, 0)),      # right arm
    (1, 5, (0, 120, 255)), (5, 6, (0, 190, 255)), (6, 7, (0, 255, 230)),     # left arm
    (1, 8, (255, 0, 120)), (8, 9, (255, 0, 60)), (9, 10, (200, 0, 0)),       # right leg
    (1, 11, (0, 200, 90)), (11, 12, (0, 160, 40)), (12, 13, (0, 110, 0)),    # left leg
    (1, 0, (120, 120, 120)), (0, 14, (180, 0, 180)), (14, 16, (180, 0, 180)),
    (0, 15, (90, 0, 220)), (15, 17, (90, 0, 220)),
]


def font(size=14):
    for path in ('/usr/share/fonts/TTF/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_skeleton(body, aspect, height=360, bg=(255, 255, 255), width=None):
    """One body (list of {x,y} or None) on a canvas of the body's aspect (w/h)."""
    w = width or max(60, int(round(height * aspect)))
    im = Image.new('RGB', (w, height), bg)
    d = ImageDraw.Draw(im)

    def at(i):
        p = body[i] if i < len(body) else None
        return None if p is None else (p['x'] * w, p['y'] * height)

    lw = max(2, height // 90)
    for a, b, colour in LIMBS:
        pa, pb = at(a), at(b)
        if pa and pb:
            d.line([pa, pb], fill=colour, width=lw)
    for i in range(len(body)):
        p = at(i)
        if p:
            r = lw + 1
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(30, 30, 30))
    return im


def fit(im, height):
    if im.height == height:
        return im
    w = max(1, int(im.width * height / im.height))
    return im.resize((w, height))


def wrap(text, width_px, fnt, draw):
    words, lines, line = text.split(), [], ''
    for word in words:
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=fnt) > width_px and line:
            lines.append(line)
            line = word
        else:
            line = trial
    if line:
        lines.append(line)
    return lines
