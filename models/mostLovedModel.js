// const mongoose = require("mongoose");

// // A re-usable schema for the images in this section
// const ImageSchema = new mongoose.Schema({
//     public_id: { 
//         type: String, 
//         required: [true, "Image public_id is required."] 
//     },
//     url: { 
//         type: String, 
//         required: [true, "Image URL is required."] 
//     },
//     altText: {
//         type: String,
//         trim: true
//     }
// });

// // This schema represents the "Most Loved" section setting
// // It stores two separate arrays for desktop and mobile images
// const MostLovedSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: true,
//         unique: true,
//         default: 'mainMostLoved' // A unique name to find and update this doc
//     },
//     desktopImages: [ImageSchema],
//     mobileImages: [ImageSchema]
// }, {
//     timestamps: true // Tracks when this section was last updated
// });

// module.exports = mongoose.model("MostLoved", MostLovedSchema);


const mongoose = require("mongoose");

// A re-usable schema for the images in this section
const ImageSchema = new mongoose.Schema({
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
    altText: {
        type: String,
        trim: true
    }
});

// This schema represents the "Most Loved" section setting
// It stores two separate arrays for desktop and mobile images
const MostLovedSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        default: 'mainMostLoved' // A unique name to find and update this doc
    },
    desktopImages: [ImageSchema],
    mobileImages: [ImageSchema]
}, {
    timestamps: true // Tracks when this section was last updated
});

module.exports = mongoose.model("MostLoved", MostLovedSchema);