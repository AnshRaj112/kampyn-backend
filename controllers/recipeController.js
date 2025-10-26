const Recipe = require("../models/Recipe");
const Vendor = require("../models/account/Vendor");
const Uni = require("../models/account/Uni");

/**
 * Create a new recipe
 */
exports.createRecipe = async (req, res) => {
  try {
    // Check if vendor info exists in request
    if (!req.vendor || (!req.vendor._id && !req.vendor.vendorId)) {
      console.error("createRecipe - Missing vendor info:", {
        hasReqVendor: !!req.vendor,
        reqVendorKeys: req.vendor ? Object.keys(req.vendor) : []
      });
      return res.status(401).json({
        success: false,
        message: "Vendor authentication required"
      });
    }

    // Support both naming conventions
    const vendorId = req.vendor._id || req.vendor.vendorId;
    const uniId = req.vendor.uniID;

    // Validate required fields
    const {
      title,
      description,
      category,
      prepTime,
      cookTime,
      servings,
      ingredients,
      instructions
    } = req.body;

    if (!title || !description || !ingredients || !instructions) {
      return res.status(400).json({
        success: false,
        message: "Title, description, ingredients, and instructions are required"
      });
    }

    // Calculate total time
    const totalTime = prepTime + cookTime;

    // Create recipe data
    const recipeData = {
      ...req.body,
      vendorId,
      uniId,
      totalTime
    };

    const recipe = new Recipe(recipeData);
    await recipe.save();

    // Populate vendor and university information
    await recipe.populate('vendorId', 'fullName vendorName');
    await recipe.populate('uniId', 'fullName');

    res.status(201).json({
      success: true,
      message: "Recipe created successfully",
      data: recipe
    });
  } catch (error) {
    console.error("createRecipe error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create recipe",
      error: error.message
    });
  }
};

/**
 * Get all recipes for a vendor
 */
exports.getVendorRecipes = async (req, res) => {
  try {
    const vendorId = req.vendor._id || req.vendor.vendorId;
    const { status = 'published', page = 1, limit = 10, category, cuisine, search } = req.query;

    // Build query
    const query = { vendorId };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (cuisine) {
      query.cuisine = cuisine;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get recipes with pagination
    const recipes = await Recipe.find(query)
      .populate('vendorId', 'fullName vendorName')
      .populate('uniId', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalRecipes = await Recipe.countDocuments(query);

    res.json({
      success: true,
      data: recipes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecipes / parseInt(limit)),
        totalRecipes,
        hasNext: skip + recipes.length < totalRecipes,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("getVendorRecipes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipes",
      error: error.message
    });
  }
};

/**
 * Get all recipes for a university (from all vendors)
 */
exports.getUniversityRecipes = async (req, res) => {
  try {
    // Try to get university ID from middleware
    const uniId = req.uni?._id || req.university?._id;
    
    if (!uniId) {
      console.error("getUniversityRecipes - Missing university ID:", {
        hasReqUni: !!req.uni,
        hasReqUniversity: !!req.university,
        reqUniKeys: req.uni ? Object.keys(req.uni) : [],
        reqUniversityKeys: req.university ? Object.keys(req.university) : []
      });
      return res.status(401).json({
        success: false,
        message: "University ID not found. Authentication required.",
        error: "Cannot read properties of undefined (reading '_id')"
      });
    }
    
    const { 
      status = 'all', 
      page = 1, 
      limit = 10, 
      category, 
      cuisine, 
      search,
      vendorId 
    } = req.query;

    // Build query
    const query = { uniId };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (cuisine) {
      query.cuisine = cuisine;
    }
    
    if (vendorId && vendorId !== 'all') {
      query.vendorId = vendorId;
    }
    
    if (search) {
      query.$text = { $search: search };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get recipes with pagination
    const recipes = await Recipe.find(query)
      .populate('vendorId', 'fullName vendorName')
      .populate('uniId', 'fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Validate populated data
    const validRecipes = recipes.filter(recipe => {
      if (!recipe.vendorId || !recipe.uniId) {
        console.error("Recipe with missing vendorId or uniId:", recipe._id);
        return false;
      }
      return true;
    });

    // Get total count for pagination
    const totalRecipes = await Recipe.countDocuments(query);

    res.json({
      success: true,
      data: validRecipes,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalRecipes / parseInt(limit)),
        totalRecipes,
        hasNext: skip + recipes.length < totalRecipes,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error("getUniversityRecipes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipes",
      error: error.message
    });
  }
};

/**
 * Get a single recipe by ID
 */
exports.getRecipeById = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userType = req.user?.type || req.vendor?.type || req.university?.type;

    // Build query based on user type
    let query = { _id: recipeId };
    
    if (userType === 'vendor') {
      query.vendorId = req.vendor._id || req.vendor.vendorId;
    } else if (userType === 'university') {
      query.uniId = req.uni?._id || req.university?._id;
    }

    const recipe = await Recipe.findOne(query)
      .populate('vendorId', 'fullName vendorName')
      .populate('uniId', 'fullName');

    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found"
      });
    }

    // Increment view count for published recipes
    if (recipe.status === 'published') {
      await Recipe.findByIdAndUpdate(recipeId, { $inc: { views: 1 } });
      recipe.views += 1;
    }

    res.json({
      success: true,
      data: recipe
    });
  } catch (error) {
    console.error("getRecipeById error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipe",
      error: error.message
    });
  }
};

