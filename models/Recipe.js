const mongoose = require("mongoose");
const { Cluster_Accounts } = require("../config/db");

const ingredientSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    enum: [
      'grams', 'kg', 'ml', 'liters', 'cups', 'tablespoons', 'teaspoons',
      'pieces', 'slices', 'cloves', 'pinch', 'dash', 'handful', 'bunch',
      'packet', 'can', 'bottle', 'tbsp', 'tsp', 'oz', 'lb', 'pound'
    ]
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: false });

const instructionSchema = new mongoose.Schema({
  step: {
    type: Number,
    required: true,
    min: 1
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: Number, // in minutes
    min: 0
  },
  temperature: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  }
}, { _id: false });

const nutritionSchema = new mongoose.Schema({
  calories: { type: Number, min: 0 },
  protein: { type: Number, min: 0 }, // in grams
  carbs: { type: Number, min: 0 }, // in grams
  fat: { type: Number, min: 0 }, // in grams
  fiber: { type: Number, min: 0 }, // in grams
  sugar: { type: Number, min: 0 }, // in grams
  sodium: { type: Number, min: 0 }, // in mg
  cholesterol: { type: Number, min: 0 } // in mg
}, { _id: false });

const recipeSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: 300
  },

  // Categorization
  category: {
    type: String,
    required: true,
    enum: [
      'appetizer', 'main_course', 'dessert', 'beverage', 'snack',
      'breakfast', 'lunch', 'dinner', 'soup', 'salad', 'side_dish',
      'sauce', 'condiment', 'bread', 'pasta', 'rice', 'other'
    ]
  },
  cuisine: {
    type: String,
    enum: [
      'indian', 'chinese', 'italian', 'mexican', 'thai', 'japanese',
      'korean', 'american', 'mediterranean', 'french', 'german',
      'spanish', 'middle_eastern', 'continental', 'fusion', 'other'
    ]
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],

  // Difficulty and Time
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert']
  },
  prepTime: {
    type: Number,
    required: true,
    min: 0 // in minutes
  },
  cookTime: {
    type: Number,
    required: true,
    min: 0 // in minutes
  },
  totalTime: {
    type: Number,
    required: true,
    min: 0 // in minutes
  },
  servings: {
    type: Number,
    required: true,
    min: 1
  },

  // Recipe Content
  ingredients: {
    type: [ingredientSchema],
    required: true,
    validate: {
      validator: function(ingredients) {
        return ingredients && ingredients.length > 0;
      },
      message: 'At least one ingredient is required'
    }
  },
  instructions: {
    type: [instructionSchema],
    required: true,
    validate: {
      validator: function(instructions) {
        return instructions && instructions.length > 0;
      },
      message: 'At least one instruction is required'
    }
  },

  // Nutritional Information
  nutrition: {
    type: nutritionSchema,
    default: {}
  },

  // Media
  images: [{
    url: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  videoUrl: {
    type: String,
    trim: true
  },

  // Additional Information
  tips: [{
    type: String,
    trim: true,
    maxlength: 500
  }],
  variations: [{
    type: String,
    trim: true,
    maxlength: 500
  }],
  allergens: [{
    type: String,
    enum: [
      'gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'soy', 'fish',
      'shellfish', 'sesame', 'mustard', 'celery', 'lupin', 'sulphites'
    ]
  }],
  dietaryRestrictions: [{
    type: String,
    enum: [
      'vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free',
      'low_carb', 'keto', 'paleo', 'halal', 'kosher', 'low_sodium'
    ]
  }],

  // Cost and Pricing
  estimatedCost: {
    type: Number,
    min: 0
  },
  costPerServing: {
    type: Number,
    min: 0
  },

  // Vendor and University Information
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  uniId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Uni',
    required: true
  },

  // Status and Visibility
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },

  // Engagement Metrics
  views: {
    type: Number,
    default: 0,
    min: 0
  },
  likes: {
    type: Number,
    default: 0,
    min: 0
  },
  saves: {
    type: Number,
    default: 0,
    min: 0
  },
  ratings: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    review: {
      type: String,
      trim: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  publishedAt: {
    type: Date
  }
});

// Indexes for better performance
recipeSchema.index({ vendorId: 1, status: 1 });
recipeSchema.index({ uniId: 1, status: 1 });
recipeSchema.index({ category: 1, cuisine: 1 });
recipeSchema.index({ status: 1, isPublic: 1 });
recipeSchema.index({ createdAt: -1 });
recipeSchema.index({ views: -1 });
recipeSchema.index({ likes: -1 });
recipeSchema.index({ averageRating: -1 });
recipeSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Pre-save middleware to calculate total time and update timestamps
recipeSchema.pre('save', function(next) {
  this.totalTime = this.prepTime + this.cookTime;
  this.updatedAt = new Date();
  
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Pre-save middleware to calculate average rating
recipeSchema.pre('save', function(next) {
  if (this.ratings && this.ratings.length > 0) {
    const totalRating = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
    this.averageRating = Math.round((totalRating / this.ratings.length) * 10) / 10;
  } else {
    this.averageRating = 0;
  }
  next();
});

// Virtual for formatted prep time
recipeSchema.virtual('formattedPrepTime').get(function() {
  if (this.prepTime < 60) {
    return `${this.prepTime}m`;
  } else {
    const hours = Math.floor(this.prepTime / 60);
    const minutes = this.prepTime % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
});

// Virtual for formatted cook time
recipeSchema.virtual('formattedCookTime').get(function() {
  if (this.cookTime < 60) {
    return `${this.cookTime}m`;
  } else {
    const hours = Math.floor(this.cookTime / 60);
    const minutes = this.cookTime % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
});

// Virtual for formatted total time
recipeSchema.virtual('formattedTotalTime').get(function() {
  if (this.totalTime < 60) {
    return `${this.totalTime}m`;
  } else {
    const hours = Math.floor(this.totalTime / 60);
    const minutes = this.totalTime % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
});

// Ensure virtual fields are included in JSON output
recipeSchema.set('toJSON', { virtuals: true });
recipeSchema.set('toObject', { virtuals: true });

module.exports = Cluster_Accounts.model("Recipe", recipeSchema);
