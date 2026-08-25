const db = require('./db');

console.log('Clearing existing data...');

const tables = [
  'message_log',
  'reminders',
  'queue_entries',
  'invoices',
  'examinations',
  'patient_files',
  'patients',
  'stock_items',
  'certificates',
];

tables.forEach(function (table) {
  db.exec('DELETE FROM ' + table);
});

db.exec("DELETE FROM sqlite_sequence WHERE name IN ('" + tables.join("','") + "')");

console.log('Done - all patient, clinic, and inventory data cleared.');
console.log('(Your login account was left untouched.)');