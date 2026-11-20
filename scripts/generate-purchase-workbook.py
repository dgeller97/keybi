"""Generate the small purchasing workbook used by the report import check."""
from datetime import datetime
from pathlib import Path

from xlsxwriter import Workbook


def generate(path):
    with Workbook(path) as book:
        book.set_properties({"created": datetime(2026, 4, 1)})
        date_format = book.add_format({"num_format": "yyyy-mm-dd"})
        money = book.add_format({"num_format": "#,##0.00"})
        purchases = book.add_worksheet("Purchase lines")
        headers = ["Order", "Center", "Ordered on", "Quantity", "Unit cost", "Line amount"]
        purchases.write_row(0, 0, headers)
        orders = [
            ("P-01", "001", 1, 3, 41.50),
            ("P-02", "002", 2, 4, 20.00),
            ("P-03", "001", 2, 0, 12.25),
            ("P-04", "001", 3, -1, 12.25),
            ("P-05", "003", 4, 2, 16.75),
        ]
        for row, (order, center, day, quantity, price) in enumerate(orders, start=1):
            purchases.write_row(row, 0, [order, center])
            purchases.write_datetime(row, 2, datetime(2026, 4, day), date_format)
            purchases.write_number(row, 3, quantity)
            purchases.write_number(row, 4, price, money)
            purchases.write_formula(row, 5, f"=D{row+1}*E{row+1}", money, quantity * price)
        purchases.add_table(0, 0, len(orders), len(headers)-1, {
            "name": "PurchaseLines", "columns": [{"header": header} for header in headers],
        })
        centers = book.add_worksheet("Cost centers")
        for row, values in enumerate([["Center", "Department"], ["001", "Facilities"],
                                      ["002", "Surgery"], ["003", "Imaging"]]):
            centers.write_row(row, 0, values)
        notes = book.add_worksheet("Notes")
        notes.write_string(0, 0, "Purchasing review")
        notes.write_string(1, 0, "Amounts are in USD. A negative quantity is a credit.")
        notes.add_table("C5:E9", {
            "name": "AuthorizationLimits", "total_row": True,
            "columns": [{"header": "Center", "total_string": "Total"},
                        {"header": "Single order limit", "total_function": "sum"},
                        {"header": "Approval owner"}],
            "data": [["001", 100, "Facilities lead"], ["002", 75, "Surgery lead"],
                     ["003", 50, "Imaging lead"]],
        })
        notes.add_table("G5:H7", {
            "name": "ReviewCodes", "columns": [{"header": "Code"}, {"header": "Meaning"}],
            "data": [["R", "Review required"], ["A", "Within limit"]],
        })
        notes.set_column("C:H", 20)
        purchases.set_column("A:F", 15)
        centers.set_column("A:B", 18)


def generate_changes(path):
    with Workbook(path) as book:
        book.set_properties({"created": datetime(2026, 4, 5)})
        book.add_worksheet("Read me").write_column(0, 0, ["Notes", "Two adjustments for April 5."])
        sheet = book.add_worksheet("Purchase lines")
        sheet.write_row(0, 0, ["Line amount", "Order", "Center", "Ordered on", "Unit cost", "Quantity"])
        date_format = book.add_format({"num_format": "yyyy-mm-dd"})
        for row, (order, center, cost, quantity) in enumerate(
            [("P-06", "001", 14.5, 1), ("P-07", "002", 5, -1)], start=1
        ):
            sheet.write_formula(row, 0, f"=E{row+1}*F{row+1}", None, cost * quantity)
            sheet.write_row(row, 1, [order, center])
            sheet.write_datetime(row, 3, datetime(2026, 4, 5), date_format)
            sheet.write_row(row, 4, [cost, quantity])
        policy = book.add_worksheet("Policy changes")
        policy.write_string("A1", "Revised single-order approval limits")
        policy.add_table("D4:F7", {
            "name": "AuthorizationLimits",
            "columns": [{"header": "Approval owner"}, {"header": "Single order limit"}, {"header": "Center"}],
            "data": [["Facilities lead", 125, "001"], ["Surgery lead", 70, "002"],
                     ["Imaging lead", 50, "003"]],
        })


if __name__ == "__main__":
    directory = Path(__file__).resolve().parents[1] / "web/datasets/budget"
    generate(directory / "PurchaseReview.xlsx")
    generate_changes(directory / "PurchaseChanges.xlsx")
