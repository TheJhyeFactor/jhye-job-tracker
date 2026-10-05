import http from 'node:http';
import fs from 'node:fs';
import handler from '../api/index.js';
process.loadEnvFile('.env.runtime.local');
process.env.FRONTEND_ORIGIN='http://localhost:4320';
http.createServer((req,res)=>{
 if(req.url.startsWith('/api/'))return handler(req,res);
 const file=({'/':'index.html','/app.min.js':'app.min.js','/style.css':'style.css'})[req.url];
 if(!file){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css');
 let content=fs.readFileSync('public/'+file,'utf8');
 content=content.replaceAll('https://jhye-job-tracker-api.vercel.app','http://localhost:4320');
 res.end(content);
}).listen(4320,'127.0.0.1',()=>console.log('Development preview at http://localhost:4320'));
