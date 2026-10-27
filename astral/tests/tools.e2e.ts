import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import { initialState } from '../../src/astral/store.js';
let server: http.Server;
let slow = false;
const requests: any[]=[];
const profile={name:'Cass',role:'Station gardener',description:'Enjoys tending plants.',personality:'Patient and direct.',scenario:'A quiet greenhouse.',greeting:'Hello there.',examples:'Cass: Give it time.',systemPrompt:'Speak patiently. Do not control the user.',tags:['Calm']};
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  if(req.url?.endsWith('/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'vision-fixture'}]}));return;}
  let body='';req.on('data',b=>body+=b);req.on('end',()=>{
   const data=JSON.parse(body||'{}');requests.push(data);
   const source=JSON.stringify(data.messages);
   const content=source.includes('Condense this evidence')||source.includes('Extract only supported')?JSON.stringify({notes:'Cass prefers quiet places and speaks patiently.'}):source.includes('Return JSON fields: systemPrompt')?JSON.stringify({systemPrompt:profile.systemPrompt}):source.includes('Write a non-explicit character draft')?JSON.stringify(profile):'I can see the picture you sent.';
   const respond=()=>{
    if(data.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(`data: ${JSON.stringify({choices:[{index:0,delta:{content},finish_reason:null}]})}\n\n`);res.end('data: [DONE]\n\n');}
    else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content},finish_reason:'stop'}]}));}
   };
   if(slow){const timer=setTimeout(respond,10000);res.on('close',()=>clearTimeout(timer));}else respond();
  });
 });
 await new Promise<void>(resolve=>server.listen(18082,'127.0.0.1',resolve));
});
test.afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
test.beforeEach(async({request})=>{
 requests.length=0;slow=false;
 const {token}=await(await request.get('/csrf-token')).json();
 const state=initialState(JSON.parse(fs.readFileSync('astral/resources/characters.json','utf8')));
 state.settings.tutorialDone=true;state.settings.autoMemory=false;state.settings.effects='off';
 state.settings.connection={...state.settings.connection,kind:'openai',url:'http://127.0.0.1:18082/v1',model:'vision-fixture',vision:true,context:2048,maxTokens:128};
 await request.post('/api/astral/restore',{headers:{'X-CSRF-Token':token},data:{format:'astral-backup',version:1,state,files:[]}});
});
test('draft previews are isolated, long dialogue is chunked, and cancellation releases generation',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Start a story with Hina',exact:true})).toBeEnabled({timeout:90000});
 await page.getByRole('button',{name:'Create character',exact:true}).click();
 await page.getByRole('button',{name:'Draft profile',exact:true}).click();
 await page.getByRole('textbox',{name:'What would you like the model to write?'}).fill('A quiet station gardener named Cass.');
 await page.getByRole('button',{name:'Generate draft',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review the draft'})).toBeVisible();
 expect(await page.evaluate(()=>window.astralBridge.messages.length)).toBe(0);
 await page.getByRole('button',{name:'Apply draft',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Cass');
 const result=await page.evaluate(async()=>{
  const bridge=window.astralBridge,state=await(await fetch('/api/astral/state')).json();
  const before=JSON.stringify(state);
  const instructions=await bridge.draft('instructions','Keep replies concise.',state,{state:'stopped'} as any,state.characters[0]);
  const lines=Array.from({length:90},(_,i)=>({id:String(i),speaker:i%2?'Sam':'Cass',text:'I prefer the quiet greenhouse and tending plants. '.repeat(8)+`Source ${i}`}));
  const draft=await bridge.draft('dialogue','',state,{state:'stopped'} as any,undefined,lines,'Cass');
  return {instructions,draft,unchanged:before===JSON.stringify(await(await fetch('/api/astral/state')).json()),count:bridge.messages.length};
 });
 expect(result.unchanged).toBe(true);expect(result.count).toBe(0);expect(result.draft.name).toBe('Cass');expect(result.instructions.systemPrompt).toContain('patiently');
 expect(requests.filter(r=>JSON.stringify(r.messages).includes('Extract only supported')).length).toBeGreaterThan(1);
 slow=true;
 await page.evaluate(()=>{(window as any).__draftResult=(async()=>{try{const s=await(await fetch('/api/astral/state')).json();await window.astralBridge.draft('instructions','Wait',s,{state:'stopped'} as any,s.characters[0]);return 'unexpected';}catch(e){return String(e);}})();});
 await expect.poll(()=>requests.length).toBeGreaterThan(2);
 await page.evaluate(()=>window.astralBridge.cancelDraft());
 expect(await page.evaluate(()=>(window as any).__draftResult)).toMatch(/cancel|abort|stop|empty|valid/i);
 expect(await page.evaluate(()=>window.astralBridge.drafting)).toBe(false);
});
test('image messages contain real image data and survive ZIP restore',async({page,request})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Start a story with Hina',exact:true})).toBeEnabled({timeout:90000});
 await page.getByRole('button',{name:'Start a story with Hina',exact:true}).click();await page.getByRole('textbox',{name:'Message Hina'}).waitFor();
 const imageFile=page.locator('.dialogue-panel input[type=file]');
 await imageFile.setInputFiles('public/astral/art/hina.png');
 await expect(page.locator('.dialogue-panel .media-images img')).toHaveCount(1);
 await page.getByRole('textbox',{name:'Message Hina'}).fill('Describe this image.');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(page.locator('.speech')).toContainText('picture you sent');
 const payload=requests.find(r=>r.messages?.some((m:any)=>Array.isArray(m.content)&&m.content.some((p:any)=>p.type==='image_url')));
 expect(payload).toBeTruthy();
 const image=payload.messages.flatMap((m:any)=>Array.isArray(m.content)?m.content:[]).find((p:any)=>p.type==='image_url');
 expect(image.image_url.url).toMatch(/^data:image\/(png|jpeg|webp);base64,/);
 const url=await page.evaluate(()=>window.astralBridge.messages.find((m:any)=>m.is_user)?.extra.media[0].url);
 const backup=await request.get('/api/astral/backup-zip');expect(backup.ok()).toBe(true);
 const {token}=await(await request.get('/csrf-token')).json();
 const restored=await request.post('/api/astral/restore-zip',{headers:{'X-CSRF-Token':token},multipart:{file:{name:'backup.zip',mimeType:'application/zip',buffer:await backup.body()}}});
 expect(restored.ok(),await restored.text()).toBe(true);expect((await request.get(url)).ok()).toBe(true);
 await page.reload();await expect(page.getByRole('button',{name:'Start a story with Hina',exact:true})).toBeEnabled({timeout:90000});
 await page.getByRole('button',{name:'Start a story with Hina',exact:true}).click();
 await page.getByRole('button',{name:'Show transcript',exact:true}).click();await expect(page.locator('.transcript .media-images img')).toHaveCount(1);
});
