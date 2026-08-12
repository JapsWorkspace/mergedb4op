const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const outDir = path.join(__dirname, "..", "sample-imports");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeWorkbook(fileName, sheetName, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const filePath = path.join(outDir, fileName);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

ensureDir(outDir);

const goodsRows = [
  {
    "Item Name": "Family Pack Rice",
    Category: "Food",
    Quantity: 120,
    Unit: "packs",
    Notes: "Sample goods row for active Goods import.",
  },
  {
    "Item Name": "Bottled Water",
    Category: "Drinks",
    Quantity: 80,
    Unit: "cases",
    Notes: "Second goods row.",
  },
];

const monetaryRows = [
  {
    "Donor Name": "ABC Foundation",
    Amount: 50000,
    "Reference Number": "REF-MONEY-001",
    "Source Type": "External",
    Notes: "Sample monetary row.",
  },
  {
    "Donor Name": "City Partner",
    Amount: 12000,
    "Reference Number": "REF-MONEY-002",
    "Source Type": "Internal",
    Notes: "Second monetary row.",
  },
];

const applianceRows = [
  {
    "Item Name": "Electric Fan",
    Category: "Cooling Appliances",
    Quantity: 10,
    Condition: "brand_new",
    "Usage Duration": "",
    "Source Type": "external",
    "Source Name": "ABC Foundation",
    Description: "Sample brand new appliance donation.",
    Notes: "Sample appliance row.",
  },
  {
    "Item Name": "Water Pump",
    Category: "Utility Appliances",
    Quantity: 3,
    Condition: "used_item",
    "Usage Duration": "2 years",
    "Source Type": "government",
    "Source Name": "Jaen MDRRMO",
    Description: "Sample used appliance donation.",
    Notes: "Second appliance row.",
  },
];

const reliefFoodOnlyRows = [
  {
    "Support Type": "Food Packs",
    "Evacuation Center": "Bank",
    Households: 22,
    Families: 17,
    Male: 20,
    Female: 22,
    LGBTQ: 1,
    PWD: 2,
    Pregnant: 1,
    Senior: 4,
    "Requested Food Packs": 110,
    Remarks: "Food packs only sample row.",
  },
  {
    "Support Type": "Food Packs",
    "Evacuation Center": "OldChurch",
    Households: 30,
    Families: 26,
    Male: 68,
    Female: 43,
    LGBTQ: 0,
    PWD: 1,
    Pregnant: 0,
    Senior: 3,
    "Requested Food Packs": 120,
    Remarks: "Second food packs only row.",
  },
];

const reliefFoodMonetaryRows = [
  {
    "Support Type": "Food Packs + Monetary",
    "Evacuation Center": "Bank",
    Households: 22,
    Families: 17,
    Male: 20,
    Female: 22,
    LGBTQ: 1,
    PWD: 2,
    Pregnant: 1,
    Senior: 4,
    "Requested Food Packs": 110,
    "Requested Monetary Amount": 1000,
    Remarks: "Food packs plus monetary sample row.",
  },
  {
    "Support Type": "Food Packs + Monetary",
    "Evacuation Center": "OldChurch",
    Households: 30,
    Families: 26,
    Male: 68,
    Female: 43,
    LGBTQ: 0,
    PWD: 1,
    Pregnant: 0,
    Senior: 3,
    "Requested Food Packs": 120,
    "Requested Monetary Amount": 2500,
    Remarks: "Second food packs plus monetary row.",
  },
];

const reliefMixedRows = [
  {
    "Support Type": "Food Packs + Monetary + Appliance",
    "Evacuation Center": "Bank",
    Households: 22,
    Families: 17,
    Male: 20,
    Female: 22,
    LGBTQ: 1,
    PWD: 2,
    Pregnant: 1,
    Senior: 4,
    "Requested Food Packs": 110,
    "Requested Monetary Amount": 1000,
    "Requested Appliance": "Electric Fan",
    "Appliance Category": "Cooling Appliances",
    "Appliance Quantity": 10,
    "Appliance Remarks": "For ventilation",
    Remarks: "Mixed support sample row.",
  },
  {
    "Support Type": "Food Packs + Monetary + Appliance",
    "Evacuation Center": "OldChurch",
    Households: 30,
    Families: 26,
    Male: 68,
    Female: 43,
    LGBTQ: 0,
    PWD: 1,
    Pregnant: 0,
    Senior: 3,
    "Requested Food Packs": 120,
    "Requested Monetary Amount": 2500,
    "Requested Appliance": "Water Dispenser",
    "Appliance Category": "Utility Appliances",
    "Appliance Quantity": 4,
    "Appliance Remarks": "Backup water support",
    Remarks: "Second mixed support row.",
  },
];

writeWorkbook("inventory-goods-sample.xlsx", "Goods Import", goodsRows);
writeWorkbook("inventory-monetary-sample.xlsx", "Monetary Import", monetaryRows);
writeWorkbook("inventory-appliance-sample.xlsx", "Appliance Import", applianceRows);
writeWorkbook("inventory-appliance-sample-v2.xlsx", "Appliance Import", applianceRows);
writeWorkbook("relief-foodpacks-sample.xlsx", "Relief Import", reliefFoodOnlyRows);
writeWorkbook("relief-foodpacks-monetary-sample.xlsx", "Relief Import", reliefFoodMonetaryRows);
writeWorkbook("relief-mixed-support-sample.xlsx", "Relief Import", reliefMixedRows);

console.log(`Created sample imports in ${outDir}`);
