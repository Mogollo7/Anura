const fs = require('fs');
const path = require('path');

const scale = [
  { name: '--text-2xs', val: 0.7 },
  { name: '--text-xs', val: 0.85 },
  { name: '--text-sm', val: 0.95 },
  { name: '--text-base', val: 1 },
  { name: '--text-lg', val: 1.2 },
  { name: '--text-xl', val: 1.5 },
  { name: '--text-2xl', val: 2 },
  { name: '--text-3xl', val: 3 },
  { name: '--text-4xl', val: 4.5 }
];

function getNearestScale(val) {
  let nearest = scale[0];
  let minDiff = Math.abs(val - scale[0].val);
  for (let i = 1; i < scale.length; i++) {
    const diff = Math.abs(val - scale[i].val);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = scale[i];
    }
  }
  return nearest;
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Regex to find font-size: <number>rem;
      content = content.replace(/font-size\s*:\s*([\d\.]+)rem\s*;/g, (match, p1) => {
        const val = parseFloat(p1);
        const nearest = getNearestScale(val);
        console.log(`Replacing ${val}rem with ${nearest.name} (${nearest.val}rem) in ${file}`);
        return `font-size: var(${nearest.name});`;
      });
      
      // Also handle font-size: <number>rem !important;
      content = content.replace(/font-size\s*:\s*([\d\.]+)rem\s*!important\s*;/g, (match, p1) => {
        const val = parseFloat(p1);
        const nearest = getNearestScale(val);
        console.log(`Replacing ${val}rem !important with ${nearest.name} in ${file}`);
        return `font-size: var(${nearest.name}) !important;`;
      });

      fs.writeFileSync(fullPath, content);
    }
  }
}

processDirectory(__dirname);
