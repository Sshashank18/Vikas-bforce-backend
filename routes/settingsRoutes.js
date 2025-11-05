const express = require('express');
const router = express.Router({ mergeParams: true });
const multer = require('multer');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3'); // AWS SDK
const multerS3 = require('multer-s3'); // Multer storage engine for S3

// Import the new models (which now use 'key' and 'location')
const HeroCarousel = require('../models/carouselModel');
const MostLoved = require('../models/mostLovedModel');

// Auth guard
// router.use(ensureAuthenticated);

// --- Configuration ---

// 1. Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. Configure Multer-S3 Storage (Dynamic Folders)
// This will replace multer.memoryStorage()
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  // acl: 'public-read', // Makes images publicly viewable
  
  // This 'key' function dynamically sets the S3 folder
  key: (req, file, cb) => {
    let folder;

    // Use the file.fieldname to determine the S3 folder
    if (file.fieldname === 'heroImages') {
      folder = 'bforce_hero_carousel';
    } else if (file.fieldname === 'desktopImages') {
      folder = 'bforce_most_loved_desktop';
    } else if (file.fieldname === 'mobileImages') {
      folder = 'bforce_most_loved_mobile';
    } else {
      folder = 'bforce_other_uploads'; // A safe fallback
    }

    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, `${folder}/${fileName}`);
  },
});

// 3. Initialize Multer with the new S3 storage
const upload = multer({ storage: s3Storage });

// --- Helper Function ---
/**
 * Deletes a file from S3.
 * @param {string} key - The S3 object key (e.g., "bforce_hero_carousel/filename.jpg").
 */
const deleteFromS3 = (key) => {
  if (!key) return; // Prevent errors from empty keys
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  // Fire and forget
  return s3Client.send(command)
    .then(res => console.log(`Deleted ${key} from S3.`))
    .catch(err => console.error(`Error deleting ${key} from S3:`, err));
};

// ---------------- Routes: Hero Carousel ---------------- //

/**
 * @route   GET /api/settings/hero-carousel
 * @desc    Get the active hero carousel images
 */
router.get('/hero-carousel', async (req, res) => {
  try {
    let carousel = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });
    if (!carousel) {
      carousel = new HeroCarousel();
      await carousel.save();
    }
    res.json(carousel);
  } catch (err) {
    console.error("Error fetching Hero Carousel settings:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST /api/settings/hero-carousel
 * @desc    Update (upsert) the hero carousel images. Replaces all existing images.
 */
// The 'upload' middleware now handles the S3 upload *before* this code runs
router.post('/hero-carousel', upload.array('heroImages'), async (req, res) => {
  try {
    // 1. Find the existing document to get old image keys
    const doc = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });
    // Use the 'key' property from your updated schema
    const oldImageKeys = doc ? doc.images.map(img => img.key) : [];

    // 2. Get new image data from req.files (no more manual upload needed!)
    // req.files now contains { key, location } from multer-s3
    const imagesToSave = (req.files || []).map(file => ({
        key: file.key,
        location: file.location,
        // altText: "", // You would need to update your frontend to send this
        // link: "",
    }));
    
    // 3. Update or create the document with the new images
    const updatedCarousel = await HeroCarousel.findOneAndUpdate(
      { name: 'mainHeroCarousel' },
      { $set: { images: imagesToSave } },
      { new: true, upsert: true, runValidators: true }
    );

    // 4. Delete old images from S3 (fire and forget)
    if (oldImageKeys.length > 0) {
      Promise.all(oldImageKeys.map(key => deleteFromS3(key)))
        .catch(err => console.error("Error deleting old hero images:", err));
    }

    res.status(201).json(updatedCarousel);
  } catch (err) {
    console.error("Error updating Hero Carousel:", err.message);
    res.status(500).send('Server Error');
  }
});


// ---------------- Routes: Most Loved ---------------- //

/**
 * @route   GET /api/settings/most-loved
 * @desc    Get the active "Most Loved" section images
 */
