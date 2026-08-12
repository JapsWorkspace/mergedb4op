const FoodPackTemplate = require("../models/FoodPackTemplate");
const InventoryItem = require("../models/InventoryItem");

const normalizeString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLower = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase();
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getInventoryExpiryStatus = (expirationDate) => {
  if (!expirationDate) return "no_expiry";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expirationDate);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) return "expired";
  if (daysUntilExpiration <= 30) return "soon";
  return "ok";
};

const sortInventoryDocsForTemplate = (docs = []) =>
  docs.slice().sort((left, right) => {
    const leftExpiry = left?.expirationDate
      ? new Date(left.expirationDate).getTime()
      : Number.POSITIVE_INFINITY;
    const rightExpiry = right?.expirationDate
      ? new Date(right.expirationDate).getTime()
      : Number.POSITIVE_INFINITY;

    if (leftExpiry !== rightExpiry) {
      return leftExpiry - rightExpiry;
    }

    const leftCreated = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreated = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
    return leftCreated - rightCreated;
  });

const validateTemplateItems = async (items = []) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one item is required.";
  }

  for (const item of items) {
    const inventoryItemId = normalizeString(item.inventoryItemId);
    const itemName = normalizeString(item.itemName);
    const category = normalizeLower(item.category);
    const quantityPerPack = toNumber(item.quantityPerPack);
    const unit = normalizeString(item.unit);

    if (!inventoryItemId) {
      return "Each template item must have an inventoryItemId.";
    }

    if (!itemName) {
      return "Each template item must have an itemName.";
    }

    if (!category) {
      return `Category is required for item "${itemName}".`;
    }

    if (quantityPerPack <= 0) {
      return `Quantity per pack must be greater than 0 for item "${itemName}".`;
    }

    if (!unit) {
      return `Unit is required for item "${itemName}".`;
    }

    const inventoryDoc = await InventoryItem.findOne({
      _id: inventoryItemId,
      isArchive: false,
      type: "goods",
    });

    if (!inventoryDoc) {
      return `Inventory item not found for "${itemName}".`;
    }
  }

  return null;
};

