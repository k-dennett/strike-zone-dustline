# Strike Zone · Dustline

FPS táctico de un jugador en el navegador. Tres modos, escenario 3D procedural, bots con navegación, armas animadas y sonido estéreo sintetizado. Teclado y ratón; sin cuentas ni servicios externos.

## Jugar

Con **Node.js 20 o posterior**:

```bash
npm start
```

Abre **http://127.0.0.1:8123**. No hace falta `npm install` para jugar: Three.js y su licencia ya están en `vendor/`. También sirve `python3 -m http.server 8123 --bind 127.0.0.1`. No abras `index.html` mediante `file://`.

Empieza por **Campo de práctica**. Al seleccionar un modo se solicita capturar el ratón; `Esc` abre la pausa. Si el navegador rechaza la captura, pulsa **Jugar sin captura**: arrastra con el botón derecho para mirar/apuntar o gira con las flechas. El resto de controles se conserva.

## Modos

- **Supervivencia:** oleadas crecientes; al superar cada una recuperas salud, cargadores, reserva y granadas. Récord de bajas guardado en este navegador.
- **Operación bomba:** llega a A o B, permanece quieto en el suelo y mantén `E` durante 3,2 segundos. Defiende 40 segundos; un enemigo con acceso al explosivo necesita 5 segundos para desactivarlo. Detonar avanza de ronda; desactivar la repite.
- **Campo de práctica:** tres objetivos sin fuego enemigo, reposición de reserva/granadas y nuevos objetivos al eliminarlos. Indicador de precisión.

## Controles

| Control | Acción |
|---|---|
| WASD | Moverse |
| Shift + W | Correr |
| Espacio | Saltar |
| Clic izquierdo / mantener | Disparar / ráfaga con AK-47 |
| Clic derecho | Apuntar |
| 1 / 2 | AK-47 / USP semiautomática |
| R | Recargar |
| G | Granada |
| E, mantener quieto dentro de A/B | Plantar bomba |
| M | Silenciar / activar sonido |
| Esc | Pausar y liberar el ratón |
| Clic derecho + arrastrar / flechas | Mirar en el modo sin captura |

El combate ahora avisa con **CONTACTO CERCANO**, **BAJO FUEGO** y **SALUD CRÍTICA**. Los impactos enrojecen los bordes y un arco indica de dónde llegó el daño; los enemigos producen pasos estéreo al caminar y la salud crítica activa latidos suaves.

Los **ajustes** del menú permiten cambiar volumen, sensibilidad, gráficos y reducir los destellos de daño y las sacudidas de cámara. “Rendimiento” reduce resolución interna y desactiva sombras/polvo. Ajustes y récord se guardan localmente; no se envían datos.

## Qué había antes y qué cambió

- [Estado inicial recibido / Kimi K3](docs/ESTADO_INICIAL_KIMI_K3.md): inventario, capacidades heredadas, fallos y límites de atribución.
- [Mejoras y estado actual](docs/MEJORAS_Y_ESTADO_ACTUAL.md): cambios, pruebas, evidencia visual y limitaciones.
- [Copia exacta inicial](docs/baseline/): los cuatro archivos originales conservados, sin edición.

## Pruebas

Instala las herramientas de desarrollo una vez:

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` ejecuta pruebas unitarias de física, navegación, audio y estados de combate, además de las dos suites de navegador. `npm run test:combat` ejecuta sólo las comprobaciones de alertas e impactos. Arranca un servidor local si no existe. Para usar una URL distinta: `TEST_URL=http://127.0.0.1:8124 npm run test:browser`. Para ver Chromium: `HEADED=1 npm run test:browser`.

Las pruebas de combate usan entradas reales de teclado/ratón. Preparan posiciones y resultados límite mediante fixtures habilitados **sólo** con `?test=1` en `localhost`/`127.0.0.1`; no modifican el control del jugador ni simulan la API de audio. La prueba específica de rechazo de captura sí provoca intencionalmente ese rechazo. Los resultados quedan en `docs/evidence/browser-results.json`.

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `index.html`, `style.css` | Menú, ajustes, HUD y diseño adaptable |
| `bootstrap.js` | Inicio y mensaje de error recuperable |
| `main.js` | Estado, combate, modos, animación y bucle fijo |
| `world-detail.js` | Arquitectura, materiales, cielo, polvo y telas |
| `enemy-model.js` | Modelo articulado procedural de soldados |
| `navigation.js` | A* con margen de colisión y aristas seguras |
| `physics.js` | Movimiento y colisiones por ejes |
| `audio.js` | Sonidos, pasos enemigos, avisos, ambiente, paneo, compresor y volumen |
| `combat-feedback.js` | Impactos direccionales, niveles de alerta, pulso y cadencia de avisos |
| `server.mjs` | Servidor estático local, sin dependencias |
| `vendor/` | Three.js 0.160.0 y licencia MIT |
| `tests/` | Pruebas reproducibles |
| `docs/` | Auditoría inicial, estado posterior y capturas |

Es un juego de escritorio con gráficos estilizados procedurales. No incluye multijugador, controles táctiles, modelos GLTF ni animación capturada. Requiere WebGL; el audio se activa al interactuar con el menú.
