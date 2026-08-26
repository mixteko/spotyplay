(function () {
  "use strict";

  const DISMISS_STORAGE_KEY = "spotyplay_pwa_install_dismissed";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  let deferredPrompt = null;

  // Preferencia "no volver a preguntar" durante la pestaña/sesión.
  // La app principal nunca depende de la instalación de la PWA.
  let installInviteDismissed = false;
  try {
    installInviteDismissed =
      window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch (error) {
    // sessionStorage no disponible: se ignora y se puede volver a preguntar.
  }

  // Ruta del Service Worker construida dinámicamente a partir de la
  // ubicación real de este script. Funciona en desarrollo local
  // (http://localhost:<puerto>/sw.js) y en GitHub Pages
  // (https://mixteko.github.io/spotyplay/sw.js).
  function getServiceWorkerUrl() {
    const scriptEl =
      document.currentScript ||
      document.querySelector('script[src*="pwa-install.js"]');

    if (scriptEl && scriptEl.src) {
      return new URL("sw.js", scriptEl.src).toString();
    }

    return new URL("sw.js", window.location.href).toString();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register(getServiceWorkerUrl())
      .catch(error => {
        console.error(
          "Spotify AI: no se pudo registrar el Service Worker. La app seguirá funcionando como sitio web.",
          error
        );
      });
  }

  // La invitación de instalación SOLO se muestra cuando el navegador
  // realmente puede instalarla (beforeinstallprompt disponible) y no haya
  // sido descartada por el usuario en esta sesión.
  function showInstallInvite() {
    if (installInviteDismissed || !deferredPrompt) {
      return;
    }

    if (document.querySelector(".pwa-install-lock")) {
      return;
    }

    const lock = document.createElement("div");
    lock.className = "pwa-install-lock";
    lock.innerHTML = `
      <div class="pwa-install-card">
        <h2>Instala Spotify AI</h2>
        <p>Para usar esta herramienta como app, instálala en tu dispositivo.</p>
        <button type="button" id="pwaInstallButton">Instalar app</button>
        <button type="button" id="pwaInstallDismiss">Ahora no</button>
        <small>En iPhone/iPad: toca Compartir y luego Agregar a pantalla de inicio.</small>
      </div>
    `;

    document.body.appendChild(lock);

    const installButton = document.getElementById("pwaInstallButton");
    const dismissButton = document.getElementById("pwaInstallDismiss");

    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        dismissInstallInvite();
        return;
      }

      try {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch (error) {
        console.warn(
          "Spotify AI: no se pudo completar la instalación.",
          error
        );
      } finally {
        deferredPrompt = null;
        dismissInstallInvite();
      }
    });

    dismissButton.addEventListener("click", () => {
      dismissInstallInvite();
    });
  }

  function dismissInstallInvite() {
    installInviteDismissed = true;

    try {
      window.sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch (error) {
      // El almacenamiento no está disponible: la preferencia dura esta visita.
    }

    removeInstallLock();
  }

  function removeInstallLock() {
    const lock = document.querySelector(".pwa-install-lock");

    if (lock) {
      lock.remove();
    }
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallInvite();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    removeInstallLock();
  });

  if (isStandalone) {
    registerServiceWorker();
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      registerServiceWorker();
    });
  }
})();
