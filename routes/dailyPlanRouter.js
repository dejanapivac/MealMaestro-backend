const express = require("express");
import planMiddleware from "../middleware/planMiddleware";

const router = express.Router();

router.route("/:id/remove").patch(planMiddleware.deleteMeal);
router.route("/:id/add").patch(planMiddleware.addMeal);
router.route("/").get(planMiddleware.updatee);

module.exports = router;