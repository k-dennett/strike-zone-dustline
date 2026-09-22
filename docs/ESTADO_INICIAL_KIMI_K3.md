# Estado inicial de Strike Zone 3D — referencia anterior a las mejoras

Fecha de auditoría: **21 de septiembre de 2026**, zona horaria America/Santiago.

Este documento describe exclusivamente la copia original conservada en [`baseline/`](baseline/). Es el punto de comparación anterior a las mejoras solicitadas en esta sesión. Los archivos de esa carpeta no se han modificado durante esta auditoría.

## Qué se puede atribuir al trabajo anterior

El proyecto recibido ya contiene un prototipo FPS 3D sustancial: escenario, dos modos, bots, armas, HUD, efectos, animaciones procedurales y audio sintetizado. Estos sistemas **ya existían** y no deben presentarse como creaciones de la intervención posterior.

El usuario identifica ese trabajo previo como realizado con **Kimi K3**. No hay historial Git utilizable que permita verificar autoría, duración, número de iteraciones o contribuciones individuales: `git rev-parse --verify HEAD` falla con `Needed a single revision`, y los archivos originales figuran sin seguimiento. Por tanto:

- Se puede medir y describir el código entregado.
- No se puede establecer cuántas horas trabajó Kimi, cuántos mensajes recibió ni qué porcentaje corresponde a cada autor.
- El número de líneas no representa horas de trabajo, calidad ni porcentaje de finalización.
- La atribución a Kimi es el contexto proporcionado por el usuario, no una conclusión forense del repositorio.

## Inventario medido

| Archivo original | Líneas | Bytes | Responsabilidad |
|---|---:|---:|---|
| `main.js` | 1.415 | 50.063 | Motor, escena, mapa, input, audio, armas, IA, física, modos y HUD |
| `style.css` | 154 | 5.998 | HUD, menús, retícula, indicadores y dos animaciones CSS |
| `index.html` | 82 | 2.386 | Controles, menús, HUD e import map |
| `README.md` | 90 | 3.666 | Presentación, instrucciones y descripción del prototipo |
| **Total** | **1.741** | **62.113** | **4 archivos** |

El JavaScript declara 50 funciones mediante `function`, una clase `Enemy` y 17 funciones breves de efectos sonoros `sfx…`. El conteo no incluye callbacks ni métodos como funciones independientes.

La copia contiene 30 piezas sólidas de mapa, 30 colisionadores AABB, 31 mallas del mundo utilizadas en raycasts —las piezas más el suelo—, 7 puntos de aparición de bots y 2 sitios de bomba. No contiene pruebas automatizadas, manifiesto de dependencias, configuración de build, servidor propio ni archivos multimedia externos.

## Capacidades que ya estaban implementadas

### Renderizado, escenario y presentación

- Three.js `0.160.0`, importado desde `unpkg.com`.
- Escena WebGL con sombras PCF suaves, tone mapping ACES, luz hemisférica, sol direccional, niebla y luz de explosión.
- Arena de 60 × 60 unidades con muros perimetrales, dos muros centrales, cajas, cajas apiladas y cuatro pilares.
- Tres texturas de superficie generadas con Canvas 2D: suelo, muros y cajas; letras A/B generadas en sprites.
- Modelos construidos con geometría básica para armas, enemigos, bomba y granadas.
- Menú inicial, pausa mediante liberación del cursor, pantalla de muerte y botón de reintento.
- HUD de salud, cargador/reserva, arma, granadas, bajas, oleada/ronda, mensajes, temporizador de bomba, progreso de plantado y minimapa en tiempo real.

### Combate y movimiento

| Elemento | Parámetros originales |
|---|---|
| AK-47 | Automática, 600 RPM, daño 34, cabeza ×4, cargador 30, reserva 90, recarga 2,2 s |
| USP | Semiautomática, 330 RPM, daño 26, cabeza ×3, cargador 12, reserva 48, recarga 1,5 s |
| Distancia de daño | Daño de armas reducido al 80 % después de 22 unidades |
| Granadas HE | Mecha 2,1 s, radio 6,5, daño base máximo 115 con caída por distancia; daño propio reducido |
| Movimiento | WASD, velocidad 4,9; sprint frontal con Shift izquierdo a 7,4; salto con impulso 8,2 |
| Gravedad | 22 unidades/s²; integración por fotograma con `dt` limitado a 0,05 s |
| ADS | Interpolación de arma y FOV de 75° a 52°, sensibilidad y dispersión reducidas |

Los disparos usan raycasts contra coberturas y partes del enemigo. Ya existen retroceso, dispersión por ráfaga y movimiento, fogonazo, trazadoras, partículas de impacto, hitmarker y distinción de cabeza/cuerpo. La recarga y el cambio de arma impiden disparar durante sus temporizadores.

### Modos e IA

**Supervivencia:** oleadas de `min(3 + 2 × oleada, 14)` enemigos, salud y dificultad crecientes, reposición de reserva y granadas, recuperación de 30 PV al pasar a la siguiente oleada. La transición espera también a que desaparezcan los cadáveres.

