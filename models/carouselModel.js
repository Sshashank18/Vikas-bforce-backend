// const mongoose = require("mongoose");

// // This schema defines what a single image in the carousel looks like
// // It's consistent with the 'images' array in your TshirtSchema
// const CarouselImageSchema = new mongoose.Schema({
//     public_id: { 
//         type: String, 
//         required: [true, "Image public_id is required."] 
//     },
//     url: { 
//         type: String, 
//         required: [true, "Image URL is required."] 
//     },
//     // Optional: Add alt text for accessibility
//     altText: {
//         type: String,
//         trim: true
//     },
//     // Optional: Add a link for the carousel slide
//     link: {
//         type: String,
//         trim: true
//     }
// });

// // This schema represents the Hero Carousel setting itself
// // You will likely only have one document of this type in your database
// const HeroCarouselSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true,
//         unique: true,
//         default: 'mainHeroCarousel' // A unique name to find and update this doc
//     },
//     images: [CarouselImageSchema] // An array of all images to display
// }, {
//     timestamps: true // Tracks when the carousel was last updated
// });

// module.exports = mongoose.model("HeroCarousel", HeroCarouselSchema);


const mongoose = require("mongoose");

// This schema defines what a single image in the carousel looks like
const CarouselImageSchema = new mongoose.Schema({
    // Renamed from public_id
    key: { 
        type: String, 
        required: [true, "Image S3 key is required."] 
    },
    // Renamed from url
    location: { 
        type: String, 
        required: [true, "Image S3 location (URL) is required."] 
    },
    // Optional: Add alt text for accessibility
    altText: {
        type: String,
        trim: true
    },
    // Optional: Add a link for the carousel slide
    link: {
        type: String,
        trim: true
    }
});

// This schema represents the Hero Carousel setting itself
const HeroCarouselSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        default: 'mainHeroCarousel' // A unique name to find and update this doc
    },
    images: [CarouselImageSchema] // An array of all images to display
}, {
    timestamps: true // Tracks when the carousel was last updated
});

module.exports = mongoose.model("HeroCarousel", HeroCarouselSchema);