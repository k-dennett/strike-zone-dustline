# 🎯 Strike Zone 3D

Shooter táctico en primera persona para el navegador, inspirado en **Counter-Strike**, construido con [Three.js](https://threejs.org/) y Web Audio API.

**Sin assets externos**: todas las texturas (arena, madera, yeso) se generan por procedimientos con Canvas 2D y todos los sonidos (disparos, explosiones, pasos, pitidos de bomba) se sintetizan en tiempo real con Web Audio API.

![Three.js](https://img.shields.io/badge/Three.js-r160-black?logo=threedotjs)
![Vanilla JS](https://img.shields.io/badge/JS-ES%20Modules-yellow?logo=javascript)
![Sin build](https://img.shields.io/badge/build-no%20requerido-green)

---

## 🎮 Modos de juego

### ▶ Supervivencia
Oleadas infinitas de bots con dificultad creciente: más enemigos, más vida, más velocidad y mejor puntería en cada oleada. Al superar una oleada: **+30 PV**, recarga de reserva y granadas repuestas.

### 💣 Modo Bomba
Eres el terrorista. Infíltrate, **planta la bomba en el site A o B** (mantén `E` dentro del anillo) y **defiéndela durante 40 segundos**. Los bots harán *rush* al site para desactivarla: si uno pasa 5 segundos junto a la bomba, la ronda se pierde. Si la bomba explota, pasas a la siguiente ronda con más resistencia enemiga.

---

## ✨ Características

| Sistema | Detalle |
|---|---|
| 🔫 **Arsenal** | AK-47 (automática, 34 dmg, headshot ×4) · USP (semi, 26 dmg, headshot ×3) · Granadas HE con física de rebote |
| 🎯 **Gunplay** | Retroceso, dispersión dinámica (movimiento + ráfagas), ADS con zoom, fogonazo, trazadoras, recarga animada |
| 🤖 **IA de bots** | Patrullaje, strafing, anti-atasco, verificación de línea de visión, *rush* a la bomba, defuse |
| 🗺️ **Mapa** | Arena 60×60 estilo *dust*: doble puerta central, sites A/B con cajas apilables, pilares, coberturas |
| 🧭 **Minimapa** | Tiempo real: muros, sites, jugador orientado, enemigos y bomba parpadeante |
| 🖥️ **HUD** | Crosshair dinámico, hitmarker (rojo = headshot), barra de salud, munición, bajas, viñeta de daño |
| 🔊 **Audio** | 100% sintetizado: disparos con distancia atenuada, explosiones, pasos, pitido acelerado de la bomba |
| 🌍 **Físicas** | Colisiones AABB por ejes, gravedad, salto, subirse a cajas, granadas con rebote y esquinas |

---

## 🚀 Cómo jugar

Necesitas un servidor estático (los módulos ES no cargan desde `file://`) y conexión a internet (Three.js se sirve desde CDN):

```bash
# opción 1
python3 -m http.server 8123

# opción 2
npx serve .
```

Abre **http://localhost:8123** y haz clic en un modo de juego.

## 🕹️ Controles

| Tecla | Acción |
|---|---|
| `WASD` | Moverse |
| `Shift` | Correr |
| `Espacio` | Saltar |
| `Clic izq` | Disparar |
| `Clic der` | Apuntar (ADS) |
| `R` | Recargar |
| `1` / `2` | AK-47 / USP |
| `G` | Lanzar granada |
| `E` (mantener) | Plantar la bomba en un site |
| `Esc` | Pausa |

---

## 🧱 Estructura

```
├── index.html   # HUD, menús e import-map de Three.js
├── style.css    # Estilos del HUD, crosshair, menús y minimapa
└── main.js      # Motor del juego: escena, físicas, IA, armas, granadas,
                 # modo bomba, oleadas, audio procedural y minimapa
```

## 🛠️ Tecnologías

- **Three.js r160** — renderizado WebGL, sombras PCF, niebla, tone mapping ACES
- **Pointer Lock API** — control de cámara FPS
- **Web Audio API** — SFX sintetizados (ruido + osciladores con envolventes)
- **Canvas 2D** — texturas procedurales y minimapa

## 📈 Ideas futuras

- Audio posicional 3D
- Modelos GLTF y animaciones esqueléticas
- Más armas (AWP, escopeta) y economía de compra
- Multijugador con WebRTC
