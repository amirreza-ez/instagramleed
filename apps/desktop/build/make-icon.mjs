// Renders the app logo SVG to the 512px PNG electron-builder converts into the Windows .ico.
import sharp from 'sharp';
import path from 'node:path';
const here = import.meta.dirname;
await sharp(path.join(here, '../../web/public/logo.svg'), { density: 600 }).resize(512, 512).png().toFile(path.join(here, 'icon.png'));
console.log('icon.png written');
