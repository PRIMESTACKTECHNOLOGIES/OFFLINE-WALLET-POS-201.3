const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
(async () => {
  try {
    const db = await open({ filename: 'e:\\DOWNLOADS\\POS OFFLINE SFTWR\\backend\\database.sqlite', driver: sqlite3.Database });
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log(JSON.stringify(tables, null, 2));
    await db.close();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
