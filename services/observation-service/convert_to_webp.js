const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Minio = require('minio');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://anura:anurapass@localhost:5432/anuradb'
});

const BUCKET = process.env.MINIO_BUCKET || 'anura-images';
function createMinioClient() {
  const p = parseInt(String(process.env.MINIO_PORT || '9000'), 10);
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: Number.isFinite(p) ? p : 9000,
    useSSL: String(process.env.MINIO_USE_SSL || '').toLowerCase() === 'true',
    accessKey: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretKey: process.env.MINIO_ROOT_PASSWORD || 'change_me',
  });
}
const minioClient = createMinioClient();

const uploadDir = path.join(__dirname, 'uploads');
const thumbnailDir = path.join(uploadDir, 'thumbnails');
const profilesDir = path.join(uploadDir, 'profiles');

async function convert() {
  console.log('Starting conversion of existing images to .webp...');
  try {
    const res = await pool.query("SELECT id, image_key, thumbnail_key, thumbnail_blob FROM observations.observations WHERE image_key NOT LIKE '%.webp' OR thumbnail_key NOT LIKE '%.webp'");
    const rows = res.rows;
    console.log(`Found ${rows.length} observations to convert.`);

    for (const row of rows) {
      try {
        console.log(`Converting observation ${row.id}...`);

        let newImageKey = row.image_key;
        let newThumbnailKey = row.thumbnail_key;

        // Convert main image
        if (row.image_key && !row.image_key.endsWith('.webp')) {
          const oldFilename = path.basename(row.image_key);
          const newFilename = oldFilename.replace(/\.[^/.]+$/, "") + ".webp";
          newImageKey = `uploads/${newFilename}`;

          const oldPath = path.join(uploadDir, oldFilename);
          const newPath = path.join(uploadDir, newFilename);

          let buffer;
          if (fs.existsSync(oldPath)) {
            buffer = fs.readFileSync(oldPath);
          } else {
            try {
              const stream = await minioClient.getObject(BUCKET, oldFilename);
              const chunks = [];
              for await (const chunk of stream) chunks.push(chunk);
              buffer = Buffer.concat(chunks);
            } catch (e) {
              console.log(`  [Skip] main image not found for obs ${row.id}`);
            }
          }

          if (buffer) {
            const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
            fs.writeFileSync(newPath, webpBuffer);
            try {
              await minioClient.putObject(BUCKET, newFilename, webpBuffer);
              await minioClient.removeObject(BUCKET, oldFilename).catch(() => {});
            } catch(e) {}
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }

        let newThumbBuffer = row.thumbnail_blob;
        // Convert thumbnail
        if (row.thumbnail_key && !row.thumbnail_key.endsWith('.webp')) {
          const oldThumbFilename = path.basename(row.thumbnail_key);
          const newThumbFilename = oldThumbFilename.replace(/\.[^/.]+$/, "") + ".webp";
          newThumbnailKey = `thumbnails/${newThumbFilename}`;

          const oldThumbPath = path.join(thumbnailDir, oldThumbFilename);
          const newThumbPath = path.join(thumbnailDir, newThumbFilename);

          let tbuffer;
          if (fs.existsSync(oldThumbPath)) {
            tbuffer = fs.readFileSync(oldThumbPath);
          } else if (row.thumbnail_blob) {
            tbuffer = row.thumbnail_blob;
          } else {
            try {
              const stream = await minioClient.getObject(BUCKET, oldThumbFilename);
              const chunks = [];
              for await (const chunk of stream) chunks.push(chunk);
              tbuffer = Buffer.concat(chunks);
            } catch (e) {}
          }

          if (tbuffer) {
            newThumbBuffer = await sharp(tbuffer).webp({ quality: 80 }).toBuffer();
            fs.writeFileSync(newThumbPath, newThumbBuffer);
            try {
              await minioClient.putObject(BUCKET, newThumbFilename, newThumbBuffer);
              await minioClient.removeObject(BUCKET, oldThumbFilename).catch(() => {});
            } catch(e) {}
            if (fs.existsSync(oldThumbPath)) fs.unlinkSync(oldThumbPath);
          }
        }

        await pool.query('UPDATE observations.observations SET image_key = $1, thumbnail_key = $2, thumbnail_blob = $3 WHERE id = $4', [newImageKey, newThumbnailKey, newThumbBuffer, row.id]);
        
      } catch (e) {
        console.error(`Error converting observation ${row.id}:`, e.message);
      }
    }

    console.log('Checking profile images...');
    const userRes = await pool.query("SELECT id, profile_image, profile_image_blob FROM auth.users WHERE profile_image IS NOT NULL AND profile_image NOT LIKE '%.webp'");
    for (const row of userRes.rows) {
      try {
        if (!row.profile_image.endsWith('.webp')) {
          const oldFilename = path.basename(row.profile_image);
          const newFilename = oldFilename.replace(/\.[^/.]+$/, "") + ".webp";
          
          let buffer;
          if (row.profile_image_blob) {
             buffer = row.profile_image_blob;
          } else {
             const oldPath = path.join(profilesDir, oldFilename);
             if (fs.existsSync(oldPath)) buffer = fs.readFileSync(oldPath);
          }

          if (buffer) {
             const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();
             const newPath = path.join(profilesDir, newFilename);
             if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });
             fs.writeFileSync(newPath, webpBuffer);
             await pool.query("UPDATE auth.users SET profile_image = $1, profile_image_blob = $2 WHERE id = $3", [`/uploads/profiles/${newFilename}`, webpBuffer, row.id]);
             
             try {
                await minioClient.putObject(BUCKET, newFilename, webpBuffer);
                await minioClient.removeObject(BUCKET, oldFilename).catch(() => {});
             } catch(e) {}
             
             const oldPath = path.join(profilesDir, oldFilename);
             if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
             console.log(`Updated user ${row.id} profile picture.`);
          }
        }
      } catch (e) {
        console.error(`Error converting user ${row.id}:`, e.message);
      }
    }

    console.log('Conversion complete!');
  } catch (err) {
    console.error('Conversion failed:', err);
  } finally {
    await pool.end();
  }
}

convert();
