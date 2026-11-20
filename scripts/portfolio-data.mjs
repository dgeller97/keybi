import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const base = "web/datasets";
export const rows = {};
async function csv(folder, name, head, data) {
  const path = join(base, folder);
  await mkdir(path, { recursive: true });
  rows[name] = data.map((r) =>
    Object.fromEntries(head.map((k, i) => [k, r[i]])),
  );
  await writeFile(
    join(path, name + ".csv"),
    [head, ...data].map((r) => r.join(",")).join("\n") + "\n",
  );
}
const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
await csv("gallery","Scans",["ScanTime","Dock","Parcels","Planned"],[
  ["2026-11-01T01:45:00-05:00","River",16,15],
  ["2026-11-01T01:50:00-04:00","River",8,10],
  ["2026-11-01T06:05:00Z","River",9,8],
  ["2026-11-01T06:05:00Z","Hill",5,6],
  ["2026-11-01T03:05:00-05:00","Hill",21,20],
]);
await csv(
  "gallery",
  "Depots",
  ["Network", "Depot", "Latitude", "Longitude", "Loads"],
  [
    ["Lakeshore", "Harbour", 43.64, -79.39, 29],
    ["Lakeshore", "Junction", 43.68, -79.54, 41],
    ["Lakeshore", "West terminal", 43.63, -79.64, 18],
    ["Pacific", "West quay", -16.72, 179.8, 16],
    ["Pacific", "East quay", -16.76, -179.85, 34],
    ["Pacific", "South quay", -16.9, 179.72, 12],
  ],
);
await csv(
  "gallery",
  "Schedule",
  ["Task", "Workstream", "Start", "Finish", "Complete", "CrewDays"],
  [
    ["Survey depots", "Network", "2026-01-26", "2026-02-04", 1, 8],
    ["Pilot routes", "Network", "2026-02-04", "2026-02-18", 0.75, 18],
    ["Approve routes", "Network", "2026-02-19", "", 1, 0],
    ["Install scanners", "Warehouse", "2026-02-09", "2026-02-25", 0.5, 16],
    ["Train shift leads", "Warehouse", "2026-02-23", "2026-03-02", 0.25, 8],
    ["Release inventory", "Warehouse", "2026-03-03", "", 0, 0],
    ["Load forecasts", "Planning", "2026-02-02", "2026-02-12", 1, 6],
    ["Confirm staffing", "Planning", "2026-02-12", "2026-02-20", 0.75, 4],
  ],
);
const sites = ["Cedar", "Harbor", "Ridge"];
const calendar = months.flatMap((m) =>
  Array.from(
    { length: 12 },
    (_, i) => m + "-" + String(i + 1).padStart(2, "0"),
  ),
);
await csv(
  "hospital",
  "Calendar",
  ["CalendarKey", "Date", "Month"],
  calendar.map((d, i) => [i + 1, d, d.slice(0, 7)]),
);
const encounters = Array.from({ length: 192 }, (_, i) => {
  const s = i % 3,
    day = i % 48,
    minutes = 12 + ((i * 17 + Math.floor(i / 48) * 11 + s * 7) % 58);
  return [
    "E" + String(i + 1).padStart(3, "0"),
    day + 1,
    sites[s],
    i % 11 === 0 ? "Training" : "Routine",
    i % 7 === 0 ? "Open" : "Closed",
    minutes,
    Number(minutes <= 45),
    1,
  ];
});
await csv(
  "hospital",
  "Encounter",
  [
    "Encounter",
    "CalendarKey",
    "Site",
    "Cohort",
    "Status",
    "Minutes",
    "MetTarget",
    "Visits",
  ],
  encounters,
);
const depts = ["Facilities", "Medicine", "Surgery"];
const orderColumns=["PeriodKey", "DepartmentKey", "PurchaseOrder", "OrderedOn", "LineAmount", "Approved", "Vendor.Name", "Vendor.Ref", "AuditValue"];
await csv("budget","Commitments",orderColumns,[
  [3,1,"9007199254740993","2026-03-02","120.15",true,"North Mill","001","1234567890123456.12"],
  [3,2,"9007199254740994","2026-03-09","70.10",true,"Lake Medical","002","1.20"],
  [3,3,"9007199254740995","2026-03-17","",false,"","","0.00"],
  [4,1,"9007199254740996","2026-04-02","45.00",true,"North Mill","001","10.50"],
  [4,1,"9007199254740997","2026-04-07","30.21",true,"Civic Works","003","6.25"],
  [4,2,"9007199254740998","2026-04-10","185.40",true,"Lake Medical","002","88.00"],
  [4,2,"9007199254740999","2026-04-12","-5.25",true,"Lake Medical","002","5.25"],
  [4,3,"18446744073709551615","2026-04-18","94.60",false,"","","17.95"],
]);
await csv("budget","CommitmentChanges",orderColumns,[
  [4,1,"12001","2026-04-21","250.00",true,"North Mill","001","25.00"],
  [4,2,"12002","2026-04-22","-12.50",true,"Lake Medical","002","2.50"],
  [4,3,"12003","2026-04-23","19.85",false,"","","0.00"]
]);
await csv(
  "budget",
  "Forecast",
  ["DepartmentKey", "Jan", "Feb", "Mar", "Apr"],
  [
    [1, 1050, 1150, 1250, 1200],
    [2, 2000, 2150, 2200, 2300],
    [3, 3100, 3200, 3300, 3350],
  ],
);
await csv(
  "budget",
  "Period",
  ["PeriodKey", "Period"],
  months.map((m, i) => [i + 1, m]),
);
await csv(
  "budget",
  "Department",
  ["DepartmentKey", "Department"],
  depts.map((d, i) => [i + 1, d]),
);
const budgets = [],
  entries = [];
