import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import {Window} from 'happy-dom';
test('original quiz: loading, animations, pixelation, pause, typo correction, three attempts, score and final',async()=>{
 const window=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});window.document.write(await fs.readFile('index.html','utf8'));
 const doc=window.document,$=id=>doc.getElementById(id);let now=0,frame,draws=0;
 $('pixels').getContext=()=>({drawImage:()=>draws++});$('music').play=()=>Promise.resolve();
 class Image{naturalWidth=310;naturalHeight=430;set src(value){this._src=value;queueMicrotask(()=>this.onload());}}
 const pokedex=await fs.readFile('pokemon_pokedex_nazionale.txt','utf8');
 const context=vm.createContext({document:doc,Image,fetch:async()=>({ok:true,text:async()=>pokedex}),performance:{now:()=>now},requestAnimationFrame:fn=>frame=fn,console});
 vm.runInContext((await fs.readFile('game.js','utf8'))+'\nglobalThis.snapshot=()=>({phase,index,score,attempts,pausedAt});',context);
 await new Promise(r=>setImmediate(r));assert.equal($('start').disabled,false);
 const click=id=>$(id).dispatchEvent(new window.Event('click'));
 const step=t=>{now=t;frame(t);};
 const answer=name=>{$('answer').value=name;$('answer-form').dispatchEvent(new window.Event('submit',{cancelable:true}));};
 const skip=(target=doc)=>target.dispatchEvent(new window.KeyboardEvent('keydown',{key:'N',shiftKey:true,bubbles:true}));
 click('start');assert.equal(context.snapshot().phase,'covered');step(250);assert.equal(context.snapshot().phase,'flipping');step(950);assert.equal(context.snapshot().phase,'active');step(1950);assert.equal($('seconds').textContent,'29s');assert.ok(draws>0);
 click('timer');const paused=$('seconds').textContent;step(6950);assert.equal($('seconds').textContent,paused);assert.equal($('answer').disabled,true);click('timer');step(7950);assert.equal($('seconds').textContent,'28s');
 answer('zzzzzzzzzzzz');assert.equal(context.snapshot().attempts,0);answer('Pikachu');answer('Pikachu');assert.equal(context.snapshot().phase,'active');answer('Pikachu');assert.equal(context.snapshot().phase,'result');assert.equal(context.snapshot().score,0);
 click('continue');step(8200);step(8900);step(9900);answer('Poliwhrl');assert.equal(context.snapshot().phase,'result');assert.equal(context.snapshot().score,290);
 skip();assert.equal(context.snapshot().index,2);
 skip($('answer'));assert.equal(context.snapshot().index,2);
 skip();assert.equal(context.snapshot().index,3);
 for(let i=3;i<6;i++){if(i>3)click('continue');step(now+250);step(now+700);step(now+30001);assert.equal(context.snapshot().phase,'result');}
 click('continue');assert.equal(context.snapshot().phase,'finished');assert.equal($('final').hidden,false);assert.equal($('final-score').textContent,'290');
 await window.happyDOM.close();
});
