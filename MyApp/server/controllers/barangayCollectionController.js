const Barangay = require("../models/barangayCollection");

const getAllBarangaysCollection = async (req, res) => {
  try {
    const barangays = await Barangay.find(); // ✅ FIXED
    res.json(barangays);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single barangay by name inside the features array
const getBarangayByNameCollection = async (req, res) => {
  try {
    const { name } = req.params;

    // Find the document that contains a feature with this name
    const barangayCollection = await Barangay.findOne({
      "features.properties.name": name
    });

    if (!barangayCollection)
      return res.status(404).json({ message: name + " not found" });

    // Filter only the feature(s) that match the name
    const matchedFeatures = barangayCollection.features.filter(
      f => f.properties.name.toLowerCase() === name.toLowerCase()
    );

    if (matchedFeatures.length === 0)
      return res.status(404).json({ message: name + " not found in features" });

    res.json({
      type: "FeatureCollection",
      features: matchedFeatures
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getAllBarangaysCollection, getBarangayByNameCollection };