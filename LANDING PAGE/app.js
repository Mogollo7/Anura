const nodes = document.querySelectorAll(".node");
const token = document.querySelector("#message-token");

const labels = {
  user: "Entrada: foto, GPS y privacidad",
  frontend: "React PWA envia comandos REST",
  gateway: "NGINX enruta y protege APIs",
  observation: "Crea observacion y publica eventos",
  minio: "Guarda imagenes y thumbnails",
  redis: "Coordina eventos y consumers",
  postgres: "Persiste datos principales",
  thumbnail: "Genera small, medium y WebP",
  ai: "Clasifica con BioCLIP 2.5 + contexto",
  geo: "Aporta altitud, clima y bioma",
  notification: "Devuelve avisos al usuario"
};

nodes.forEach((node) => {
  node.addEventListener("mouseenter", () => {
    nodes.forEach((item) => item.classList.remove("active"));
    node.classList.add("active");
    if (token) token.textContent = labels[node.dataset.node] || "Evento";
  });
});
