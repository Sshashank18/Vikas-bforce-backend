
const express = require('express');
const router = express.Router();
const Tshirt = require('../models/tshirtModel'); // Your updated model
const multer = require('multer');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

// Auth guard (no changes)
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ msg: 'Unauthorized' });
}

// --- Configuration ---

// 1. Configure S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 2. Configure Multer-S3 Storage
// This replaces multer.memoryStorage() and the Cloudinary helper
// It streams files *directly* to S3.
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_S3_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  
  // Set ACL to 'public-read' so images are viewable
  // NOTE: For production, a better way is to keep the bucket PRIVATE
  // and serve images via CloudFront using an Origin Access Identity (OAI).
  // But for a direct migration, 'public-read' is the simplest.
//   acl: 'public-read',

  // Define the key (path/filename) for the file in S3
  key: (req, file, cb) => {
    // We use the same folder as before
    const folder = "bforce_tshirts"; 
    const fileName = `${Date.now()}-${file.originalname}`;
    cb(null, `${folder}/${fileName}`);
  },
});

// 3. Initialize Multer with the S3 storage engine
const upload = multer({ storage: s3Storage });

// Protect all routes
// router.use(ensureAuthenticated);

// --- Helper Function ---
/**
 * Deletes a file from S3.
 * @param {string} key - The S3 object key (e.g., "bforce_tshirts/filename.jpg").
 */
const deleteFromS3 = (key) => {
  if (!key) return; // Guard against empty keys
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
  });

  // We return the promise, but don't need to 'await' it in the route
  // We can let it run in the background ("fire and forget")
  return s3Client.send(command)
    .then(res => console.log(`Deleted ${key} from S3.`))
    .catch(err => console.error(`Error deleting ${key} from S3:`, err));
};


// ---------------- Routes ---------------- //

/**
 * @route   GET /api/tshirts
 * @desc    (No changes needed)
 */
