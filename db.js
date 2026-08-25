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

db.exec(`
  CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    renewed_at TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS patient_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
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

try {
  db.exec('ALTER TABLE patients ADD COLUMN created_at TEXT');
} catch (err) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'admin'");
} catch (err) {}

try {
  db.exec('ALTER TABLE queue_entries ADD COLUMN room TEXT');
} catch (err) {}

// Patient Demographics & Clinical History
try { db.exec('ALTER TABLE patients ADD COLUMN gender TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN dob TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN age INTEGER'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN occupation TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN medical_history TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN allergies TEXT'); } catch (err) {}

// Optometric Examination Columns
try { db.exec('ALTER TABLE examinations ADD COLUMN chief_complaint TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_unaided_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_unaided_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_unaided_both TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_near_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_near_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_pinhole_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN va_pinhole_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_sphere_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_cyl_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_axis_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_va_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_sphere_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_cyl_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_axis_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_va_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_add TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN pd_distance TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN pd_near TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN iop_method TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN anterior_segment TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN posterior_segment TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN ocular_motility TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN icd10_code TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN icd10_desc TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN management_plan TEXT'); } catch (err) {}

// Categorized Invoices Columns
try { db.exec("ALTER TABLE invoices ADD COLUMN category TEXT DEFAULT 'Consultation'"); } catch (err) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN unit_price REAL DEFAULT 0'); } catch (err) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN quantity INTEGER DEFAULT 1'); } catch (err) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN discount REAL DEFAULT 0'); } catch (err) {}

// Emergency Contact
try { db.exec('ALTER TABLE patients ADD COLUMN emergency_contact_name TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE patients ADD COLUMN emergency_contact_phone TEXT'); } catch (err) {}

// Objective Refraction columns (separate from subjective)
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_sphere_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_cyl_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_axis_right TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_sphere_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_cyl_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_axis_left TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE examinations ADD COLUMN obj_method TEXT'); } catch (err) {}

// Refraction additional notes
try { db.exec('ALTER TABLE examinations ADD COLUMN refraction_notes TEXT'); } catch (err) {}

// Prescribed drugs (JSON array of drug names)
try { db.exec('ALTER TABLE examinations ADD COLUMN prescribed_drugs TEXT'); } catch (err) {}

// Biomicroscopy structured grid (stored as JSON per structure)
try { db.exec('ALTER TABLE examinations ADD COLUMN biomicroscopy TEXT'); } catch (err) {}

// Expiry date on stock items
try { db.exec('ALTER TABLE stock_items ADD COLUMN expiry_date TEXT'); } catch (err) {}

// Referrals table — saved referral letters per patient
db.exec(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    referred_to TEXT,
    urgency TEXT,
    reason TEXT,
    clinical_findings TEXT,
    additional_notes TEXT,
    doctor_name TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  )
`);

// Settings table — clinic-wide settings (admin only)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Multi-Doctor & Staff Login Enhancements
try { db.exec('ALTER TABLE users ADD COLUMN name TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE users ADD COLUMN room TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP'); } catch (err) {}
try { db.exec('ALTER TABLE queue_entries ADD COLUMN doctor_name TEXT'); } catch (err) {}

// Set initial names and rooms on default users if empty
try {
  db.prepare("UPDATE users SET name = 'Dr. Kwesi Asante Boateng, OD', room = 'Consultation Room 1' WHERE email = 'doctor@opticare.local' AND (name IS NULL OR name = '')").run();
  db.prepare("UPDATE users SET name = 'System Administrator' WHERE email = 'admin@opticare.local' AND (name IS NULL OR name = '')").run();
  db.prepare("UPDATE users SET name = 'Front Desk Receptionist' WHERE email = 'receptionist@opticare.local' AND (name IS NULL OR name = '')").run();
} catch (e) {}

// Default consultation fee if not set
const existingFee = db.prepare("SELECT value FROM settings WHERE key = 'consultation_fee'").get();
if (!existingFee) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('consultation_fee', '150.00')").run();
}

db.exec("UPDATE patients SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");

module.exports = db;