router.get('/most-loved', async (req, res) => {
  try {
    let mostLoved = await MostLoved.findOne({ name: 'mainMostLoved' });
    if (!mostLoved) {
      mostLoved = new MostLoved();
      await mostLoved.save();
    }
    res.json(mostLoved);
  } catch (err) {
    console.error("Error fetching Most Loved settings:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST /api/settings/most-loved
 * @desc    Update (upsert) the "Most Loved" images.
 */
router.post('/most-loved', upload.fields([
    { name: 'desktopImages' }, 
    { name: 'mobileImages' }
]), async (req, res) => {
  try {
    const doc = await MostLoved.findOne({ name: 'mainMostLoved' });
    // Get old S3 keys
    const oldDesktopKeys = doc ? doc.desktopImages.map(img => img.key) : [];
    const oldMobileKeys = doc ? doc.mobileImages.map(img => img.key) : [];

    const files = req.files || {};
    const desktopFiles = files.desktopImages || [];
    const mobileFiles = files.mobileImages || [];
    
    const keysToDelete = [];
    const updatePayload = {};

    // 1. Process Desktop Images (if any were uploaded)
    if (desktopFiles.length > 0) {
      // No more upload promises, just map the file data
      updatePayload.desktopImages = desktopFiles.map(file => ({ 
          key: file.key, 
          location: file.location 
      }));
      keysToDelete.push(...oldDesktopKeys);
    }

    // 2. Process Mobile Images (if any were uploaded)
    if (mobileFiles.length > 0) {
      updatePayload.mobileImages = mobileFiles.map(file => ({ 
          key: file.key, 
          location: file.location 
      }));
      keysToDelete.push(...oldMobileKeys);
    }
    
    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ msg: "No images provided to update." });
    }

    // 3. Update or create the document
    const updatedMostLoved = await MostLoved.findOneAndUpdate(
      { name: 'mainMostLoved' },
      { $set: updatePayload },
      { new: true, upsert: true, runValidators: true }
    );

    // 4. Delete old images from S3
    if (keysToDelete.length > 0) {
      Promise.all(keysToDelete.map(key => deleteFromS3(key)))
        .catch(err => console.error("Error deleting old Most Loved images:", err));
    }

    res.status(201).json(updatedMostLoved);
  } catch (err) {
    console.error("Error updating Most Loved settings:", err.message);
    res.status(500).send('Server Error');
  }
});


// ---------------- Routes: Delete Individual Images ---------------- //

// > **⚠️ IMPORTANT API CHANGE FOR DELETE ROUTES**
// >
// > Your old `public_id` was probably a simple string. The new S3 `key` includes the folder path (e.g., `bforce_hero_carousel/12345.jpg`).
// >
// > To pass this in a URL, the frontend **must** encode it:
// > `const S3_KEY = "bforce_hero_carousel/12345.jpg";`
// > `const encodedKey = encodeURIComponent(S3_KEY);`
// > `// encodedKey is "bforce_hero_carousel%2F12345.jpg"`
// >
// > Your API call must use this `encodedKey`. The backend code below uses `decodeURIComponent` to handle this.

/**
 * @route   DELETE /api/settings/hero-carousel/:imageKey
 * @desc    Delete a specific hero carousel image
 */
router.delete('/hero-carousel/:imageKey', async (req, res) => {
  try {
    // Decode the key from the URL parameter
    const imageKey = decodeURIComponent(req.params.imageKey);
    
    const doc = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });
    if (!doc) {
      return res.status(404).json({ msg: 'Carousel not found' });
    }
    
    // Filter out the image by its S3 key
    const updatedImages = doc.images.filter(img => img.key !== imageKey);
    
    doc.images = updatedImages;
    await doc.save();
    
    // Delete from S3
    await deleteFromS3(imageKey);
    
    res.json({ msg: 'Image deleted successfully', carousel: doc });
  } catch (err) {
    console.error("Error deleting hero carousel image:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   DELETE /api/settings/most-loved/:type/:imageKey
 * @desc    Delete a specific most loved image (desktop or mobile)
 */
router.delete('/most-loved/:type/:imageKey', async (req, res) => {
  try {
    const { type } = req.params;
    // Decode the key from the URL parameter
    const imageKey = decodeURIComponent(req.params.imageKey);
    
    if (type !== 'desktop' && type !== 'mobile') {
      return res.status(400).json({ msg: 'Invalid image type' });
    }
    
    const doc = await MostLoved.findOne({ name: 'mainMostLoved' });
    if (!doc) {
      return res.status(404).json({ msg: 'Most Loved section not found' });
    }
    
    // Filter out the image by its S3 key
    if (type === 'desktop') {
      doc.desktopImages = doc.desktopImages.filter(img => img.key !== imageKey);
    } else {
      doc.mobileImages = doc.mobileImages.filter(img => img.key !== imageKey);
    }
    
    await doc.save();
    
    // Delete from S3
    await deleteFromS3(imageKey);
    
    res.json({ msg: 'Image deleted successfully', mostLoved: doc });
  } catch (err) {
    console.error("Error deleting most loved image:", err.message);
    res.status(500).send('Server Error');
  }
});


module.exports = router;


// const express = require('express');
// const router = express.Router({ mergeParams: true });
// const multer = require('multer');
// const cloudinary = require('cloudinary').v2;

// // Import the new models
// const HeroCarousel = require('../models/carouselModel');
// const MostLoved = require('../models/mostLovedModel');

// // Auth guard (commented out, same as your T-shirt routes)
// // function ensureAuthenticated(req, res, next) {
// //   if (req.isAuthenticated && req.isAuthenticated()) {
// //     return next();
// //   }
// //   return res.status(401).json({ msg: 'Unauthorized' });
// // }
// // router.use(ensureAuthenticated);

// // --- Configuration ---

// // Cloudinary config (ensure these ENV variables are set)
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Multer setup for memory storage
// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// // --- Helper Function ---
// /**
//  * Uploads a file buffer to Cloudinary in a specific folder.
//  * @param {Buffer} fileBuffer - The buffer of the file to upload.
//  * @param {string} folderName - The Cloudinary folder to upload to.
// * @returns {Promise<{public_id: string, url: string}>} A promise that resolves with the upload result.
//  */
// const uploadToCloudinary = (fileBuffer, folderName) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       { folder: folderName }, // Use the dynamic folder name
//       (error, result) => {
//         if (error) return reject(error);
//         resolve({ public_id: result.public_id, url: result.secure_url });
//       }
//     );
//     uploadStream.end(fileBuffer);
//   });
// };

// // ---------------- Routes: Hero Carousel ---------------- //

// /**
//  * @route   GET /api/settings/hero-carousel
//  * @desc    Get the active hero carousel images
//  */
// router.get('/hero-carousel', async (req, res) => {
//   try {
//     // Find the one and only carousel doc
//     let carousel = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });

//     if (!carousel) {
//       // If it doesn't exist yet, create a default empty one
//       carousel = new HeroCarousel(); // Uses default name 'mainHeroCarousel'
//       await carousel.save();
//     }
    
//     res.json(carousel);
//   } catch (err) {
//     console.error("Error fetching Hero Carousel settings:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   POST /api/settings/hero-carousel
//  * @desc    Update (upsert) the hero carousel images. Replaces all existing images.
//  */
// router.post('/hero-carousel', upload.array('heroImages'), async (req, res) => {
//   try {
//     // 1. Find the existing document to get old image IDs for deletion
//     const doc = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });
//     const oldImagePublicIds = doc ? doc.images.map(img => img.public_id) : [];

//     // 2. Upload all new images to Cloudinary
//     const uploadPromises = (req.files || []).map(file => 
//         uploadToCloudinary(file.buffer, "bforce_hero_carousel")
//     );
//     const newImages = await Promise.all(uploadPromises);

//     // 3. Format images for saving in the database
//     // Note: The React component only sends files, not altText or links.
//     // To add those, you'd need to send JSON data alongside the files.
//     const imagesToSave = newImages.map(img => ({
//         public_id: img.public_id,
//         url: img.url,
//         // altText: "", // Add if you send this data from the frontend
//         // link: "",     // Add if you send this data from the frontend
//     }));
    
//     // 4. Update or create the document with the new images
//     const updatedCarousel = await HeroCarousel.findOneAndUpdate(
//       { name: 'mainHeroCarousel' }, // Find by name
//       { $set: { images: imagesToSave } }, // Set the new images array
//       { new: true, upsert: true, runValidators: true } // Options
//     );

//     // 5. Delete old images from Cloudinary (no need to await)
//     if (oldImagePublicIds.length > 0) {
//       Promise.all(oldImagePublicIds.map(id => cloudinary.uploader.destroy(id)))
//         .catch(err => console.error("Error deleting old hero images:", err));
//     }

//     res.status(201).json(updatedCarousel);
//   } catch (err) {
//     console.error("Error updating Hero Carousel:", err.message);
//     res.status(500).send('Server Error');
//   }
// });


// // ---------------- Routes: Most Loved ---------------- //

// /**
//  * @route   GET /api/settings/most-loved
//  * @desc    Get the active "Most Loved" section images
//  */
// router.get('/most-loved', async (req, res) => {
//   try {
//     // Find the one and only "Most Loved" doc
//     let mostLoved = await MostLoved.findOne({ name: 'mainMostLoved' });

//     if (!mostLoved) {
//       // If it doesn't exist yet, create a default empty one
//       mostLoved = new MostLoved(); // Uses default name 'mainMostLoved'
//       await mostLoved.save();
//     }
    
//     res.json(mostLoved);
//   } catch (err) {
//     console.error("Error fetching Most Loved settings:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   POST /api/settings/most-loved
//  * @desc    Update (upsert) the "Most Loved" images. Replaces based on fields.
//  */
// router.post('/most-loved', upload.fields([
//     { name: 'desktopImages' }, 
//     { name: 'mobileImages' }
// ]), async (req, res) => {
//   try {
//     const doc = await MostLoved.findOne({ name: 'mainMostLoved' });
//     const oldDesktopIds = doc ? doc.desktopImages.map(img => img.public_id) : [];
//     const oldMobileIds = doc ? doc.mobileImages.map(img => img.public_id) : [];

//     const files = req.files || {};
//     const desktopFiles = files.desktopImages || [];
//     const mobileFiles = files.mobileImages || [];
    
//     const idsToDelete = [];
//     const updatePayload = {};

//     // 1. Process Desktop Images (if any were uploaded)
//     if (desktopFiles.length > 0) {
//       const desktopPromises = desktopFiles.map(file => 
//           uploadToCloudinary(file.buffer, "bforce_most_loved_desktop")
//       );
//       const newDesktopImages = await Promise.all(desktopPromises);
//       updatePayload.desktopImages = newDesktopImages.map(img => ({ 
//           public_id: img.public_id, 
//           url: img.url 
//       }));
//       idsToDelete.push(...oldDesktopIds);
//     }

//     // 2. Process Mobile Images (if any were uploaded)
//     if (mobileFiles.length > 0) {
//       const mobilePromises = mobileFiles.map(file => 
//           uploadToCloudinary(file.buffer, "bforce_most_loved_mobile")
//       );
//       const newMobileImages = await Promise.all(mobilePromises);
//       updatePayload.mobileImages = newMobileImages.map(img => ({ 
//           public_id: img.public_id, 
//           url: img.url 
//       }));
//       idsToDelete.push(...oldMobileIds);
//     }
    
//     // 3. Check if any new images were actually uploaded
//     if (Object.keys(updatePayload).length === 0) {
//         return res.status(400).json({ msg: "No images provided to update." });
//     }

//     // 4. Update or create the document
//     const updatedMostLoved = await MostLoved.findOneAndUpdate(
//       { name: 'mainMostLoved' },
//       { $set: updatePayload }, // Only set the fields that had new images
//       { new: true, upsert: true, runValidators: true }
//     );

//     // 5. Delete old images from Cloudinary
//     if (idsToDelete.length > 0) {
//       Promise.all(idsToDelete.map(id => cloudinary.uploader.destroy(id)))
//         .catch(err => console.error("Error deleting old Most Loved images:", err));
//     }

//     res.status(201).json(updatedMostLoved);
//   } catch (err) {
//     console.error("Error updating Most Loved settings:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// router.delete('/hero-carousel/:publicId', async (req, res) => {

//   try {
//     const { publicId } = req.params;
    
//     // Find the document
//     const doc = await HeroCarousel.findOne({ name: 'mainHeroCarousel' });
    
//     if (!doc) {
//       return res.status(404).json({ msg: 'Carousel not found' });
//     }
    
//     // Filter out the image to delete
//     const updatedImages = doc.images.filter(img => img.public_id !== publicId);
    
//     // Update the document
//     doc.images = updatedImages;
//     await doc.save();
    
//     // Delete from Cloudinary
//     await cloudinary.uploader.destroy(publicId);
    
//     res.json({ msg: 'Image deleted successfully', carousel: doc });
//   } catch (err) {
//     console.error("Error deleting hero carousel image:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   DELETE /api/settings/most-loved/:type/:publicId
//  * @desc    Delete a specific most loved image (desktop or mobile)
//  */
// router.delete('/most-loved/:type/:publicId', async (req, res) => {
//   try {
//     const { type, publicId } = req.params;
//     console.log(req.params);
    
//     if (type !== 'desktop' && type !== 'mobile') {
//       return res.status(400).json({ msg: 'Invalid image type' });
//     }
    
//     // Find the document
//     const doc = await MostLoved.findOne({ name: 'mainMostLoved' });
    
//     if (!doc) {
//       return res.status(404).json({ msg: 'Most Loved section not found' });
//     }
    
//     // Filter out the image to delete
//     if (type === 'desktop') {
//       doc.desktopImages = doc.desktopImages.filter(img => img.public_id !== publicId);
//     } else {
//       doc.mobileImages = doc.mobileImages.filter(img => img.public_id !== publicId);
//     }
    
//     await doc.save();
    
//     // Delete from Cloudinary
//     await cloudinary.uploader.destroy(publicId);
    
//     res.json({ msg: 'Image deleted successfully', mostLoved: doc });
//   } catch (err) {
//     console.error("Error deleting most loved image:", err.message);
//     res.status(500).send('Server Error');
//   }
// });


// module.exports = router;
