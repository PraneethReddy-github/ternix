const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function render() {
  const svgPath = path.join(__dirname, '../resources/icon.svg');
  const svgBuffer = fs.readFileSync(svgPath);
  const sizes = [16, 32, 64, 128, 256, 512];
  
  for (const size of sizes) {
    const outPath = path.join(__dirname, `../resources/icons/${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`Generated ${size}x${size}.png`);
  }
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(__dirname, '../resources/icon.png'));
  console.log('Generated 1024x1024 icon.png');
}

render().catch(console.error);
