const BarangayStock = require("../models/BarangayStock");
const BarangayStockTransaction = require("../models/BarangayStockTransaction");

/* GET STOCK (ROLE-AWARE) */
const getBarangayStock = async (req, res) => {
  try {
    const role = req.session.role;

    let filter = { isArchived: false };

    if (role !== "admin" && role !== "drrmo") {
      filter.barangayId = req.session.userId;
    }

    const stocks = await BarangayStock.find(filter).sort({ createdAt: -1 });

    res.json(stocks);
  } catch (err) {
    console.error("Get Barangay Stock Error:", err);
    res.status(500).json({ message: "Failed to fetch stock" });
  }
};

/* DISTRIBUTE STOCK */
const distributeStock = async (req, res) => {
  try {
    const { stockId, quantity } = req.body;
    const username = req.session?.username || "unknown";

    if (!stockId || !quantity) {
      return res.status(400).json({
        message: "Stock ID and quantity are required",
      });
    }

    const qty = Number(quantity);
    if (qty <= 0) {
      return res.status(400).json({
        message: "Quantity must be greater than 0",
      });
    }

    const stock = await BarangayStock.findById(stockId);
    if (!stock) {
      return res.status(404).json({ message: "Stock not found" });
    }

    if (stock.quantityAvailable < qty) {
      return res.status(400).json({
        message: `Insufficient stock. Available: ${stock.quantityAvailable}`,
      });
    }

    stock.quantityAvailable -= qty;
    stock.lastUpdatedBy = username;
    await stock.save();

    await BarangayStockTransaction.create({
      barangayId: stock.barangayId,
      barangayName: stock.barangayName,
      stockId: stock._id,
      itemName: stock.itemName,
      category: stock.category,
      unit: stock.unit,
      quantity: qty,
      transactionType: "distribution",
      remarks: "Distributed to residents",
      performedBy: username,
    });

    res.json({ message: "Stock distributed successfully" });
  } catch (err) {
    console.error("Distribute Stock Error:", err);
    res.status(500).json({ message: "Distribution failed" });
  }
};

/* GET TRANSACTIONS */
const getTransactions = async (req, res) => {
  try {
    const role = req.session.role;

    let filter = {};

    if (role !== "admin" && role !== "drrmo") {
      filter.barangayId = req.session.userId;
    }

    const logs = await BarangayStockTransaction.find(filter).sort({
      createdAt: -1,
    });

    res.json(logs);
  } catch (err) {
    console.error("Get Transactions Error:", err);
    res.status(500).json({ message: "Failed to fetch logs" });
  }
};

module.exports = {
  getBarangayStock,
  distributeStock,
  getTransactions,
};