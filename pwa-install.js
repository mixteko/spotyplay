(function () {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    registerServiceWorker();
    return;
  }

  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallLock();
  });

  window.addEventListener("appinstalled", () => {
    removeInstallLock();
  });

  window.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();

    setTimeout(() => {
      if (!isStandalone) {
        showInstallLock();
      }
    }, 700);
  });

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/spotyplay/sw.js")
        .catch(error => {
          console.error(
            "Spotify AI: no se pudo registrar el Service Worker. La app seguirá funcionando como sitio web.",
            error
          );
        });
    }
  }

  function showInstallLock() {
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
        <small>En iPhone/iPad: toca Compartir y luego Agregar a pantalla de inicio.</small>
      </div>
    `;

    document.body.appendChild(lock);

    const button = document.getElementById("pwaInstallButton");

    button.addEventListener("click", async () => {
      if (!deferredPrompt) {
        return;
      }

      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    });
  }

  function removeInstallLock() {
    const lock = document.querySelector(".pwa-install-lock");

    if (lock) {
      lock.remove();
    }
  }
})();
