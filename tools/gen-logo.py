#!/usr/bin/env python3
# Regenerate logo.svg — the SAME flat tomato as icon.png / the panel mark, but as
# a crisp, self-contained vector (explicit colors, no currentColor/scripts) for
# the README and other large displays. Mirrors tools/gen-icon.py's drawing.
# Requires: python3-cairo.  Run: python3 tools/gen-logo.py [--preview]
import cairo
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_SVG = os.path.normpath(os.path.join(HERE, "..", "logo.svg"))
S = 256


def draw(cr):
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


svg = cairo.SVGSurface(OUT_SVG, S, S)
draw(cairo.Context(svg))
svg.finish()
print("wrote", OUT_SVG)

if "--preview" in sys.argv:
    png = cairo.ImageSurface(cairo.FORMAT_ARGB32, S, S)
    draw(cairo.Context(png))
    png.write_to_png("/tmp/zp-logo-preview.png")
    print("wrote /tmp/zp-logo-preview.png")
