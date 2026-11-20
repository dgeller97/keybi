"""Render the two sample order vouchers from the purchasing workbook's saved rows."""
from pathlib import Path

from openpyxl import load_workbook
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "web/datasets/budget"
BOOK = load_workbook(ROOT / "PurchaseReview.xlsx", read_only=True, data_only=True)
departments = dict(list(BOOK["Cost centers"].values)[1:])
fonts = Path("C:/Windows/Fonts")


def font(size, bold=False, serif=False):
    family = "georgia.ttf" if serif else ("segoeuib.ttf" if bold else "segoeui.ttf")
    return ImageFont.truetype(str(fonts / family), size)


def receipt(row):
    order, center, date, quantity, price, amount = row
    image = Image.new("RGB", (960, 646), "#fffdf7")
    draw = ImageDraw.Draw(image)
    ink, muted, line, green = "#233b33", "#4e675c", "#bdc7b9", "#165c48"
    draw.rectangle((0, 0, 960, 11), fill=green)
    draw.text((52, 42), "FOLIO   /   SAMPLE PURCHASING RECORDS", font=font(22, bold=True), fill=green)
    draw.text((52, 92), "Purchase voucher", font=font(52, serif=True), fill=ink)
    draw.text((908, 111), order, anchor="ra", font=font(36, bold=True), fill=ink)
    draw.line((52, 180, 908, 180), fill=line, width=2)
    columns = [(52, "DEPARTMENT", departments[center]), (396, "COST CENTER", center), (656, "ORDER DATE", date.strftime("%d %b %Y"))]
    for x, label, value in columns:
        draw.text((x, 205), label, font=font(19, bold=True), fill=muted)
        draw.text((x, 242), value, font=font(31), fill=ink)
    draw.line((52, 315, 908, 315), fill=line, width=2)
    for x, label, value, anchor in [(52, "QUANTITY", str(quantity), "la"), (570, "UNIT COST", f"${price:,.2f}", "ra"), (908, "LINE AMOUNT", f"${amount:,.2f}", "ra")]:
        draw.text((x, 342), label, anchor=anchor, font=font(19, bold=True), fill=muted)
        draw.text((x, 386), value, anchor=anchor, font=font(35), fill=ink)
    draw.rectangle((52, 490, 908, 598), fill="#e8efe5")
    draw.text((78, 524), "Total (USD)", font=font(31, bold=True), fill=green)
    draw.text((882, 514), f"${amount:,.2f}", anchor="ra", font=font(47, bold=True), fill=green)
    image.save(ROOT / f"{order}-voucher.png", optimize=True)


for row in list(BOOK["Purchase lines"].values)[1:3]:
    receipt(row)
BOOK.close()

