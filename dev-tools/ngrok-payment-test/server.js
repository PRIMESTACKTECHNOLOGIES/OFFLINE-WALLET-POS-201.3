const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Serve static files from this folder
app.use(express.static(path.join(__dirname, '/')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Simulated payment callback endpoint (for deep-link testing)
app.get('/callback', (req, res) => {
  // In a real flow, validate incoming params server-side
  const status = req.query.status || 'unknown';
  res.send(`<h2>Payment callback received</h2><p>status=${status}</p><p><a href="/">Back</a></p>`);
});

app.listen(port, () => {
  console.log(`Ngrok payment test server listening on http://localhost:${port}`);
});
