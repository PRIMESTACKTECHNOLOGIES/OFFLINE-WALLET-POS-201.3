const { WalletsService } = require('./dist/domain/wallets/wallets.service.js');
(async () => {
  const svc = new WalletsService();
  const all = await svc.getCustomers();
  console.log('\n========================================');
  console.log('DATABASE INTEGRITY - CUSTOMERS PERSISTED');
  console.log('========================================\n');
  const recent = all.slice(0, 8);
  recent.forEach((c, i) => {
    const phoneSaved = c.phone ? '[OK]' : '[MISSING]';
    const emailSaved = c.email ? '[OK]' : '[MISSING]';
    const nameSaved = c.name && c.name.trim() ? '[OK]' : '[MISSING]';
    console.log(`[${i+1}] ${c.name || '(NULL NAME)'}`);
    console.log(`    Name persist:  ${nameSaved}`);
    console.log(`    Email persist: ${emailSaved}  (${c.email || 'NULL'})`);
    console.log(`    Phone persist: ${phoneSaved}  (${c.phone || 'NULL'})`);
    console.log(`    Wallet Code:   ${c.wallet_code || 'NONE'}`);
    console.log(`    Balance:       $${Number(c.wallet_balance || 0).toFixed(2)}\n`);
  });
  console.log('Total customers in DB:', all.length);
  const withPhone = all.filter(c => c.phone && c.phone.trim()).length;
  const withEmail = all.filter(c => c.email && c.email.trim()).length;
  const withName = all.filter(c => c.name && c.name.trim()).length;
  console.log('With name saved: ', withName, '/', all.length);
  console.log('With email saved:', withEmail, '/', all.length);
  console.log('With phone saved:', withPhone, '/', all.length);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