const createFoodPackTemplate = async (req, res) => {
  try {
    const username = String(req.session?.username || "");
    const name = normalizeString(req.body.name);
    const description = normalizeString(req.body.description);

    if (!name) {
      return res.status(400).json({ message: "Template name is required." });
    }

    const items = Array.isArray(req.body.items)
      ? req.body.items.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          itemName: normalizeString(item.itemName),
          category: normalizeLower(item.category),
          quantityPerPack: toNumber(item.quantityPerPack),
          unit: normalizeString(item.unit),
          remarks: normalizeString(item.remarks),
        }))
      : [];

    const validationError = await validateTemplateItems(items);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const existing = await FoodPackTemplate.findOne({
      name,
      isArchived: false,
    });

    if (existing) {
      return res.status(400).json({
        message: "A food pack template with this name already exists.",
      });
    }

    const template = await FoodPackTemplate.create({
      name,
      description,
      items,
      isActive: true,
      isArchived: false,
      createdBy: username,
      updatedBy: username,
    });

    res.status(201).json(template);
  } catch (err) {
    console.error("Create Food Pack Template Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getFoodPackTemplates = async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || "").toLowerCase() === "true";

    const query = {
      isArchived: false,
    };

    if (activeOnly) {
      query.isActive = true;
    }

    const templates = await FoodPackTemplate.find(query).sort({ createdAt: -1 });
    res.json(templates);
  } catch (err) {
    console.error("Get Food Pack Templates Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const getFoodPackTemplateById = async (req, res) => {
  try {
    const template = await FoodPackTemplate.findById(req.params.id);

    if (!template || template.isArchived) {
      return res.status(404).json({ message: "Food pack template not found." });
    }

    res.json(template);
  } catch (err) {
    console.error("Get Food Pack Template By ID Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const updateFoodPackTemplate = async (req, res) => {
  try {
    const username = String(req.session?.username || "");
    const { id } = req.params;

    const template = await FoodPackTemplate.findById(id);
    if (!template || template.isArchived) {
      return res.status(404).json({ message: "Food pack template not found." });
    }

    if (req.body.name !== undefined) {
      const name = normalizeString(req.body.name);
      if (!name) {
        return res.status(400).json({ message: "Template name is required." });
      }

      const existing = await FoodPackTemplate.findOne({
        _id: { $ne: template._id },
        name,
        isArchived: false,
      });

      if (existing) {
        return res.status(400).json({
          message: "A food pack template with this name already exists.",
        });
      }

      template.name = name;
    }

    if (req.body.description !== undefined) {
      template.description = normalizeString(req.body.description);
    }

    if (req.body.isActive !== undefined) {
      template.isActive = Boolean(req.body.isActive);
    }

    if (req.body.items !== undefined) {
      const items = Array.isArray(req.body.items)
        ? req.body.items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            itemName: normalizeString(item.itemName),
            category: normalizeLower(item.category),
            quantityPerPack: toNumber(item.quantityPerPack),
            unit: normalizeString(item.unit),
            remarks: normalizeString(item.remarks),
          }))
        : [];

      const validationError = await validateTemplateItems(items);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      template.items = items;
    }

    template.updatedBy = username;

    await template.save();
    res.json(template);
  } catch (err) {
    console.error("Update Food Pack Template Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const archiveFoodPackTemplate = async (req, res) => {
  try {
    const template = await FoodPackTemplate.findById(req.params.id);

    if (!template || template.isArchived) {
      return res.status(404).json({ message: "Food pack template not found." });
    }

    template.isArchived = true;
    template.isActive = false;

    await template.save();

    res.json({
      message: "Food pack template archived successfully.",
      template,
    });
  } catch (err) {
    console.error("Archive Food Pack Template Error:", err);
    res.status(500).json({ message: err.message });
  }
};

const previewFoodPackTemplateRelease = async (req, res) => {
  try {
    const { id } = req.params;
    const foodPacks = toNumber(req.query.foodPacks);

    if (foodPacks <= 0) {
      return res.status(400).json({
        message: "foodPacks query parameter must be greater than 0.",
      });
    }

    const template = await FoodPackTemplate.findById(id);

    if (!template || template.isArchived) {
      return res.status(404).json({ message: "Food pack template not found." });
    }

    const previewItems = [];
    const stockIssues = [];

    for (const item of template.items || []) {
      const totalRequired = Number(item.quantityPerPack || 0) * foodPacks;
      const matchingInventoryDocs = sortInventoryDocsForTemplate(
        await InventoryItem.find({
          isArchive: false,
          type: "goods",
          name: item.itemName,
          category: item.category,
          unit: item.unit,
        })
      );
      const inventoryDoc =
        matchingInventoryDocs.find((doc) => Number(doc.quantity || 0) > 0) || null;
      const availableQuantity = Number(inventoryDoc?.quantity || 0);
      const expiryStatus = inventoryDoc
        ? getInventoryExpiryStatus(inventoryDoc.expirationDate)
        : "no_expiry";
      const sufficient =
        availableQuantity >= totalRequired && expiryStatus !== "expired";

      previewItems.push({
        inventoryItemId: inventoryDoc?._id || item.inventoryItemId,
        itemName: item.itemName,
        category: item.category,
        unit: item.unit,
        quantityPerPack: Number(item.quantityPerPack || 0),
        quantityRequired: totalRequired,
        availableQuantity,
        sufficient,
        expiryStatus,
      });

      if (!inventoryDoc || availableQuantity < totalRequired || expiryStatus === "expired") {
        stockIssues.push({
          itemName: item.itemName,
          required: totalRequired,
          available: availableQuantity,
          unit: item.unit,
          expiryStatus,
        });
      }
    }

    res.json({
      templateId: template._id,
      templateName: template.name,
      foodPacks,
      items: previewItems,
      hasStockIssue: stockIssues.length > 0,
      stockIssues,
    });
  } catch (err) {
    console.error("Preview Food Pack Template Release Error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createFoodPackTemplate,
  getFoodPackTemplates,
  getFoodPackTemplateById,
  updateFoodPackTemplate,
  archiveFoodPackTemplate,
  previewFoodPackTemplateRelease,
};
