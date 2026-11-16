import fs from 'node:fs/promises';import {build} from 'esbuild';import {quizData} from './quiz-data.mjs';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const url=process.env.SUPABASE_URL||'',key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
if(key.startsWith('sb_secret_'))throw Error('A secret key must never be included in the frontend');
if(key.split('.').length===3){const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(claims.role!=='anon')throw Error('Only the public anon key is allowed');}
await fs.rm('dist',{recursive:true,force:true});await fs.mkdir('dist/live-cards',{recursive:true});
for(const file of await fs.readdir('.'))if(/\.(html|css|js|png|webp|jpg|jpeg|mp3|otf|txt)$/.test(file))await fs.copyFile(file,'dist/'+file);
for(const route of ['admin','host','play','invite']){await fs.mkdir('dist/'+route,{recursive:true});await fs.copyFile('web/app.html','dist/'+route+'/index.html');}
await fs.copyFile('web/app.css','dist/app.css');
await fs.writeFile('dist/config.js',`export const config=${JSON.stringify({url,key})};\n`);
await build({entryPoints:['web/app.js'],bundle:true,format:'esm',outfile:'dist/app.js',external:['./config.js'],minify:true});
for(const c of (await quizData()).cards)await fs.copyFile(c.image,'dist/'+c.opaque);
console.log(url&&key?'Built dist/ with public Supabase configuration.':'Built dist/; Supabase configuration missing (the application will explain this).');
