const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const outPath = path.join(distPath, 'index.zip');

// Ensure dist exists
fs.mkdirSync(distPath, { recursive: true });

// 1. Install production dependencies
console.log('Installing production dependencies...');
execSync('npm install --production', { cwd: projectRoot, stdio: 'inherit' });

// 2. Copy required files into dist
console.log('Copying files to dist...');
fs.copyFileSync(path.join(projectRoot, 'sendEmailApi.js'), path.join(distPath, 'sendEmailApi.js'));
fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(distPath, 'package.json'));

// Copy node_modules recursively
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.lstatSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
};
copyDir(path.join(projectRoot, 'node_modules'), path.join(distPath, 'node_modules'));

// 3. Create zip
console.log('Creating zip...');
const output = fs.createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('Created', outPath, `(${archive.pointer()} bytes)`);
});

archive.on('error', (err) => {
  console.error('Zip failed:', err);
  process.exit(1);
});

archive.pipe(output);
archive.glob('**/*', { cwd: distPath, ignore: ['index.zip'] });
archive.finalize();