/**
 * Update a recipe
 */
exports.updateRecipe = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const vendorId = req.vendor._id || req.vendor.vendorId;

    // Check if recipe exists and belongs to vendor
    const existingRecipe = await Recipe.findOne({ _id: recipeId, vendorId });
    
    if (!existingRecipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found or you don't have permission to update it"
      });
    }

    // Calculate total time if prepTime and cookTime are provided
    if (req.body.prepTime && req.body.cookTime) {
      req.body.totalTime = req.body.prepTime + req.body.cookTime;
    }

    const updatedRecipe = await Recipe.findByIdAndUpdate(
      recipeId,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('vendorId', 'fullName vendorName')
     .populate('uniId', 'fullName');

    res.json({
      success: true,
      message: "Recipe updated successfully",
      data: updatedRecipe
    });
  } catch (error) {
    console.error("updateRecipe error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update recipe",
      error: error.message
    });
  }
};

/**
 * Delete a recipe
 */
exports.deleteRecipe = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const vendorId = req.vendor._id || req.vendor.vendorId;

    // Check if recipe exists and belongs to vendor
    const recipe = await Recipe.findOne({ _id: recipeId, vendorId });
    
    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found or you don't have permission to delete it"
      });
    }

    await Recipe.findByIdAndDelete(recipeId);

    res.json({
      success: true,
      message: "Recipe deleted successfully"
    });
  } catch (error) {
    console.error("deleteRecipe error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete recipe",
      error: error.message
    });
  }
};

/**
 * Update recipe status (draft, published, archived)
 */
exports.updateRecipeStatus = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { status } = req.body;
    const vendorId = req.vendor._id || req.vendor.vendorId;

    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be draft, published, or archived"
      });
    }

    // Check if recipe exists and belongs to vendor
    const recipe = await Recipe.findOne({ _id: recipeId, vendorId });
    
    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found or you don't have permission to update it"
      });
    }

    const updatedRecipe = await Recipe.findByIdAndUpdate(
      recipeId,
      { status, updatedAt: new Date() },
      { new: true }
    ).populate('vendorId', 'fullName vendorName')
     .populate('uniId', 'fullName');

    res.json({
      success: true,
      message: `Recipe ${status} successfully`,
      data: updatedRecipe
    });
  } catch (error) {
    console.error("updateRecipeStatus error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update recipe status",
      error: error.message
    });
  }
};

/**
 * Like/Unlike a recipe
 */
exports.toggleRecipeLike = async (req, res) => {
  try {
    const { recipeId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to like recipes"
      });
    }

    const recipe = await Recipe.findById(recipeId);
    
    if (!recipe) {
      return res.status(404).json({
        success: false,
        message: "Recipe not found"
      });
    }

    // For now, we'll just increment/decrement likes
    // In a real implementation, you'd want to track which users liked which recipes
    const action = req.body.action; // 'like' or 'unlike'
    
    if (action === 'like') {
      await Recipe.findByIdAndUpdate(recipeId, { $inc: { likes: 1 } });
    } else if (action === 'unlike') {
      await Recipe.findByIdAndUpdate(recipeId, { $inc: { likes: -1 } });
    }

    res.json({
      success: true,
      message: `Recipe ${action}d successfully`
    });
  } catch (error) {
    console.error("toggleRecipeLike error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update recipe like",
      error: error.message
    });
  }
};

/**
 * Get recipe statistics for a vendor
 */
exports.getRecipeStats = async (req, res) => {
  try {
    const vendorId = req.vendor._id || req.vendor.vendorId;

    const stats = await Recipe.aggregate([
      { $match: { vendorId: vendorId } },
      {
        $group: {
          _id: null,
          totalRecipes: { $sum: 1 },
          publishedRecipes: {
            $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] }
          },
          draftRecipes: {
            $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] }
          },
          archivedRecipes: {
            $sum: { $cond: [{ $eq: ["$status", "archived"] }, 1, 0] }
          },
          totalViews: { $sum: "$views" },
          totalLikes: { $sum: "$likes" },
          avgPrepTime: { $avg: "$prepTime" },
          avgCookTime: { $avg: "$cookTime" }
        }
      }
    ]);

    const categoryStats = await Recipe.aggregate([
      { $match: { vendorId: vendorId } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const cuisineStats = await Recipe.aggregate([
      { $match: { vendorId: vendorId } },
      {
        $group: {
          _id: "$cuisine",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || {
          totalRecipes: 0,
          publishedRecipes: 0,
          draftRecipes: 0,
          archivedRecipes: 0,
          totalViews: 0,
          totalLikes: 0,
          avgPrepTime: 0,
          avgCookTime: 0
        },
        categoryBreakdown: categoryStats,
        cuisineBreakdown: cuisineStats
      }
    });
  } catch (error) {
    console.error("getRecipeStats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipe statistics",
      error: error.message
    });
  }
};
