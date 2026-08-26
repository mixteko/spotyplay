(function () {
  "use strict";

  const DISMISS_STORAGE_KEY = "spotyplay_pwa_install_dismissed";

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  let deferredPrompt = null;
  let overlayElement = null;

  // Preferencia "no volver a preguntar" durante la pestaña/sesión.
  // La app principal nunca depende de la instalación de la PWA.
  let installInviteDismissed = false;
  try {
    installInviteDismissed =
      window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1";
  } catch (error) {
    // sessionStorage no disponible: se ignora y se puede volver a preguntar.
    installInviteDismissed = false;
  }

  // Ruta del Service Worker construida dinámicamente a partir de la
  // ubicación real de este script. Funciona sin asumir GitHub Pages:
  // localhost, servidor remoto o cualquier subdirectorio del dominio actual.
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

  // La invitación de instalación SOLO se muestra cuando:
  // - no se ejecuta como PWA instalada (standalone);
  // - el usuario no la ha descartado en esta sesión;
  // - el navegador realmente puede instalarla (beforeinstallprompt);
  // - no existe ya un overlay en el DOM (evita duplicados).
  function showInstallInvite() {
    if (isStandalone) {
      return;
    }

    if (installInviteDismissed) {
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    if (document.querySelector(".pwa-install-lock")) {
      return;
    }

    const lock = document.createElement("div");
    lock.className = "pwa-install-lock";
    lock.setAttribute("role", "dialog");
    lock.setAttribute("aria-modal", "true");

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
    overlayElement = lock;

    const installButton = document.getElementById("pwaInstallButton");
    const dismissButton = document.getElementById("pwaInstallDismiss");

    installButton.addEventListener("click", onInstallClick);
    dismissButton.addEventListener("click", dismissInstallInvite);

    // Cerrar con la tecla Escape.
    lock._handleKeydown = event => {
      if (event.key === "Escape") {
        dismissInstallInvite();
      }
    };
    document.addEventListener("keydown", lock._handleKeydown);

    // Cerrar al hacer clic fuera de la tarjeta (sobre el fondo del overlay).
    lock._handleOutsideClick = event => {
      if (event.target === lock) {
        dismissInstallInvite();
      }
    };
    lock.addEventListener("click", lock._handleOutsideClick);
  }

  function onInstallClick() {
    if (!deferredPrompt) {
      dismissInstallInvite();
      return;
    }

    try {
      deferredPrompt.prompt();

      Promise.resolve(deferredPrompt.userChoice)
        .catch(error => {
          console.warn(
            "Spotify AI: no se pudo completar la instalación.",
            error
          );
        })
        .finally(() => {
          deferredPrompt = null;
          dismissInstallInvite();
        });
    } catch (error) {
      console.warn(
        "Spotify AI: no se pudo completar la instalación.",
        error
      );
      deferredPrompt = null;
      dismissInstallInvite();
    }
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
    const lock = overlayElement || document.querySelector(".pwa-install-lock");

    if (!lock) {
      overlayElement = null;
      return;
    }

    if (lock._handleKeydown) {
      document.removeEventListener("keydown", lock._handleKeydown);
    }

    if (lock._handleOutsideClick) {
      lock.removeEventListener("click", lock._handleOutsideClick);
    }

    lock.remove();
    overlayElement = null;
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
