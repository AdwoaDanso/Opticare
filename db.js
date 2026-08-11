const Database = require('better-sqlite3');

const db = new Database('opticare.sqlite');

db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS examinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    visual_acuity_right TEXT,
    visual_acuity_left TEXT,
    diagnosis TEXT,
    exam_date TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS queue_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    checked_in_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS stock_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0
  )
`);

// ---- Patches for columns added after the tables above were first created ----
// (CREATE TABLE IF NOT EXISTS only runs on a brand-new table, so any column
// added later needs an explicit ALTER TABLE like these instead.)

try {
  db.exec('ALTER TABLE invoices ADD COLUMN payment_method TEXT');
} catch (err) {
  // Column already exists — safe to ignore
}

try {
  db.exec("ALTER TABLE invoices ADD COLUMN order_status TEXT DEFAULT 'ordered'");
} catch (err) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE patients ADD COLUMN email TEXT');
} catch (err) {
  // Column already exists
}

try {
  db.exec('ALTER TABLE examinations ADD COLUMN eye_pressure_right TEXT');
} catch (err) {}

try {
  db.exec('ALTER TABLE examinations ADD COLUMN eye_pressure_left TEXT');
} catch (err) {}

try {
  db.exec('ALTER TABLE examinations ADD COLUMN color_vision TEXT');
} catch (err) {}

try {
  db.exec('ALTER TABLE examinations ADD COLUMN visual_field TEXT');
} catch (err) {}

try {
  db.exec('ALTER TABLE invoices ADD COLUMN stock_item_id INTEGER');
} catch (err) {}

try {
  db.exec('ALTER TABLE invoices ADD COLUMN quantity_sold INTEGER');
} catch (err) {}

module.exports = db;