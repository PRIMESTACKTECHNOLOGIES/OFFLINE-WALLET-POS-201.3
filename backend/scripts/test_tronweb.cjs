// Quick test — runs synchronously, no network calls
try {
  const m = require('tronweb');
  console.log('Type:', typeof m);
  console.log('Keys:', Object.keys(m).slice(0, 8).join(', '));

  // Find constructor
  const C = m.TronWeb || m.default?.TronWeb || m.default || m;
  console.log('Constructor type:', typeof C);
  console.log('Is function:', typeof C === 'function');

  if (typeof C === 'function') {
    // Create instance without private key (read-only)
    const t = new C({ fullNode: 'https://api.trongrid.io', solidityNode: 'https://api.trongrid.io', eventServer: 'https://api.trongrid.io' });
    console.log('Instance created OK');
    console.log('Has utils:', !!t.utils);
    console.log('Has address:', !!t.address);

    // Generate account (no network needed)
    const acc = t.utils.accounts.generateAccount();
    console.log('Generated address:', acc.address.base58);
    console.log('SUCCESS: TronWeb v6 working correctly');
  } else {
    console.log('ERROR: Constructor not a function');
  }
} catch(e) {
  console.log('ERROR:', e.message);
}
