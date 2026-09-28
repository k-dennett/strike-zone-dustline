import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const port = process.env.PORT || 3000;
const base = process.env.TEST_URL || `http://127.0.0.1:${port}`;
let server;
try { await fetch(base); } catch {
  server=spawn(process.execPath,['server.mjs'],{stdio:'inherit'});
  for(let i=0;i<50;i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
}
const browser=await chromium.launch({headless:process.env.HEADED!=='1'});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
const state=()=>page.evaluate(()=>window.__game.state());
const fixture=n=>page.evaluate(n=>window.__game.fixture(n),n);
const until=fn=>page.waitForFunction(fn,undefined,{timeout:12000});
const wait=ms=>page.waitForTimeout(ms);
const record=name=>{checks.push(name);console.log('PASS',name);};
async function enter(id) {
  await page.click('#'+id);await wait(180);
  if((await state()).paused) await page.click('#fallback-btn');
  await until(()=>!window.__game.state().paused);
}
try {
  await page.goto(base+'/?test=1');await until(()=>!!window.__game);
  await enter('play-btn');await fixture('combat-near');
  await until(()=>window.__game.state().combat.level==='near');
  await until(()=>window.__game.state().combat.enemyStepsPlayed>0);
  assert.equal((await state()).hp,100);
  assert.equal(await page.locator('#combat-alert-title').textContent(),'CONTACTO CERCANO');
  await page.screenshot({path:'docs/evidence/combate-contacto.png'});
  record('Enemigo que se acerca activa alerta y pasos sin inventar daño');
  await fixture('combat-shooter');await until(()=>window.__game.state().combat.level==='fire');
  record('Disparo real del bot activa BAJO FUEGO');
  await fixture('clear-enemies');await fixture('combat-reset');
  const hp=(await state()).hp;
  await fixture('combat-fire');await until(()=>window.__game.state().combat.level==='fire');
  assert.equal((await state()).hp,hp);record('Disparo fallido avisa sin restar salud');
  await fixture('combat-hit-left');
  await until(()=>window.__game.state().combat.directionOpacity>0.9);
  assert((await state()).combat.damageOpacity>0.6);
  assert(Math.abs((await state()).combat.directionAngle+Math.PI/2)<0.02);
  assert.equal(await page.locator('#damage-direction').isVisible(),true);
  assert.equal(await page.locator('#damage-overlay').evaluate(el=>getComputedStyle(el).zIndex),'0');
  await page.screenshot({path:'docs/evidence/combate-impacto.png'});
  record('Impacto genera viñeta roja visible y arco hacia el atacante');
  await fixture('combat-turn');await wait(80);
  assert(Math.abs((await state()).combat.directionAngle)<0.02);
  record('La dirección del impacto se adapta al giro del jugador');
  await until(()=>window.__game.state().combat.level==='');
  assert.equal(await page.locator('#combat-alert').isVisible(),false);
  assert.equal(await page.locator('#damage-direction').isVisible(),false);
  record('Indicadores se retiran al terminar el peligro');
  await fixture('combat-occluded');await wait(250);
  assert.equal((await state()).combat.level,'');
  record('No hay alerta visual de proximidad a través de muros');
  await fixture('combat-near');await fixture('combat-reset');await fixture('combat-critical');
  await until(()=>window.__game.state().combat.level==='critical');
  assert.equal((await state()).hp,24);
  await page.screenshot({path:'docs/evidence/combate-critico.png'});
  record('Salud crítica tiene prioridad y conserva visible la mira');
  await page.keyboard.press('Escape');await until(()=>window.__game.state().paused);
  const frozen=(await state()).combat;await wait(350);assert.deepEqual((await state()).combat,frozen);
  assert.equal(await page.locator('#hud').isVisible(),false);
  await page.click('.settings-panel summary');await page.check('#reduced-effects');
  await page.click('#resume-btn');await until(()=>!window.__game.state().paused);
  await wait(150);assert((await state()).combat.damageOpacity<=0.2);
  record('Pausa congela feedback y reducir efectos suaviza el destello');
  await page.keyboard.press('Escape');await enter('training-btn');await wait(150);
  assert.equal((await state()).combat.level,'');assert.equal((await state()).combat.directionOpacity,0);assert.equal((await state()).combat.enemyStepsPlayed,0);
  record('Nueva práctica elimina alerta, latidos e impactos anteriores');
  await page.reload();await until(()=>!!window.__game);
  assert.equal((await state()).settings.reducedEffects,true);
  record('Preferencia de efectos reducidos persiste');
  assert.deepEqual(errors,[]);
  await writeFile('docs/evidence/combat-results.json',JSON.stringify({timestamp:new Date().toISOString(),browser:browser.version(),checks,errors},null,2)+'\n');
  console.log(`${checks.length} comprobaciones de combate aprobadas.`);
} catch(e) { console.error(await state().catch(()=>null));console.error(errors);await page.screenshot({path:'docs/evidence/combat-failure.png'}).catch(()=>{});throw e; }
finally {await browser.close();server?.kill();}
