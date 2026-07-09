const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const clients = new Set();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function liveReloadSnippet() {
  return `
<script>
  (() => {
    const events = new EventSource('/__reload');
    events.onmessage = event => {
      if (event.data === 'reload') window.location.reload();
    };
  })();
</script>`;
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  let requested = decodeURIComponent(url.pathname);
  if (requested === "/") requested = "/worksheet-preview/index.html";
  const filePath = path.normalize(path.join(root, requested));
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") {
      const html = data.toString("utf8").replace("</body>", `${liveReloadSnippet()}</body>`);
      send(res, 200, html, { "Content-Type": mimeTypes[ext] });
      return;
    }
    send(res, 200, data, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  });
}

const server = http.createServer(serveFile);

function notifyReload() {
  for (const client of clients) {
    client.write("data: reload\n\n");
  }
}

const watched = [
  path.join(root, "worksheet-preview"),
  path.join(root, "resources"),
  path.join(root, "assets"),
];

for (const dir of watched) {
  if (!fs.existsSync(dir)) continue;
  fs.watch(dir, { recursive: true }, notifyReload);
}

server.listen(port, () => {
  console.log(`Worksheet preview: http://localhost:${port}/`);
  console.log("Watching worksheet-preview, resources, and assets for changes.");
});