for (let m = 1; m <= 4; m++)
  for (let d = 1; d <= 3; d++) {
    const plan = 1000 * d + 100 * m;
    if (!(m === 4 && d === 1)) budgets.push([m, d, plan]);
    if (!(m === 2 && d === 3))
      for (let n = 1; n <= d + 1; n++)
        entries.push([
          "T" + (entries.length + 1),
          m,
          d,
          Math.round(plan / (d + 1)) + d * 15 - m * 20 + n,
        ]);
  }
await csv(
  "budget",
  "Budget",
  ["PeriodKey", "DepartmentKey", "Budget"],
  budgets,
);
await csv(
  "budget",
  "Transaction",
  ["Transaction", "PeriodKey", "DepartmentKey", "Actual"],
  entries,
);
const waits = Array.from({ length: 108 }, (_, i) => {
  const s = i % 3,
    p = Math.floor(i / 27),
    w = 4 + ((i * 7) % 23) + s * 8 + p * 2 + (i % 13 === 0 ? 35 : 0);
  return [
    "W" + String(i + 1).padStart(3, "0"),
    ["Imaging", "Infusion", "Review"][s],
    months[p],
    w,
    w < 20
      ? "01 · Under 20"
      : w < 40
        ? "02 · 20–39"
        : w < 60
          ? "03 · 40–59"
          : "04 · 60+",
    1,
  ];
});
await csv(
  "wait",
  "Visit",
  ["Record", "Service", "Period", "Wait", "Wait band", "Visits"],
  waits,
);
const referrals = [];
for (let site = 1; site <= 144; site++)
  for (let month = 0; month < 4; month++)
    for (let visit = 0; visit < 5 + (site % 4); visit++) {
      const wait =
        6 + ((site * 31 + month * 47) % 97) + ((visit * 13 + site) % 23);
      referrals.push([
        "R" + String(referrals.length + 1).padStart(4, "0"),
        "Clinic " + String(site).padStart(3, "0"),
        months[month],
        wait,
        1,
      ]);
    }
await csv(
  "tail",
  "Referral",
  ["Referral", "Clinic", "Period", "Wait", "Visits"],
  referrals,
);
