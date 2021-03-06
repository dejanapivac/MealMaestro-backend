import asyncHandler from "../utils/asyncHandler";
import WeeklyPlan from "../schemas/weeklyPlanSchema";
import DailyPlan from "../schemas/dailyPlanSchema";
import Recipe from "../schemas/recipeSchema";
import GroceryList from "../schemas/groceryListSchema";
import Fridge from "../schemas/fridgeSchema";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const mealTypes = ["Breakfast", "Lunch", "Snack", "Dinner", "Dessert"];

function findUnit(ingredient, unit) {
  if (unit == "g") return 1;
  if (unit == "kg") return 1000;
  for (var key in ingredient) {
    if (
      ["pieceMeasurements", "liquidMeasurements", "cupMeasurements"].includes(
        key
      )
    ) {
      for (var measure of ingredient[key]) {
        if (measure.unit == unit) return measure.g_weight;
      }
    }
  }
  return 1;
}

exports.getWeeklyPlan = asyncHandler(async (req, res, next) => {
  const weeklyPlan = await WeeklyPlan.findOne({
    user: req.user._id,
    start_day: new Date(req.query.startDay),
  });

  res.json(weeklyPlan);
});

exports.createWeeklyPlan = asyncHandler(async (req, res, next) => {
  const userData = req.user;
  const preferences = userData.preferences;

  var dailyMeals = [];

  for (var day of days) {
    dailyMeals.push({ day: day, user: userData._id, meals: [] });
  }

  for (var meal of mealTypes) {
    var saved_recipes = [];

    var queryObject = { meal_type: meal };
    if (preferences.length) queryObject["tags"] = { $all: preferences };

    var meals = await Recipe.find(queryObject);

    for (var index in days) {
      var chosen_recipe;

      if (meals.length) {
        var i = Math.floor(Math.random() * meals.length);
        chosen_recipe = meals[i];
        saved_recipes.push(meals.splice(i, 1)[0]);
      } else {
        var i = Math.floor(Math.random() * saved_recipes.length);
        chosen_recipe = saved_recipes[i];
      }

      dailyMeals[index].meals.push({ recipe: chosen_recipe._id });
    }
  }

  var daily_meals = await Promise.all(
    dailyMeals.map(async (plan) => {
      const dailyPlan = await DailyPlan.create(plan);
      return dailyPlan._id;
    })
  );

  const weeklyPlan = await WeeklyPlan.create({
    user: userData._id,
    start_day: new Date(req.query.startDay),
    daily_plans: daily_meals,
  });

  res.status(200).json({
    status: "succes",
    data: null,
  });
});

exports.deleteMeal = asyncHandler(async (req, res, next) => {
  const plan = await DailyPlan.updateOne(
    { _id: req.params.id },
    { $pull: { meals: { _id: req.query.mealPlanId } } }
  );

  res.status(200).json({
    status: "succes",
    data: null,
  });
});

exports.addMeal = asyncHandler(async (req, res, next) => {
  const plan = await DailyPlan.updateOne(
    { _id: req.params.id },
    { $push: { meals: { recipe: req.query.recipeId } } }
  );

  res.status(200).json({
    status: "succes",
    data: null,
  });
});

exports.confirmPlan = asyncHandler(async (req, res, next) => {
  await WeeklyPlan.findByIdAndUpdate(
    { _id: req.params.id },
    { $set: { confirmed: true } }
  );
  next();
});

exports.createGroceryList = asyncHandler(async (req, res, next) => {
  const weeklyPlan = await WeeklyPlan.findById(req.params.id);
  const fridge = await Fridge.findOne({ user: weeklyPlan.user });

  var list_items = [];
  var ingredient_quantity = {};

  for (var daily_plan of weeklyPlan.daily_plans) {
    for (var meal of daily_plan.meals) {
      for (var ingredient of meal.recipe.ingredients_list) {
        const ingredient_id = ingredient.ingredient._id;
        const g_weight = findUnit(ingredient.ingredient, ingredient.unit);

        if (ingredient_quantity[ingredient_id]) {
          const new_value =
            ingredient_quantity[ingredient_id] + g_weight * ingredient.quantity;
          ingredient_quantity[ingredient_id] = new_value;
        } else
          ingredient_quantity[ingredient_id] = g_weight * ingredient.quantity;
      }
    }
  }

  if (fridge) {
    for (var category of fridge.fridge_items) {
      for (var item of category.ingredients_list) {
        const existing_element = Object.keys(ingredient_quantity).filter(
          (x) => x == String(item.ingredient._id)
        )[0];

        if (existing_element) {
          var required_quantity = ingredient_quantity[existing_element];
          var fridge_quantity = item.quantity;
          var diff = required_quantity - fridge_quantity;

          if (diff < 0) delete ingredient_quantity[existing_element];
          else ingredient_quantity[existing_element] = diff;
        }
      }
    }
  }

  for (var key in ingredient_quantity) {
    list_items.push({
      ingredient: key,
      quantity: Math.ceil(ingredient_quantity[key] / 10) * 10,
      required_quantity: Math.ceil(ingredient_quantity[key]),
    });
  }

  await GroceryList.updateMany(
    { user: weeklyPlan.user._id },
    { $set: { active: false } }
  );

  const groceryList = await GroceryList.create({
    user: weeklyPlan.user._id,
    list_items: list_items,
  });

  await WeeklyPlan.findByIdAndUpdate(
    { _id: req.params.id },
    { $set: { grocery_list: groceryList._id } }
  );

  res.status(200).json({
    status: "succes",
    data: null,
  });
});

exports.cookMeal = asyncHandler(async (req, res, next) => {
  var list = await DailyPlan.findByIdAndUpdate(
    { _id: req.params.id },
    { $set: { "meals.$[elem].cooked": true } },
    { arrayFilters: [{ "elem._id": req.query.mealPlanId }] }
  );

  var ingredients_objects = [];

  for (var meal of list.meals) {
    if (meal._id == req.query.mealPlanId) {
      for (var ingredient of meal.recipe.ingredients_list) {
        ingredients_objects.push({
          id: ingredient.ingredient._id,
          quantity:
            ingredient.quantity *
            findUnit(ingredient.ingredient, ingredient.unit),
          category: ingredient.ingredient.category,
        });
      }
    }
  }

  for (var ingredient of ingredients_objects) {
    var fridgeUpdate = await Fridge.updateOne(
      { user: list.user },
      {
        $inc: {
          "fridge_items.$[elem].ingredients_list.$[item].quantity":
            -ingredient.quantity,
        },
      },
      {
        arrayFilters: [
          { "elem.category": ingredient.category },
          {
            "item.ingredient": ingredient.id,
          },
        ],
      }
    );
  }

  res.status(200).json({
    status: "succes",
    data: null,
  });
});
