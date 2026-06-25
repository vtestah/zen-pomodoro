#!/usr/bin/env python3
# Regenerate icon.png from the SAME flat tomato that the panel draws (variant 2
# in applet.js _paintTomatoFlat), so the app/settings/About icon matches the
# panel mark. Renders at 256px with pycairo, then downscales to 48px so the
# edges stay smooth. Requires: python3-cairo and ImageMagick (convert).
import cairo, math, os, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "icon.png"))

S = 256
surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, S, S)
cr = cairo.Context(surf)

cx, cy, R = 128.0, 130.0, 106.0
br, bg, bb = 0.84, 0.25, 0.18      # deep tomato red
lr, lg, lb = 0.32, 0.64, 0.30      # green calyx

# Body: oblate (wider than tall).
bw, bh, byc = R * 0.96, R * 0.74, cy + R * 0.12
cr.save()
cr.translate(cx, byc)
cr.scale(bw, bh)
cr.set_source_rgba(br, bg, bb, 1.0)
cr.arc(0, 0, 1, 0, 2 * math.pi)
cr.fill()
cr.restore()

# Calyx: three leaves fanning from the top.
topY = byc - bh * 0.70
leaves, llen, lwid, spread = 3, R * 0.50, R * 0.44, 0.92
cr.set_source_rgba(lr, lg, lb, 1.0)
cr.save()
cr.translate(cx, topY)
for i in range(leaves):
    ang = (i - (leaves - 1) / 2.0) * spread
    cr.save()
    cr.rotate(ang)
    cr.move_to(0, lwid * 0.12)
    cr.line_to(-lwid / 2, -llen * 0.5)
    cr.line_to(0, -llen)
    cr.line_to(lwid / 2, -llen * 0.5)
    cr.close_path()
    cr.fill()
    cr.restore()
cr.restore()

# Short stem.
cr.set_source_rgba(lr * 0.8, lg * 0.8, lb * 0.8, 1.0)
cr.set_line_width(max(1.3, R * 0.18))
cr.move_to(cx, topY)
cr.line_to(cx, topY - R * 0.3)
cr.stroke()

tmp = tempfile.mktemp(suffix=".png")
surf.write_to_png(tmp)
subprocess.run(["convert", tmp, "-resize", "48x48", "-depth", "8", OUT], check=True)
os.remove(tmp)
print("wrote", OUT)
