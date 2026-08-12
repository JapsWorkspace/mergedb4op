const mongoose = require("mongoose");

const LIMITED_OCCUPANCY_PERCENT = 75;

const deriveCapacityStatus = (currentOccupants, capacityIndividual) => {
  const current = Number(currentOccupants || 0);
  const capacity = Number(capacityIndividual || 0);
  const occupancyPercent =
    capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  if (capacity > 0 && current >= capacity) return "full";
  if (capacity > 0 && occupancyPercent >= LIMITED_OCCUPANCY_PERCENT) return "limited";
  return "available";
};

const EvacPlaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    location: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    barangayId: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      default: "",
    },

    barangayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    latitude: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },

    capacityIndividual: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentOccupants: {
      type: Number,
      default: 0,
      min: 0,
    },

    capacityFamily: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentFamilies: {
      type: Number,
      default: 0,
      min: 0,
    },

    bedCapacity: {
      type: Number,
      default: 0,
      min: 0,
    },

    occupiedBeds: {
      type: Number,
      default: 0,
      min: 0,
    },

    floorArea: {
      type: Number,
      default: 0,
      min: 0,
    },

    femaleCR: {
      type: Boolean,
      default: false,
    },

    maleCR: {
      type: Boolean,
      default: false,
    },

    commonCR: {
      type: Boolean,
      default: false,
    },

    potableWater: {
      type: Boolean,
      default: false,
    },

    nonPotableWater: {
      type: Boolean,
      default: false,
    },

    isPermanent: {
      type: Boolean,
      default: false,
    },

    isCovidFacility: {
      type: Boolean,
      default: false,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    capacityStatus: {
      type: String,
      enum: ["available", "limited", "full"],
      default: "available",
    },

    occupancyLastUpdatedAt: {
      type: Date,
      default: null,
    },

    occupancyUpdatedBy: {
      type: String,
      trim: true,
      default: "",
    },

    isRequestVisible: {
      type: Boolean,
      default: true,
    },

    showOnLanding: {
      type: Boolean,
      default: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

EvacPlaceSchema.virtual("remainingIndividualCapacity").get(function () {
  return Math.max(
    0,
    Number(this.capacityIndividual || 0) - Number(this.currentOccupants || 0)
  );
});

EvacPlaceSchema.virtual("occupancyPercent").get(function () {
  const capacity = Number(this.capacityIndividual || 0);
  const current = Number(this.currentOccupants || 0);

  if (capacity <= 0) return 0;

  return Math.round((current / capacity) * 100);
});

/*
  IMPORTANT:
  Do not use function (next) + next() here.
  Your current Mongoose setup is throwing "next is not a function".
*/
EvacPlaceSchema.pre("validate", function () {
  const capacity = Number(this.capacityIndividual || 0);
  let current = Number(this.currentOccupants || 0);

  if (Number.isNaN(current) || current < 0) {
    current = 0;
  }

  if (capacity > 0 && current > capacity) {
    current = capacity;
  }

  this.currentOccupants = current;
  this.capacityStatus = deriveCapacityStatus(
    this.currentOccupants,
    this.capacityIndividual
  );
});

EvacPlaceSchema.index({ barangayName: 1 });
EvacPlaceSchema.index({ capacityStatus: 1 });
EvacPlaceSchema.index({ showOnLanding: 1 });
EvacPlaceSchema.index({ isArchived: 1 });
EvacPlaceSchema.index({ currentOccupants: 1 });

module.exports = mongoose.model("EvacPlace", EvacPlaceSchema);
