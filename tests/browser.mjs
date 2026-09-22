import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const base = process.env.TEST_URL || 'http://127.0.0.1:8123';
let server;
try { await fetch(base); } catch {
  server = spawn(process.execPath, ['server.mjs'], { stdio: 'inherit' });
  for(let i=0;i<50;i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
}
await mkdir('docs/evidence', { recursive: true });
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const page = await browser.newPage({ viewport: { width:1440, height:900 } });
const errors=[], checks=[], external=[];
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{ if(m.type()==='error') errors.push(m.text()); });
page.on('request',r=>{if(!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url());});
await page.addInitScript(() => {
  // Observe real Web Audio output without replacing oscillators or game logic.
  const AC=window.AudioContext;
  if(AC) window.AudioContext=class extends AC {
    constructor(...args) { super(...args); window.__audioContext=this; window.__meter=this.createAnalyser(); window.__meter.fftSize=2048; }
  };
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(target,...args) {
    if(target===window.__audioContext?.destination && this!==window.__meter) {
      connect.call(this,window.__meter); return connect.call(window.__meter,target,...args);
    }
    return connect.call(this,target,...args);
  };
});
const state=()=>page.evaluate(()=>window.__game.state());
const fixture=name=>page.evaluate(n=>window.__game.fixture(n),name);
const wait=ms=>page.waitForTimeout(ms);
const until=fn=>page.waitForFunction(fn,undefined,{timeout:12000});
const record=(name,details={})=>{checks.push({name,status:'passed',...details}); console.log('PASS',name);};
async function pause() { await page.keyboard.press('Escape'); await until(()=>window.__game.state().paused); }
async function enter(id) {
  await page.click('#'+id);
  await wait(180);
  if((await state()).paused) {
    await page.locator('#fallback-btn').waitFor({state:'visible'});
    await page.click('#fallback-btn');
  }
  await until(()=>!window.__game.state().paused);
}
async function resume(){ await page.click('#resume-btn'); await until(()=>!window.__game.state().paused); }
try {
  await page.goto(base+'/?test=1');
  await until(()=>!!window.__game);
  assert.equal(await page.locator('#play-btn').isEnabled(),true);
  await wait(500);
  await page.screenshot({path:'docs/evidence/despues-menu.png'});
  record('Arranque local sin peticiones externas');
  await enter('training-btn');
  let s=await state();assert.equal(s.mode,'training');assert.equal(s.enemies.length,3);
  const inputMode=s.cursorMode?'cursor alternativo real':'captura nativa';
  record('Inicio de práctica y control real',{inputMode});
  const before=s.pos;
  await page.keyboard.down('KeyW');await wait(600);await page.keyboard.up('KeyW');
  s=await state(); assert(s.pos[2]<before[2]-1.5);
  await page.keyboard.down('Space');await wait(180);await page.keyboard.up('Space');
  assert((await state()).pos[1]>0.6);await until(()=>window.__game.state().grounded);
  record('Movimiento WASD, salto y aterrizaje');
  await fixture('near-wall');await page.keyboard.down('KeyW');await wait(650);await page.keyboard.up('KeyW');
  s=await state();assert(s.pos[2]>=0.94 && s.pos[2]<1.1);record('Colisión con muro sólido');
  await fixture('target');await wait(50);
  await page.mouse.click(720,450);await wait(170);
  s=await state();assert(s.shots>0);assert(s.ammo.rifle.mag<30);assert(s.hitsLanded>0);
  record('Disparo real con raycast, consumo de munición e impacto');
  await page.keyboard.press('KeyR');await until(()=>window.__game.state().reloading>0);
  await page.screenshot({path:'docs/evidence/despues-recarga.png'});
  await until(()=>window.__game.state().reloading<=0);
  assert.equal((await state()).ammo.rifle.mag,30);record('Recarga completa y animación visible');
  await page.keyboard.press('Digit2');await until(()=>window.__game.state().weapon==='pistol');await wait(400);
  const pistol=(await state()).ammo.pistol.mag;
  await page.mouse.down();await wait(430);await page.mouse.up();
  assert.equal((await state()).ammo.pistol.mag,pistol-1);record('Pistola semiautomática: un tiro por pulsación');
  await page.mouse.down({button:'right'});await wait(350);assert((await state()).ads>0.85);
  await page.mouse.up({button:'right'});record('Apuntar ADS');
  await page.keyboard.press('KeyG');await until(()=>window.__game.state().grenades===1);
  await until(()=>window.__game.state().grenades===0);record('Lanzamiento, física y explosión de granada');
  await page.keyboard.press('Digit1');await wait(400);
  await page.mouse.down();await wait(150);
  const audible=await page.evaluate(()=>{const v=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(v);return {state:window.__audioContext.state,rms:Math.sqrt(v.reduce((n,x)=>n+x*x,0)/v.length)};});
  await page.mouse.up();assert.equal(audible.state,'running');assert(audible.rms>0.00001);
  record('Web Audio produce señal real al disparar',audible);
  await page.keyboard.press('KeyM');await wait(450);
  const muted=await page.evaluate(()=>{const v=new Float32Array(window.__meter.fftSize);window.__meter.getFloatTimeDomainData(v);return Math.max(...v.map(Math.abs));});
  assert(muted<0.001);await page.keyboard.press('KeyM');record('Silencio con M elimina señal de audio',{peakMuted:muted});
  await wait(1000);await page.screenshot({path:'docs/evidence/despues-juego.png'});
  await pause();const frozen=await state();await wait(500);s=await state();assert.deepEqual(s.pos,frozen.pos);assert.deepEqual(s.enemies,frozen.enemies);
  record('Escape pausa simulación y conserva partida');
  await page.locator('.settings-panel summary').click();
  await page.selectOption('#quality','low');
  await page.locator('#sensitivity').fill('130');await page.locator('#volume').fill('35');
  await resume();record('Reanudar conserva estado y aplica ajustes');
  await pause();await enter('play-btn');s=await state();assert.equal(s.mode,'survival');assert.equal(s.kills,0);assert.equal(s.hp,100);
  await until(()=>window.__game.state().enemies.length>0);
  record('Supervivencia: nueva partida y aparición de enemigos');
  await fixture('kill-enemies');await until(()=>window.__game.state().wave===2);
  assert.equal((await state()).ammo.rifle.mag,30);record('Progreso de oleada y reposición');
  await fixture('death');await page.locator('#death-screen').waitFor({state:'visible'});
  assert.equal((await state()).alive,false);await enter('restart-btn');assert.equal((await state()).alive,true);assert.equal((await state()).wave,1);
  record('Muerte y reinicio limpio');
  await pause();await enter('bomb-btn');await fixture('clear-enemies');await fixture('air-site');
  await page.keyboard.down('KeyE');await wait(180);assert.equal((await state()).bomb.plantT,0);await page.keyboard.up('KeyE');
  record('No se puede plantar una bomba en el aire');
  await fixture('at-site');
  await page.keyboard.down('KeyE');await until(()=>window.__game.state().bomb.planted);await page.keyboard.up('KeyE');
  s=await state();assert(s.bomb.timer>35);assert.equal(s.bomb.carried,false);
  await page.screenshot({path:'docs/evidence/despues-bomba.png'});record('Plantar manteniendo E y activar cuenta atrás');
  await pause();const timer=(await state()).bomb.timer;await wait(400);assert.equal((await state()).bomb.timer,timer);await resume();record('Pausa congela temporizador de bomba');
  await fixture('clear-enemies');await fixture('bomb-soon');await until(()=>window.__game.state().roundEndT>0);
  const hp=(await state()).hp;await wait(200);assert.equal((await state()).hp,hp);
  await until(()=>window.__game.state().round===2 && window.__game.state().roundEndT===0);
  record('Detonación, intermedio sin daño y siguiente ronda');
  await fixture('clear-enemies');await fixture('at-site');
  await page.keyboard.down('KeyE');await until(()=>window.__game.state().bomb.planted);await page.keyboard.up('KeyE');
  await fixture('clear-enemies');await fixture('defuser');
  await until(()=>window.__game.state().bomb.defuse>0.1);
  await until(()=>window.__game.state().roundEndT>0);assert.equal((await state()).bomb.planted,false);assert.equal((await state()).round,2);
  record('Enemigo desactiva bomba y ronda se repite');
  await page.reload();await until(()=>!!window.__game);s=await state();assert.equal(s.settings.sensitivity,130);assert.equal(s.settings.volume,35);assert.equal(s.settings.quality,'low');
  record('Ajustes persisten tras recargar');
  // Explicitly rejected lock must leave a recoverable paused menu.
  await page.evaluate(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Blocked test fixture','NotAllowedError'));});
  await page.click('#play-btn');await wait(300);assert.equal((await state()).paused,true);assert.equal(await page.locator('#menu').isVisible(),true);assert.equal(await page.locator('#fallback-btn').isVisible(),true);
  await page.click('#fallback-btn');assert.equal((await state()).paused,false);record('Captura rechazada: recuperación con menú y control alternativo');
  await pause();await page.setViewportSize({width:390,height:844});await wait(800);await page.screenshot({path:'docs/evidence/despues-movil.png'});
  assert.equal(await page.locator('.mobile-notice').isVisible(),true);record('Diseño estrecho y aviso de teclado/ratón');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);record('Sin errores JavaScript ni dependencias de red externas');
  await writeFile('docs/evidence/browser-results.json',JSON.stringify({timestamp:new Date().toISOString(),browser:browser.version(),checks,errors,externalRequests:external},null,2)+'\n');
  console.log(`\n${checks.length} comprobaciones de navegador aprobadas.`);
} catch(error) {
  await page.screenshot({path:'docs/evidence/test-failure.png'}).catch(()=>{});
  console.error('STATE',await state().catch(()=>null));
  console.error('ERRORS',errors);
  throw error;
} finally { await browser.close();server?.kill(); }