**Bomba:** dos sitios; mantener E durante 3,2 s para plantar; detonación a los 40 s; enemigos cercanos acumulan 5 s de desactivación. Hay refuerzos, progresión de rondas al detonar y repetición de ronda al desactivar. No hay límite de tiempo previo al plantado.

**Bots:** persiguen directamente al jugador o a la bomba, hacen desplazamientos laterales aleatorios, intentan salir de atascos, se separan entre sí y comprueban línea de visión antes de disparar. El impacto enemigo se decide por probabilidad según distancia/dificultad. El README menciona patrullaje, pero el código no implementa rutas de patrulla ni un planificador de navegación.

### Animaciones y audio que ya existían

- Balanceo del arma y cámara al caminar; retroceso; interpolación de ADS; inclinación del arma al recargar/cambiar.
- Piernas de los bots oscilantes, destello de daño, caída del cuerpo y hundimiento posterior del cadáver.
- Giro de granadas, partículas con gravedad, trazadoras breves, fogonazo, luz de explosión y sacudida de cámara.
- Animaciones CSS del hitmarker y aviso de desactivación; LED de bomba intermitente.
- Disparos, impactos, cabeza, bajas, vacío, recarga, cambio, daño, muerte, oleada, victoria, pasos, lanzamiento, rebote, explosión y plantado con Web Audio API; pitido progresivo de bomba.

El audio no utiliza muestras grabadas. El disparo enemigo se atenúa con la distancia, pero no hay paneo ni posicionamiento estéreo 3D. No hay control de volumen, silencio ni ambiente continuo. Ambos tipos de arma comparten el sonido de disparo.

## Hallazgos de jugabilidad y robustez

Los siguientes hallazgos provienen de lectura del código original. La prueba de salto de la sección siguiente es la única ejecución aislada realizada por esta auditoría. **Esta revisión no certifica una partida completa en navegador, rendimiento, escucha de audio ni compatibilidad entre navegadores.** Las referencias son líneas de `baseline/main.js`, que permanece congelado.

| Prioridad | Hallazgo y evidencia original | Consecuencia / acción propuesta |
|---|---|---|
| Alta | `requestLock()` ignora tanto rechazos como excepciones; `startGame()` oculta el menú antes de obtener el bloqueo (450–463). La simulación sólo exige `started && !paused && alive` (1392). | Si el navegador rechaza Pointer Lock al iniciar, puede continuar una partida sin poder apuntar y sin un control visible para recuperarla. Activar juego sólo al confirmar captura y mostrar recuperación ante fallos. |
| Alta | `tryFire()` automático se ejecuta antes de actualizar posición y rotación de cámara (1281 frente a 1285–1292). | El tiro puede usar la pose del fotograma anterior al moverse/girar. Sincronizar cámara y matrices antes del disparo. |
| Alta | La intermisión de bomba se comprueba dentro de `updateBombMode()`, después de actualizar jugador y enemigos; las granadas también continúan (1017–1022, 1392–1400). | El jugador puede recibir daño o morir después de resolverse la ronda. Separar claramente combate activo y fin de ronda. |
| Alta | `startRound()` limpia enemigos y recoloca al jugador, pero no granadas, recarga, disparo, cambio de arma, ADS ni teclas (951–976). | Estado y explosivos anteriores pueden filtrarse a la siguiente ronda. Reiniciar coherentemente todos los sistemas transitorios. |
| Media | El plantado sólo comprueba distancia horizontal al sitio; no exige suelo ni inmovilidad. `bomb.pos` copia también altura del jugador, pero la malla se dibuja siempre a `y=0.11` (982–984, 1036–1048). | Es posible plantar durante un salto o encima de cobertura con discrepancia entre posición lógica y visual. Elegir una superficie válida y usar una única posición. |
| Media | Desactivar sólo requiere un enemigo vivo a menos de 2,4 unidades (1064–1069); no comprueba obstrucción y los bots siguen disparando. El progreso es compartido y decae gradualmente al alejarse. | Se puede desactivar a través de cobertura o conservar progreso entre distintos bots. Definir un desactivador y requisitos de acceso/interrupción. |
| Media | Persecución directa y strafe aleatorio sin rutas (738–769); probabilidad de strafe `0.006` por fotograma (750). | El rodeo de muros es incierto y el comportamiento depende de FPS. Añadir navegación alrededor de obstáculos y probabilidades por tiempo. |
| Media | Física con Euler por fotograma; altura de salto variable, comprobada abajo. | Una caja de 1,4 unidades cambia de accesibilidad según FPS. Usar pasos fijos/subpasos o integración estable. |
| Media | Separación de bots altera posiciones antes de resolver movimiento, sin validar inmediatamente colisiones (1317–1334). `resolveAxis()` escoge el lado sólo por signo de velocidad, incluso si ésta es cero (300–313). | Superposiciones previas pueden expulsar personajes hacia un lado incorrecto. Resolver por penetración y validar la separación contra el mapa. |
| Media | No hay escucha de `blur`/`visibilitychange` ni tratamiento explícito del error de captura. Las teclas se limpian al perder Pointer Lock, no mediante una pausa general (430–448). | La recuperación de foco depende del comportamiento del navegador. Limpiar input y pausar también al ocultar/perder foco. |
| Media | Se eliminan enemigos/bombas de la escena sin liberar geometrías/materiales creados por instancia (constructores y `scene.remove`). | Riesgo de crecimiento de recursos GPU en partidas/rondas largas. Compartir recursos o aplicar `dispose()` al liberar instancias. |
| Baja | `bombDefused()` no actualiza el HUD (1008–1015). | El temporizador o estado de desactivación puede quedar visible hasta el siguiente reinicio. Actualizar HUD al resolver ambos resultados. |
| Baja | La tecla G no filtra `event.repeat` (403–410); salto se aplica mientras Espacio siga pulsado (1247). | Mantener teclas puede consumir varias granadas o provocar saltos continuos. Definir acciones de pulsación única. |
| Baja | `#bomb-btn` no comparte las reglas visuales de los otros botones en el CSS original. No hay adaptación por tamaño de pantalla. | Menú desigual y riesgo de desbordes en ventanas pequeñas. Unificar botones y diseñar disposición adaptable. |

