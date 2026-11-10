"""Passport PDF. Built with ReportLab in the product palette."""
from io import BytesIO

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .config import get_settings

FOREST, GREEN, IVORY = HexColor("#101B19"), HexColor("#1C2B26"), HexColor("#F4F1E8")
LIME, COPPER, MUTED, LINE = HexColor("#C6E66B"), HexColor("#B78A62"), HexColor("#A8B8AE"), HexColor("#2C3F38")


def rand(value) -> str:
    """South African rand: R 5 500,00"""
    whole, cents = f"{float(value):,.2f}".split(".")
    return f"R {whole.replace(',', ' ')},{cents}"


def _wrap(c, text, x, y, width, font="Helvetica", size=9, leading=12, color=IVORY):
    c.setFont(font, size)
    c.setFillColor(color)
    line = ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if c.stringWidth(trial, font, size) > width:
            c.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = trial
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def passport_pdf(p: dict, shared: bool = False) -> bytes:
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    c.setTitle(f"Stokvel Credit Passport {p['passport_id']}")

    def page_bg():
        c.setFillColor(FOREST)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawString(18 * mm, 10 * mm, "Stokvel Credit Passport. Experimental contribution-behaviour measure. Not a credit bureau score.")

    page_bg()
    x0, top = 18 * mm, H - 20 * mm
    c.setFillColor(LIME)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x0, top, "STOKVEL CREDIT PASSPORT" + ("  /  SHARED WITH CONSENT" if shared else ""))
    if p.get("is_synthetic"):
        c.setFillColor(COPPER)
        c.drawRightString(W - x0, top, "SYNTHETIC DEMONSTRATION DATA")

    # identity card
    card_h = 62 * mm
    cy = top - 8 * mm - card_h
    c.setFillColor(GREEN)
    c.setStrokeColor(LINE)
    c.roundRect(x0, cy, W - 2 * x0, card_h, 3 * mm, stroke=1, fill=1)
    c.setFillColor(IVORY)
    c.setFont("Times-Roman", 24)
    c.drawString(x0 + 8 * mm, cy + card_h - 16 * mm, p["member_name"])
    c.setFont("Courier", 10)
    c.setFillColor(MUTED)
    c.drawString(x0 + 8 * mm, cy + card_h - 23 * mm, f"Passport ID  {p['passport_id']}")
    c.drawString(x0 + 8 * mm, cy + card_h - 29 * mm, f"Verification code  {p['verification_code']}")
    c.setFont("Helvetica", 9)
    c.drawString(x0 + 8 * mm, cy + 14 * mm, f"Generated  {p['generated_at'][:10]}")
    c.drawString(x0 + 8 * mm, cy + 8.5 * mm, f"Last verified contribution  {(p.get('last_verified_at') or 'None')[:10]}")

    idx = p.get("index")
    if idx:
        c.setFillColor(LIME)
        c.setFont("Times-Roman", 54)
        c.drawRightString(W - x0 - 46 * mm, cy + card_h - 30 * mm, str(idx["score"]))
        c.setFont("Helvetica", 8)
        c.setFillColor(MUTED)
        c.drawRightString(W - x0 - 46 * mm, cy + card_h - 36 * mm, "Contribution Reliability Index, out of 100")
        c.drawRightString(W - x0 - 46 * mm, cy + card_h - 41 * mm,
                          f"Model {idx['model_version']}" + ("  ·  Provisional" if idx.get("provisional") else ""))

    link = f"{get_settings().frontend_url}/verify/{p['verification_code']}"
    code = qr.QrCodeWidget(link, barFillColor=FOREST)
    b = code.getBounds()
    size = 34 * mm
    d = Drawing(size, size, transform=[size / (b[2] - b[0]), 0, 0, size / (b[3] - b[1]), 0, 0])
    d.add(code)
    c.setFillColor(IVORY)
    c.roundRect(W - x0 - 42 * mm, cy + card_h - 44 * mm, 38 * mm, 38 * mm, 1.5 * mm, stroke=0, fill=1)
    renderPDF.draw(d, c, W - x0 - 40 * mm, cy + card_h - 42 * mm)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7)
    c.drawCentredString(W - x0 - 23 * mm, cy + 8.5 * mm, "Scan to check authenticity")

    y = cy - 10 * mm

    def heading(text):
        nonlocal y
        if y < 40 * mm:
            c.showPage()
            page_bg()
            y = H - 22 * mm
        c.setFillColor(COPPER)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x0, y, text.upper())
        c.setStrokeColor(LINE)
        c.line(x0, y - 2 * mm, W - x0, y - 2 * mm)
        y -= 8 * mm

    t = p.get("totals")
    if t:
        heading("Verified contribution summary")
        cols = [("Total verified", rand(t["total_verified"])), ("Verified payments", str(t["verified_count"])),
                ("On time", f"{t['on_time']} of {t['due']}"), ("Participation", f"{t['participation_months']} months")]
        cw = (W - 2 * x0) / 4
        for i, (label, value) in enumerate(cols):
            c.setFillColor(IVORY)
            c.setFont("Times-Roman", 15)
            c.drawString(x0 + i * cw, y, value)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 8)
            c.drawString(x0 + i * cw, y - 5 * mm, label)
        y -= 14 * mm

    if idx and idx.get("factors"):
        heading("Index breakdown")
        for f in idx["factors"].values():
            c.setFillColor(IVORY)
            c.setFont("Helvetica", 9)
            c.drawString(x0, y, f["label"])
            bw = 46 * mm
            c.setFillColor(GREEN)
            c.rect(x0 + 78 * mm, y - 0.5 * mm, bw, 2.6 * mm, stroke=0, fill=1)
            c.setFillColor(LIME)
            c.rect(x0 + 78 * mm, y - 0.5 * mm, bw * f["value"] / 100, 2.6 * mm, stroke=0, fill=1)
            c.setFillColor(MUTED)
            c.setFont("Courier", 8)
            c.drawRightString(W - x0, y, f"{f['value']:.0f}/100  x {int(f['weight'] * 100)}%  = {f['points']:.1f}")
            y -= 6 * mm
        y -= 3 * mm

    ex = p.get("explanation")
    if ex:
        heading("Why the index has this value")
        for line in ex["strengths"]:
            y = _wrap(c, "+  " + line, x0, y, W - 2 * x0)
        for line in ex["improvements"]:
            y = _wrap(c, "-  " + line, x0, y, W - 2 * x0, color=MUTED)
        y -= 3 * mm

    if p.get("memberships"):
        heading("Stokvel membership history")
        for m in p["memberships"]:
            c.setFillColor(IVORY)
            c.setFont("Helvetica", 9)
            c.drawString(x0, y, m["stokvel"])
            c.setFillColor(MUTED)
            c.drawRightString(W - x0, y, f"{m['frequency']}  ·  {m['role']}  ·  joined {m['joined_on']}  ·  {m['status']}")
            y -= 5.5 * mm
        y -= 3 * mm

    if p.get("history"):
        heading("Verified contribution history (most recent first)")
        for row in p["history"][:60]:
            if y < 22 * mm:
                c.showPage()
                page_bg()
                y = H - 22 * mm
            c.setFillColor(IVORY)
            c.setFont("Helvetica", 8)
            c.drawString(x0, y, row["date"])
            c.drawString(x0 + 24 * mm, y, row["stokvel"][:30])
            c.drawRightString(x0 + 98 * mm, y, rand(row["amount"]))
            c.setFillColor(LIME if row["on_time"] else COPPER)
            c.drawString(x0 + 102 * mm, y, "on time" if row["on_time"] else "late")
            c.setFillColor(MUTED)
            c.setFont("Courier", 7)
            c.drawRightString(W - x0, y, (row["ledger_hash"] or "")[:28] + "…")
            y -= 4.6 * mm
        y -= 3 * mm

    heading("Data provenance")
    prov = p["provenance"]
    c.setFont("Courier", 7.5)
    c.setFillColor(MUTED)
    c.drawString(x0, y, f"Ledger head  {prov['ledger_head_hash']}")
    y -= 4.5 * mm
    c.drawString(x0, y, f"Ledger events at issue  {prov['ledger_event_count']}    Inputs digest  {prov['inputs_digest'][:32]}…")
    y -= 8 * mm
    _wrap(c, p["disclaimer"], x0, y, W - 2 * x0, size=8, leading=11, color=IVORY)
    c.save()
    return buf.getvalue()
