import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { recommend } from '../../src/astral/hardware.js';
import { decodeCharacter, buildCharacterCard } from '../shared/cards.js';
import { parseDialogue } from '../shared/dialogue.js';
import { parseDraft, literalSource } from '../shared/drafts.js';
import { normalizeAppearance, themeTokens } from '../shared/appearance.js';
import { validBackupPath, streamBackup, restoreZip } from '../../src/astral/backup.js';
import { saveImageAsset } from '../../src/astral/assets.js';
import { AstralStore } from '../../src/astral/store.js';
import Jimp from '../../src/jimp.js';
import '../../src/fetch-patch.js';
const require=createRequire(import.meta.url);
const {fitBounds}=require('../desktop/window-state.cjs');
const catalog=JSON.parse(fs.readFileSync('astral/resources/models.lock.json'));
const defaults=JSON.parse(fs.readFileSync('astral/resources/characters.json'));
test('simulated hardware tiers reserve memory and avoid 26B/31B on 16 GB RAM',()=>{
 for(const vram of [0,4,6,8,10,12,16,24,32,48]){
  const machine={totalGiB:64,freeGiB:48,gpu:vram?{totalMiB:vram*1024,freeMiB:vram*1024}:null};
  const r=recommend(machine,catalog), m=catalog.find(m=>m.id===r.modelId);
  assert(m,`missing choice at ${vram}GB`); assert(m.tierGiB<=Math.max(vram,4));
  if(vram)assert(r.reserveMiB>=Math.max(768,vram*102.4));
  const limited=recommend({...machine,totalGiB:16,freeGiB:8},catalog);
  assert(catalog.find(m=>m.id===limited.modelId).minRamGiB<=16);
 }
 const busy=recommend({totalGiB:16,freeGiB:8,gpu:{totalMiB:8192,freeMiB:3500}},catalog);
 assert(catalog.find(m=>m.id===busy.modelId).tierGiB<=4);
});
test('website and V3 card round trips retain attribution, lorebooks, and unknown extensions',()=>{
 const raw={spec:'chara_card_v3',spec_version:'3.0',unknownRoot:{a:1},data:{name:'Alex',description:'A 42-year-old sailor.',first_mes:'Hello',creator:'Original author',character_book:{entries:[{content:'Old harbor'}]},alternate_greetings:['Ahoy'],extensions:{foreign:{keep:true},astral:{age:42}}}};
 const {card}=decodeCharacter(raw);
 const edited=buildCharacterCard({...defaults[0],sourceCard:card,name:'Alex',description:card.data.description});
 assert.equal(edited.data.creator,'Original author');assert.deepEqual(edited.data.character_book,raw.data.character_book);
 assert.deepEqual(edited.data.extensions.foreign,{keep:true});assert.deepEqual(edited.unknownRoot,{a:1});assert(!('age' in edited.data.extensions.astral));
 assert.match(edited.data.description,/42-year-old/);
 const cai=decodeCharacter({character:{name:'Cass',long_description:'Calm',definition:'Speaks softly',greeting:'Hi'}});
 assert.equal(cai.card.data.system_prompt,'Speaks softly');assert.equal(cai.card.data.first_mes,'Hi');
 assert.throws(()=>decodeCharacter({messages:[{content:'chat only'}]}),/dialogue/);
 assert.throws(()=>decodeCharacter({name:'Too long',description:'x'.repeat(24001)}),/24,000/);
});
test('dialogue sources and malformed draft results are handled explicitly',()=>{
 assert.deepEqual(parseDialogue('Alex: Hi\ncontinued\nSam: Hello').map(m=>m.text),['Hi\ncontinued','Hello']);
 assert.equal(parseDialogue('{"name":"Alex","mes":"One"}\n{"name":"Sam","mes":"Two"}').length,2);
 assert.equal(parseDialogue({histories:[{msgs:[{src:{user:{username:'Alex'}},text:'Hi'}]}]})[0].speaker,'Alex');
 assert.equal(parseDialogue({turns:[{author:{name:'Alex'},candidates:[{raw_content:'Hello'}]}]})[0].text,'Hello');
 assert.throws(()=>parseDraft('not json','profile'));
 assert.throws(()=>parseDraft('{"systemPrompt":12}','instructions'));
 assert(!literalSource('{{user}} <|think|>').includes('{{'));
});
test('themes normalize unsafe input and window bounds survive disconnected monitors',()=>{
 const a=normalizeAppearance({uiScale:300,theme:'bad',accent:'url(evil)',backgroundImage:'https://example.com/a.png'});
 assert.equal(a.uiScale,150);assert.equal(a.theme,'forest');assert.equal(a.accent,'');assert.equal(a.backgroundImage,'');
 assert.equal(themeTokens({accent:'#00ff00'}).accentInk,'#000000');
 const area={x:-1280,y:0,width:1280,height:680};
 const b=fitBounds({x:3000,y:2000,width:3000,height:1700},area);
 assert(b.x>=area.x&&b.x+b.width<=0&&b.y+b.height<=680);
 assert(Number.isFinite(fitBounds({x:NaN,y:Infinity,width:-20,height:'bad'},area).width));
});
test('ZIP backups stream assets and restore them with validated hashes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'astral-v2-'));
 t.after(()=>fs.rmSync(root,{force:true,recursive:true}));
 const store=new AstralStore(root,defaults);
 const image=new Jimp({width:2600,height:20,color:0x334455ff});
 const asset=await saveImageAsset(root,'data:image/png;base64,'+(await image.getBuffer('image/png')).toString('base64'),'sample');
 assert.equal(asset.width,2048);
 const target=path.join(root,'backup.zip'), output=fs.createWriteStream(target);
 output.attachment=()=>{};
 const done=new Promise(resolve=>output.on('close',resolve));
 await streamBackup(output,store,{root,characters:path.join(root,'characters'),chats:path.join(root,'chats')});await done;
 fs.rmSync(path.join(root,'astral/assets'),{recursive:true});
 await restoreZip(target,store,root);
 assert(fs.existsSync(path.join(root,'astral/assets',path.basename(asset.url))));
 assert(!validBackupPath('characters/../escape.png'));assert(!validBackupPath('characters/CON.png'));assert(!validBackupPath('/state.json'));
});