Otras limitaciones: no hay soporte táctil, mando, dificultad seleccionable, estadísticas persistentes, ajustes gráficos, pantalla de carga/error de WebGL, economía, multijugador ni interacción cuerpo a cuerpo. Son ausencias de alcance, no funciones rotas. Tampoco hay navegación capaz de garantizar que todos los enemigos alcancen cualquier posición válida.

## Verificación aislada de física

Se extrajeron literalmente `overlaps`, `resolveAxis` y `moveEntity` del archivo original y se ejecutaron con Node sobre una entidad sencilla, sin obstáculos, aplicando el mismo impulso `8.2` y gravedad `22` del jugador. Se avanzó hasta aterrizar con intervalos constantes equivalentes a cada FPS.

| FPS simulados | Altura máxima observada |
|---:|---:|
| 20 | 1,330 m |
| 30 | 1,393 m |
| 60 | 1,461 m |
| 120 | 1,494 m |

La altura continua teórica es aproximadamente `8.2² / (2 × 22) = 1,528 m`. La diferencia entre tasas confirma dependencia del paso de simulación. El mapa tiene cajas de 1,4 y 1,6 unidades: la primera altura queda por encima del salto a 20/30 FPS y por debajo a 60/120 FPS; las de 1,6 no se alcanzan directamente desde suelo con estos parámetros. No se ha simulado aquí la maniobra completa de subirse a cada caja.

Otros controles realizados: conteo real de archivos/líneas/bytes, lectura completa de los cuatro archivos, verificación de ausencia de HEAD y hashes SHA-256 de la copia original.

## Condiciones originales para ejecutar

Según el código y el README, se requiere un navegador de escritorio con WebGL, módulos ES, import maps, Pointer Lock y Web Audio; teclado y ratón; un servidor HTTP estático y acceso a internet para descargar Three.js desde el CDN. No se incluyen dependencias locales, por lo que el original no puede garantizar inicio sin conexión.

Comando documentado originalmente: `python3 -m http.server 8123`, seguido de `http://localhost:8123`. Este apartado registra las instrucciones existentes; no constituye evidencia de haber completado una partida con ellas.

## Integridad de la referencia

| Archivo en `baseline/` | SHA-256 |
|---|---|
| `README.md` | `405eaae6f97814309e0e98f8813da33d17912254a66e707a05e236a6ce791846` |
| `index.html` | `435637c0eb4f1ad0cd7bc9fe01d78c1768db4833a683db02472ee282a51c12dd` |
| `main.js` | `9358bdade2b66aef67279a061c080543fe02f537e15290b7724a665e120b59ff` |
| `style.css` | `ea4fc8b4ce3400d73bed24c6019161a7ba98a5d40b0f6115f2e7e4377bea4976` |

Las mejoras, las pruebas de navegador y el estado final deben registrarse en un documento posterior separado. Esta referencia conserva lo recibido y evita atribuir al trabajo nuevo las funciones que ya estaban presentes.

## Comprobación complementaria en navegador del original

Antes de integrar mejoras se abrió la copia original en Chromium y se guardaron las siguientes capturas. Para aislar el juego de problemas de CDN, la solicitud de Three.js se respondió con la copia local de la misma versión 0.160.0. La consola no registró excepciones JavaScript; el menú y la arena se renderizaron, pero la captura del ratón no se obtuvo. Esto confirma el caso de recuperación de control descrito arriba; no acredita una partida completa del original.

![Menú original](evidence/antes-menu.png)

![Arena original](evidence/antes-juego.png)
