const mongoose = require("mongoose");

const TshirtSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Product name is required."],
        trim: true
    },
    sku: {
        type: String,
        unique: true,
        required: [true, "A unique SKU is required."],
        trim: true
    },
    price: {
        type: Number,
        required: [true, "Price is required."],
        min: [0, "Price cannot be negative."]
    },
    description: {
        type: String,
        trim: true
    },
    // The core of the update is this 'variants' array
    variants: [{
        colorName: {
            type: String,
            required: true, // e.g., "Burgundy"
            trim: true
        },
        colorHex: {
            type: String // e.g., "#800020"
        },
        images: [{
            //Key and location for AWS S3
            // public_id: { type: String, required: true },
            key: { type: String, required: true },
            // url: { type: String, required: true }
            location: { type: String, required: true }
        }],
        stock: [{
            size: {
                type: String,
                required: true,
                enum: ["XS", "S", "M", "L", "XL", "XXL"]
            },
            quantityInStock: {
                type: Number,
                required: true,
                default: 0,
                min: 0
            }
        }]
    }],
    category: {
        main: { type: String, required: true }, // e.g., "T-Shirts"
        sub: { type: String } // e.g., "Plain T-Shirts"
    },
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    numReviews: {
        type: Number,
        default: 0
    },
    material: {
        type: String
    },
    collectionType: {
        type: String,
        enum: ["mostLoved", "seasonCollection", "Basic"],
        default: "Basic"
    },
    // Use ObjectId to reference other products in the same collection
    similarProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tshirt'
    }]
}, {
    // This is a better way to handle createdAt and updatedAt
    timestamps: true
});

module.exports = mongoose.model("Tshirt", TshirtSchema);