// Keep a useful menu when WebGL initialization or a local module fails.
try {
  await import('./main.js');
} catch (error) {
  console.error('No se pudo iniciar Strike Zone:', error);
  const status = document.getElementById('loading-status');
  status.textContent = 'NO SE PUDO INICIAR · Usa un navegador con WebGL y abre el juego desde http://localhost:8123. Recarga para reintentar.';
  status.setAttribute('role', 'alert');
  for (const id of ['play-btn', 'bomb-btn', 'training-btn']) document.getElementById(id).disabled = true;
}