router.get('/', async (req, res) => {
  try {
    const { search, collection } = req.query;
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (collection) {
      query['collectionType'] = collection;
    }
    const tshirts = await Tshirt.find(query).sort({ createdAt: -1 });
    console.log(`Found ${tshirts.length} t-shirts for query:`, query);
    res.json(tshirts);
  } catch (err) {
    console.error("Error fetching T-shirts:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   GET /api/tshirts/:id
 * @desc    (No changes needed)
 */
router.get('/:id', async (req, res) => {
  try {
    console.log(req.params.id)
    const tshirt = await Tshirt.findById(req.params.id)
    console.log(tshirt)
    res.json(tshirt);
  } catch (err) {
    console.error("Error fetching T-shirts:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   POST /api/tshirts
 * @desc    Add a new tshirt. Images are now uploaded by multer-s3 middleware.
 */
// 'upload.any()' now uploads to S3 *before* this handler runs.
// The file details are in 'req.files'.
router.post('/', upload.any(), async (req, res) => {
  try {
    const { name, price, sku, description, material, season, collectionType } = req.body;
    const category = JSON.parse(req.body.category);
    const incomingVariantsData = JSON.parse(req.body.variants);

    // req.files is an array of all uploaded files.
    // Each 'file' object from multer-s3 contains 'key' and 'location'.
    const filesByVariantIndex = (req.files || []).reduce((acc, file) => {
      const index = file.fieldname.split('_')[2];
      if (!acc[index]) acc[index] = [];
      // We store the key and location from S3
      acc[index].push({ key: file.key, location: file.location });
      return acc;
    }, {});

    // No more async upload promises needed!
    const finalVariants = incomingVariantsData.map((variantData, index) => {
      const filesForVariant = filesByVariantIndex[index] || [];
      return { ...variantData, images: filesForVariant };
    });

    const newTshirt = new Tshirt({
      name, price, sku, description, material, season, collectionType, category,
      variants: finalVariants,
    });

    const tshirt = await newTshirt.save();
    res.status(201).json(tshirt);

  } catch (err) {
    console.error("Error creating T-shirt:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   PUT /api/tshirts/:id
 * @desc    Update a T-shirt, its variants, and images.
 */
router.put('/:id', upload.any(), async (req, res) => {
  try {
    const tshirt = await Tshirt.findById(req.params.id);
    if (!tshirt) {
      return res.status(404).json({ msg: 'T-shirt not found' });
    }

    // 1. Get all *old* S3 keys
    const oldImageKeys = tshirt.variants.flatMap(v => v.images.map(img => img.key));

    const { name, price, sku, description, material, season, collectionType } = req.body;
    const category = JSON.parse(req.body.category);
    const incomingVariantsData = JSON.parse(req.body.variants);

    // 2. Map newly uploaded files (if any) from req.files
    const filesByVariantIndex = (req.files || []).reduce((acc, file) => {
      const index = file.fieldname.split('_')[2];
      if (!acc[index]) acc[index] = [];
      acc[index].push({ key: file.key, location: file.location });
      return acc;
    }, {});

    // 3. Build the new variants array
    // This replicates your original logic:
    // If new files are uploaded for a variant, they replace the old ones.
    // If no new files are uploaded, keep the old images for that index.
    const newVariants = incomingVariantsData.map((variantData, index) => {
      const newVariant = { ...variantData };
      const filesForVariant = filesByVariantIndex[index];

      if (filesForVariant && filesForVariant.length > 0) {
        // New files were uploaded for this variant, use them
        newVariant.images = filesForVariant;
      } else {
        // No new files, keep the images from the *old* tshirt data at that index
        // (This assumes the frontend doesn't send existing images back)
        newVariant.images = tshirt.variants[index]?.images || [];
      }
      return newVariant;
    });

    // 4. Determine which S3 keys to delete
    const newImageKeys = new Set(newVariants.flatMap(v => v.images.map(img => img.key)));
    const imagesToDelete = oldImageKeys.filter(key => key && !newImageKeys.has(key));

    // 5. Delete old images from S3 (fire and forget)
    if (imagesToDelete.length > 0) {
      console.log(`Deleting ${imagesToDelete.length} old images from S3...`);
      Promise.all(imagesToDelete.map(key => deleteFromS3(key)))
        .catch(err => console.error("Error batch deleting old images:", err));
    }

    // 6. Update the T-shirt in MongoDB
    const updatedTshirt = await Tshirt.findByIdAndUpdate(
      req.params.id,
      { name, price, sku, description, material, season, collectionType, category, variants: newVariants },
      { new: true, runValidators: true }
    );

    res.json(updatedTshirt);

  } catch (err) {
    console.error("Error updating T-shirt:", err.message);
    res.status(500).send('Server Error');
  }
});

/**
 * @route   DELETE /api/tshirts/:id
 * @desc    Delete a tshirt and all its associated images from S3.
 */
router.delete('/:id', async (req, res) => {
  try {
    const tshirt = await Tshirt.findById(req.params.id);
    if (!tshirt) {
      return res.status(404).json({ msg: 'T-shirt not found' });
    }

    // 1. Collect all image keys from all variants
    const keysToDelete = tshirt.variants.flatMap(variant => variant.images.map(image => image.key));

    // 2. Delete all associated images from S3
    if (keysToDelete.length > 0) {
      console.log(`Deleting ${keysToDelete.length} images from S3...`);
      await Promise.all(keysToDelete.map(key => deleteFromS3(key)));
    }

    // 3. Delete the tshirt from the database
    await tshirt.deleteOne();
    res.json({ msg: 'T-shirt and associated images removed' });

  } catch (err) {
    console.error("Error deleting T-shirt:", err.message);
    res.status(500).send('Server Error');
  }
});


module.exports = router;

// const express = require('express');
// const router = express.Router();
// const Tshirt = require('../models/tshirtModel'); // Assuming model is in this file
// const multer = require('multer');
// const cloudinary = require('cloudinary').v2;

// // Auth guard
// function ensureAuthenticated(req, res, next) {
//   if (req.isAuthenticated && req.isAuthenticated()) {
//     return next();
//   }
//   return res.status(401).json({ msg: 'Unauthorized' });
// }

// // --- Configuration ---
// // It's good practice to have these in a separate config file, but keeping here for simplicity.

// // Cloudinary config
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Multer setup for memory storage (required for file.buffer)
// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// // Protect all routes
// // router.use(ensureAuthenticated);

// // --- Helper Function ---
// /**
//  * Uploads a file buffer to Cloudinary.
//  * @param {Buffer} fileBuffer - The buffer of the file to upload.
//  * @returns {Promise<{public_id: string, url: string}>} A promise that resolves with the upload result.
//  */
// const uploadToCloudinary = (fileBuffer) => {
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       { folder: "bforce_tshirts" },
//       (error, result) => {
//         if (error) return reject(error);
//         resolve({ public_id: result.public_id, url: result.secure_url });
//       }
//     );
//     uploadStream.end(fileBuffer);
//   });
// };


// // ---------------- Routes ---------------- //

// /**
//  * @route   GET /api/tshirts
//  * @desc    Get all tshirts, sorted by most recently added.
//  */
// router.get('/', async (req, res) => {
//   try {
//     // Destructure both 'search' and 'collection' from the request query
//     const { search, collection } = req.query;

//     // Initialize an empty query object
//     let query = {};

//     // 1. Add search filter (if it exists)
//     if (search) {
//       query.$or = [
//         { name: { $regex: search, $options: 'i' } },
//         { description: { $regex: search, $options: 'i' } },
//       ];
//     }

//     // 2. Add collection filter (if it exists)
//     // This assumes "mostLoved" or "seasonCollection" are values
//     // stored in the 'category.main' field in your database.
//     console.log(req.query)
//     if (collection) {
//       query['collectionType'] = collection;
//     }
//     // --- MODIFICATION END ---


//     // Execute the query.
//     // If 'search' and 'collection' are both empty, query will be {}
//     // which correctly finds all documents.
//     const tshirts = await Tshirt.find(query).sort({ createdAt: -1 });

//     console.log(`Found ${tshirts.length} t-shirts for query:`, query);
//     res.json(tshirts);
//   } catch (err) {
//     console.error("Error fetching T-shirts:", err.message);
//     res.status(500).send('Server Error');
//   }
// });


// router.get('/:id', async (req, res) => {
//   try {
//     console.log(req.params.id)
//     const tshirt = await Tshirt.findById(req.params.id)
//     console.log(tshirt)
//     res.json(tshirt);
//   } catch (err) {
//     console.error("Error fetching T-shirts:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   POST /api/tshirts
//  * @desc    Add a new tshirt with multiple variants and images.
//  */
// router.post('/', upload.any(), async (req, res) => {
//   try {
//     const { name, price, sku, description, material, season, collectionType } = req.body;
//     const category = JSON.parse(req.body.category);
//     const incomingVariantsData = JSON.parse(req.body.variants);

//     const filesByVariantIndex = (req.files || []).reduce((acc, file) => {
//       const index = file.fieldname.split('_')[2];
//       if (!acc[index]) acc[index] = [];
//       acc[index].push(file);
//       return acc;
//     }, {});

//     const finalVariants = await Promise.all(
//       incomingVariantsData.map(async (variantData, index) => {
//         const filesForVariant = filesByVariantIndex[index] || [];
//         const uploadPromises = filesForVariant.map(file => uploadToCloudinary(file.buffer));
//         const uploadedImages = await Promise.all(uploadPromises);
//         return { ...variantData, images: uploadedImages };
//       })
//     );

//     const newTshirt = new Tshirt({
//       name, price, sku, description, material, season, collectionType, category,
//       variants: finalVariants,
//     });

//     const tshirt = await newTshirt.save();
//     res.status(201).json(tshirt);

//   } catch (err) {
//     console.error("Error creating T-shirt:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   PUT /api/tshirts/:id
//  * @desc    Update a T-shirt, its variants, and images.
//  */
// router.put('/:id', upload.any(), async (req, res) => {
//   try {
//     const tshirt = await Tshirt.findById(req.params.id);
//     if (!tshirt) {
//       return res.status(404).json({ msg: 'T-shirt not found' });
//     }

//     const oldImagePublicIds = tshirt.variants.flatMap(v => v.images.map(img => img.public_id));

//     const { name, price, sku, description, material, season, collectionType } = req.body;
//     const category = JSON.parse(req.body.category);
//     const incomingVariantsData = JSON.parse(req.body.variants);

//     const filesByVariantIndex = (req.files || []).reduce((acc, file) => {
//       const index = file.fieldname.split('_')[2];
//       if (!acc[index]) acc[index] = [];
//       acc[index].push(file);
//       return acc;
//     }, {});

//     const newVariants = await Promise.all(
//       incomingVariantsData.map(async (variantData, index) => {
//         const newVariant = { ...variantData };
//         const filesForVariant = filesByVariantIndex[index];

//         if (filesForVariant) {
//           const uploadPromises = filesForVariant.map(file => uploadToCloudinary(file.buffer));
//           newVariant.images = await Promise.all(uploadPromises);
//         } else {
//           newVariant.images = tshirt.variants[index]?.images || [];
//         }
//         return newVariant;
//       })
//     );

//     const newImagePublicIds = new Set(newVariants.flatMap(v => v.images.map(img => img.public_id)));
//     const imagesToDelete = oldImagePublicIds.filter(id => !newImagePublicIds.has(id));

//     if (imagesToDelete.length > 0) {
//       Promise.all(imagesToDelete.map(id => cloudinary.uploader.destroy(id)))
//         .catch(err => console.error("Error deleting old images from Cloudinary:", err));
//     }

//     // Using findByIdAndUpdate is more concise for updates
//     const updatedTshirt = await Tshirt.findByIdAndUpdate(
//       req.params.id,
//       { name, price, sku, description, material, season, collectionType, category, variants: newVariants },
//       { new: true, runValidators: true } // {new: true} returns the updated document
//     );

//     res.json(updatedTshirt);

//   } catch (err) {
//     console.error("Error updating T-shirt:", err.message);
//     res.status(500).send('Server Error');
//   }
// });

// /**
//  * @route   DELETE /api/tshirts/:id
//  * @desc    Delete a tshirt and all its associated images from Cloudinary.
//  */
// router.delete('/:id', async (req, res) => {
//   try {
//     const tshirt = await Tshirt.findById(req.params.id);
//     if (!tshirt) {
//       return res.status(404).json({ msg: 'T-shirt not found' });
//     }

//     // --- CRITICAL FIX: Collect all image IDs from all variants ---
//     const publicIdsToDelete = tshirt.variants.flatMap(variant => variant.images.map(image => image.public_id));

//     // If there are images, delete them all from Cloudinary
//     if (publicIdsToDelete.length > 0) {
//       console.log(`Deleting ${publicIdsToDelete.length} images from Cloudinary...`);
//       await Promise.all(publicIdsToDelete.map(id => cloudinary.uploader.destroy(id)));
//     }

//     // Finally, delete the tshirt from the database
//     await tshirt.deleteOne();
//     res.json({ msg: 'T-shirt and associated images removed' });

//   } catch (err) {
//     console.error("Error deleting T-shirt:", err.message);
//     res.status(500).send('Server Error');
//   }
// });


// module.exports = router;