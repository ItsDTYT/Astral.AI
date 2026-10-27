import { _electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
const packaged=process.argv[2];
const executablePath=packaged?path.resolve(packaged):electron;
const args=packaged?[]:[path.resolve('astral/desktop/main.cjs')];
const userData=path.resolve('.cache/desktop-v2-'+(packaged?'packaged':'source'));
const env={...process.env,ASTRAL_TEST_USER_DATA:userData,ASTRAL_SMOKE:'lifecycle',PATH:`${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`};
const second=(other=false)=>new Promise((resolve,reject)=>{
 const cross=other&&packaged;
 const child=spawn(cross?electron:executablePath,cross?[path.resolve('astral/desktop/main.cjs')]:args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';child.stderr.on('data',b=>output+=b);child.on('exit',code=>code===0?resolve(true):reject(Error('Repeat launch failed: '+code+' '+output)));child.on('error',reject);
 setTimeout(()=>reject(Error('Second launch did not exit')),20000).unref();
});
const app=await _electron.launch({executablePath,args,env,timeout:120000});
try{
 await second(); // Activation while the backend and renderer are starting.
 const page=await app.firstWindow();
 await page.waitForURL(/^http:\/\/127.0.0.1:/,{timeout:150000});
 await page.waitForFunction(()=>window.astralBridge?.st?.astralAppReady,undefined,{timeout:90000});
 await page.getByRole('status').filter({hasText:'Astral is already open.'}).waitFor({timeout:20000});
 console.log('QUEUED_ACTIVATION_VERIFIED');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
 await second(true);
 const geometry=await app.evaluate(({BrowserWindow,screen})=>{
  const w=BrowserWindow.getAllWindows()[0],b=w.getBounds(),a=screen.getDisplayMatching(b).workArea;
  return{windows:BrowserWindow.getAllWindows().length,minimized:w.isMinimized(),inside:b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height};
 });
 if(geometry.windows!==1||geometry.minimized||!geometry.inside)throw Error(JSON.stringify(geometry));
 console.log('REPEAT_LAUNCH_AND_MONITOR_FIT_VERIFIED',geometry);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:900,height:640}));
 await new Promise(r=>setTimeout(r,500));
 const bounds=JSON.parse(fs.readFileSync(path.join(userData,'window.json')));
 if(bounds.width!==900||bounds.height!==640)throw Error('Window bounds were not saved.');
 const codec=await page.evaluate(async()=>{const r=await fetch('/thumbnail?type=avatar&file=default_Seraphina.png');return r.ok&&(await r.arrayBuffer()).byteLength>100;});
 if(!codec)throw Error('Image codec smoke failed');
 console.log('BOUNDS_PERSISTENCE_AND_BUNDLED_RUNTIME_VERIFIED');
 const closedStatus=await app.evaluate(async({BrowserWindow,app})=>{
  const w=BrowserWindow.getAllWindows()[0],session=w.webContents.session,url=new URL('/csrf-token',w.webContents.getURL()).href;
  app.removeAllListeners('window-all-closed');
  w.destroy();
  return (await session.fetch(url)).status;
 });
 if(closedStatus!==401)throw Error('Closed-window request was authorized.');
 console.log('DESTROYED_WINDOW_REQUEST_DENIED_WITHOUT_CRASH');
}finally{await app.close();}
