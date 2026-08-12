const express = require("express");
const router = express.Router();
const { getAllBarangaysCollection, getBarangayByNameCollection } = require("../controllers/barangayCollectionController");

// GET /api/barangays - get all barangays
router.get("/", getAllBarangaysCollection);

// GET /api/barangays/:name - get barangay by name
router.get("/:name", getBarangayByNameCollection);

module.exports = router;