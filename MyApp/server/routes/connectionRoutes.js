const express = require('express');
const connectionController = require("../controllers/connectionController");
const router = express.Router();

router.post("/create/:id", connectionController.createConnection);
router.post("/join/:id", connectionController.joinConnection);
router.get("/members/:id", connectionController.getConnectionMembers);
router.get("/user/:id", connectionController.getUserConnections);
router.delete("/leave/:userId/:connectionId", connectionController.leaveConnection);
router.put("/safe/:id", connectionController.markSafe);
router.put("/not-safe/:id", connectionController.markNotSafe);
router.delete("/delete/:connectionId/:userId", connectionController.deleteConnection);
router.put("/kick/:connectionId/:memberId/:userId", connectionController.kickMember);
router.put("/approve/:connectionId/:memberId/:userId", connectionController.approveMember);
router.put("/approve/:connectionId/:memberId", connectionController.approveMember);
router.put("/reject/:connectionId/:memberId/:userId", connectionController.rejectMember);
router.put("/reject/:connectionId/:memberId", connectionController.rejectMember);
router.get("/:connectionId", connectionController.getConnectionById);

module.exports = router;
