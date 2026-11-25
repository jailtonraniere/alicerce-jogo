// Service worker do Alicerce Run: guarda o jogo no aparelho para abrir rapido
// nas proximas vezes e continuar funcionando com a rede instavel de um evento.
// - Pagina (index.html): rede primeiro, para pegar sempre a versao nova; se a
//   rede falhar, usa a copia guardada.
// - Arquivos com hash no nome (/assets/): cache primeiro (nunca mudam).
// - Modelos, logos, favicon: responde do cache e atualiza em segundo plano.
// - Outros dominios (Supabase etc.) passam direto, sem cache.
const CACHE = "alicerce-run-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function put(request, response) {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return response;
}

// A pagina manda a lista do que ja carregou antes de o service worker assumir
// (primeira visita): guarda tudo, sem baixar nada que ainda nao foi usado.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        data.urls
          .filter((u) => new URL(u, self.location.href).origin === self.location.origin)
          .map((u) =>
            cache.match(u, { ignoreSearch: false }).then(
              (hit) => hit || fetch(u).then((res) => (res.ok ? cache.put(u, res) : undefined)).catch(() => undefined)
            )
          )
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => put(req, res))
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
