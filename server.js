const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/config', express.static(path.join(__dirname, 'config')));

// Proxy all /api calls to Flask (localhost during local npm start)
app.post('/api/:action', async (req, res) => {
  const flaskPort = process.env.FLASK_PORT || 5001;
  const url = process.env.VERCEL
    ? `https://${process.env.VERCEL_URL}/api/${req.params.action}`
    : `http://localhost:${flaskPort}/api/${req.params.action}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      return res.status(response.status).json({
        success: false,
        error: rawText.slice(0, 200) || `Request failed (HTTP ${response.status})`
      });
    }
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i, (req, res) => {
  if (req.path === '/favicon.ico') {
    return res.status(404).send('Not found');
  }
  const publicPath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  }
  const rootPath = path.join(__dirname, req.path);
  res.sendFile(rootPath, (err) => {
    if (err) res.status(404).send('File not found');
  });
});

function sendRootFile(res, relativePath) {
  const filePath = path.join(__dirname, relativePath);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return false;
}

app.get('/admin.html', (req, res) => {
  if (!sendRootFile(res, 'admin.html')) {
    res.status(404).send('admin.html not found');
  }
});

app.get(/^(?!\/api).*$/, (req, res) => {
  if (req.path === '/admin.html') {
    if (sendRootFile(res, 'admin.html')) return;
  }
  // Missing static assets must 404 — never SPA-fallback JSON/CSS/JS to index.html
  if (/\.\w+$/.test(req.path)) {
    if (sendRootFile(res, req.path.replace(/^\//, ''))) return;
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

module.exports = app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server on port ${PORT}`));
}
