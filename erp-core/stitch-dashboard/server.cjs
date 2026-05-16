const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 54534;
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".md": "text/markdown",
};

http.createServer((req, res) => {
  let filePath = req.url === "/" ? "/code.html" : req.url;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => {
  console.log("Stitch Dashboard running on http://0.0.0.0:" + PORT);
});
