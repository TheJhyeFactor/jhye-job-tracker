import fs from 'node:fs';
import { build } from 'esbuild';
await build({entryPoints:['public/app.js'],outfile:'public/app.min.js',bundle:true,minify:true,target:'es2022'});
let html=fs.readFileSync('public/index.html','utf8').replace('./app.js','./app.min.js');
fs.writeFileSync('public/index.html',html); fs.writeFileSync('public/.nojekyll','');
