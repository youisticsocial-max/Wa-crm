const sharp = require('sharp');
const path = require('path');

const imgPath = path.resolve('../public/branding/holaa-logo.png');

async function processImage() {
  // Extract stats
  const { dominant } = await sharp(imgPath).stats();
  console.log(`Dominant Color: rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`);

  // Generate variants
  // 1. apple-icon.png (180x180)
  await sharp(imgPath)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('../public/apple-icon.png');
  
  // 2. favicon.ico (32x32)
  // Sharp can't directly output .ico, but we can output a 32x32 png as icon
  await sharp(imgPath)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('../public/icon.png');
    
  await sharp(imgPath)
    .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('../public/favicon.ico');

  // 3. icon-192.png
  await sharp(imgPath)
    .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('../public/icon-192.png');
    
  // 4. icon-512.png
  await sharp(imgPath)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile('../public/icon-512.png');
    
  console.log('Generated image variants successfully.');
}

processImage().catch(console.error);
