const db = require('./db');
const bcrypt = require('bcryptjs');

console.log('Seeding demo data...');

const stockInsert = db.prepare('INSERT INTO stock_items (name, category, quantity, unit_price) VALUES (?, ?, ?, ?)');
const stock = [
  ['Rimless Titanium Frame', 'frame', 12, 180],
  ['Classic Round Frame', 'frame', 2, 120],
  ['Kids Flex Frame', 'frame', 8, 90],
  ['Renu Lens Solution 355ml', 'lens_solution', 15, 35],
  ['Opti-Free Lens Solution', 'lens_solution', 3, 40],
  ['Hard Case - Navy', 'glasses_case', 20, 15],
  ['Soft Pouch Case', 'glasses_case', 25, 8],
  ['Artificial Tears Drops', 'drug', 30, 12],
  ['Antibiotic Eye Drops', 'drug', 1, 25],
];
const stockIds = {};
stock.forEach(function (row) {
  const result = stockInsert.run(row[0], row[1], row[2], row[3]);
  stockIds[row[0]] = result.lastInsertRowid;
});

const patientInsert = db.prepare(
  'INSERT INTO patients (full_name, phone, email, created_at) VALUES (?, ?, ?, ?)'
);
const now = new Date();
const thisMonth = now.toISOString().slice(0, 10);
const lastYear = new Date(now.getFullYear() - 1, now.getMonth(), 5).toISOString().slice(0, 10);

const patients = [
  ['Ama Serwaa', '0244123456', 'ama.serwaa@example.com', thisMonth],
  ['Kofi Mensah', '0201234567', 'kofi.mensah@example.com', thisMonth],
  ['Vera Danso', '0552869312', 'vera.danso@example.com', lastYear],
  ['Kwabena Osei', '0244555111', '', lastYear],
  ['Efua Boateng', '0209988776', 'efua.b@example.com', lastYear],
];
const patientIds = {};
patients.forEach(function (row) {
  const result = patientInsert.run(row[0], row[1], row[2], row[3]);
  patientIds[row[0]] = result.lastInsertRowid;
});

const examInsert = db.prepare(`
  INSERT INTO examinations
    (patient_id, visual_acuity_right, visual_acuity_left, eye_pressure_right, eye_pressure_left, color_vision, visual_field, diagnosis, exam_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

examInsert.run(patientIds['Ama Serwaa'], '6/6', '6/6', '14', '15', 'Normal', 'Full', 'Routine check — normal', thisMonth + ' 09:00:00');

examInsert.run(patientIds['Vera Danso'], '6/6', '6/6', '15', '15', 'Normal', 'Full', 'Baseline exam', '2025-08-01 09:00:00');
examInsert.run(patientIds['Vera Danso'], '6/18', '6/9', '18', '17', 'Normal', 'Mild constriction', 'Follow-up — vision declined', thisMonth + ' 10:00:00');

examInsert.run(patientIds['Kwabena Osei'], '6/6', '6/9', '13', '14', 'Normal', 'Full', 'Astigmatism, mild', '2025-06-10 09:00:00');

const invoiceInsert = db.prepare(`
  INSERT INTO invoices (patient_id, description, amount, status, payment_method, order_status, stock_item_id, quantity_sold, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

invoiceInsert.run(patientIds['Ama Serwaa'], 'Eye Exam Fee', 50, 'paid', 'cash', 'ordered', null, null, thisMonth + ' 09:10:00');
invoiceInsert.run(patientIds['Ama Serwaa'], 'Rimless Titanium Frame', 180, 'paid', 'momo', 'ready', stockIds['Rimless Titanium Frame'], 1, thisMonth + ' 09:15:00');

invoiceInsert.run(patientIds['Kofi Mensah'], 'Eye Exam Fee', 50, 'unpaid', null, 'ordered', null, null, thisMonth + ' 11:00:00');

invoiceInsert.run(patientIds['Vera Danso'], 'Classic Round Frame', 120, 'paid', 'card', 'collected', stockIds['Classic Round Frame'], 1, thisMonth + ' 10:30:00');
invoiceInsert.run(patientIds['Vera Danso'], 'Antibiotic Eye Drops', 25, 'unpaid', null, 'ordered', stockIds['Antibiotic Eye Drops'], 1, thisMonth + ' 10:35:00');

invoiceInsert.run(patientIds['Efua Boateng'], 'Kids Flex Frame', 90, 'paid', 'cash', 'collected', stockIds['Kids Flex Frame'], 1, '2025-11-02 09:00:00');

const queueInsert = db.prepare('INSERT INTO queue_entries (patient_id, status) VALUES (?, ?)');
queueInsert.run(patientIds['Ama Serwaa'], 'waiting');
queueInsert.run(patientIds['Kofi Mensah'], 'waiting');
queueInsert.run(patientIds['Kwabena Osei'], 'completed');

const reminderInsert = db.prepare('INSERT INTO reminders (patient_id, due_date, note, status) VALUES (?, ?, ?, ?)');
reminderInsert.run(patientIds['Vera Danso'], thisMonth, 'Vision decline follow-up review', 'pending');
reminderInsert.run(patientIds['Efua Boateng'], thisMonth, 'Time to consider replacing your glasses (2 years since collection).', 'pending');
reminderInsert.run(patientIds['Ama Serwaa'], '2026-01-15', 'Annual checkup', 'sent');

const certInsert = db.prepare('INSERT INTO certificates (name, expiry_date) VALUES (?, ?)');
const soon = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
certInsert.run('Optometry Practice License', soon);
certInsert.run('Fire Safety Certificate', '2027-05-01');

console.log('Done! Seeded:');
console.log('  ' + stock.length + ' stock items');
console.log('  ' + patients.length + ' patients');
console.log('  4 examinations');
console.log('  6 invoices');
console.log('  3 queue entries');
console.log('  3 reminders');
console.log('  2 certificates');