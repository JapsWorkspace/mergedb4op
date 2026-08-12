const mongoose = require("mongoose");

const BarangayCollectionSchema = new mongoose.Schema({
  type: { type: String, required: true }, // "FeatureCollection"
  features: [
    {
      type: {
        type: String,
        required: true, // "Feature"
      },
      properties: {
        id: { type: Number, required: true },
        name: { type: String, required: true },
        municipality: { type: String, required: true },
      },
      geometry: {
        type: { type: String, required: true }, // "Polygon" or "MultiPolygon"
        coordinates: { type: Array, required: true }, // store coordinates array
      },
    },
  ],
});

module.exports = mongoose.model("BarangayCollection", BarangayCollectionSchema);