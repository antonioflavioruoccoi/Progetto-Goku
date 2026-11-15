import fs from 'node:fs/promises';
import crypto from 'node:crypto';
export async function quizData() {
 const code=await fs.readFile('game.js','utf8');
 const cards=Function('return '+code.match(/const cards = (\[[\s\S]*?\]);/)[1])();
 for(const c of cards){const bytes=await fs.readFile(c.image);c.opaque='live-cards/'+crypto.createHash('sha256').update(bytes).digest('hex').slice(0,32)+'.'+c.image.split('.').pop();}
 const names=[...new Set((await fs.readFile('pokemon_pokedex_nazionale.txt','utf8')).split(/\r?\n/).map(l=>l.match(/^\s*\d+\s*-\s*(.+?)\s*$/)?.[1]).filter(Boolean).map(s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')))];
 return {cards,names};
}
