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

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// ---- Patches for columns added after the tables above were first created ----
// (CREATE TABLE IF NOT EXISTS only runs on a brand-new table, so any column
// added later needs an explicit ALTER TABLE like these instead.)

try {
  db.exec('ALTER TABLE invoices ADD COLUMN payment_method TEXT');
} catch (err) {
  // Column already exists - safe to ignore
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
try { db.exec('ALTER TABLE patients ADD COLUMN address TEXT'); } catch (err) {}

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

// Referrals table - saved referral letters per patient
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

// Settings table - clinic-wide settings (admin only)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Multi-Doctor & Staff Login Enhancements
try { db.exec('ALTER TABLE users ADD COLUMN name TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE users ADD COLUMN room TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE users ADD COLUMN created_at TEXT'); } catch (err) {}
try { db.exec("UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL"); } catch (err) {}
try { db.exec('ALTER TABLE queue_entries ADD COLUMN doctor_name TEXT'); } catch (err) {}
try { db.exec('ALTER TABLE queue_entries ADD COLUMN visit_reason TEXT'); } catch (err) {}

// Appointments & Reviews Enhancements
try { db.exec("ALTER TABLE reminders ADD COLUMN appointment_time TEXT DEFAULT '09:00'"); } catch (err) {}
try { db.exec('ALTER TABLE reminders ADD COLUMN doctor_name TEXT'); } catch (err) {}
try { db.exec("ALTER TABLE reminders ADD COLUMN appointment_type TEXT DEFAULT 'Clinical Review'"); } catch (err) {}
try { db.exec('ALTER TABLE reminders ADD COLUMN created_at TEXT'); } catch (err) {}
try { db.exec("UPDATE reminders SET created_at = datetime('now') WHERE created_at IS NULL"); } catch (err) {}

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

// Seed initial examinations if empty so dashboard charts display immediately
try {
  const examCount = db.prepare('SELECT COUNT(*) AS count FROM examinations').get().count;
  if (examCount === 0) {
    const iexam = db.prepare(`
      INSERT INTO examinations(
        patient_id, chief_complaint, visual_acuity_right, visual_acuity_left,
        refraction_sphere_right, refraction_cyl_right, refraction_axis_right,
        refraction_sphere_left, refraction_cyl_left, refraction_axis_left,
        eye_pressure_right, eye_pressure_left, diagnosis, icd10_code, management_plan, exam_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialExams = [
      [1, 'Blurry distance vision when sewing', '6/18', '6/24', '-1.50', '-0.50', 90, '-1.75', '-0.75', 85, 14, 15, 'Compound Myopic Astigmatism', 'H52.13', 'Prescribed single vision corrective glasses.', '2026-03-08 09:30:00'],
      [2, 'Gradual reduction in vision and floaters', '6/24', '6/36', '+0.50', '-1.00', 180, '+0.75', '-1.25', 175, 18, 19, 'Nonproliferative Diabetic Retinopathy', 'E11.319', 'Referral sent to tertiary clinic. Glycaemic control.', '2026-03-14 10:45:00'],
      [3, 'Severe eye strain after computer work', '6/6', '6/6', '+0.50', '-0.25', 90, '+0.50', '-0.25', 90, 13, 13, 'Asthenopia / Eye Strain', 'H53.149', 'Prescribed blue-light filtering spectacle lenses.', '2026-04-22 11:20:00'],
      [4, 'Routine glaucoma review and IOP test', '6/9', '6/12', '+1.00', '0.00', 0, '+1.25', '0.00', 0, 22, 24, 'Primary Open-Angle Glaucoma', 'H40.113', 'Continue Latanoprost 0.005% nocte. Review in 6 months.', '2026-04-29 08:55:00'],
      [5, 'Blurry blackboard vision in school', '6/36', '6/24', '-2.25', '-0.75', 10, '-2.00', '-0.50', 170, 14, 15, 'Myopia, Bilateral', 'H52.13', 'Prescribed full-time spectacle wear.', '2026-05-05 13:40:00'],
      [6, 'Redness and discharge in right eye', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 15, 'Acute Conjunctivitis', 'H10.9', 'Prescribed Ciprofloxacin 0.3% Eye Drops.', '2026-05-11 09:15:00'],
      [7, 'Severe clouding of vision, cannot see clearly', 'CF 1m', '6/60', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 13, 'Age-Related Cataract, Bilateral', 'H25.9', 'Referred for cataract extraction surgery.', '2026-06-18 08:45:00'],
      [8, 'Burning, itching, and dry sensation', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 14, 'Dry Eye Syndrome, Bilateral', 'H04.123', 'Prescribed Artificial Tears CMC 0.5% QDS.', '2026-06-25 14:15:00'],
      [9, 'Itchy red eyes during dusty weather', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 16, 'Allergic Conjunctivitis', 'H10.9', 'Prescribed Olopatadine 0.1% eye drops BD.', '2026-07-03 10:30:00'],
      [11, 'Difficulty reading near text', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 15, 'Presbyopia', 'H52.4', 'Prescribed +2.00 DS near reading glasses.', '2026-07-17 11:45:00'],
      [14, 'Blurry night driving and glare', '6/12', '6/18', '-0.75', '-1.00', 95, '-1.00', '-1.25', 85, 16, 17, 'Regular Astigmatism, Bilateral', 'H52.223', 'Prescribed anti-reflective night driving lenses.', '2026-07-07 09:15:00'],
      [18, 'Ocular throbbing and halo around lights', '6/9', '6/9', '+0.75', '0.00', 0, '+0.75', '0.00', 0, 21, 22, 'Primary Open-Angle Glaucoma', 'H40.113', 'Advised baseline HVF 24-2 and OCT RNFL scan.', '2026-08-05 10:00:00'],
      [20, 'Follow-up for chronic open angle glaucoma', '6/12', '6/12', '+1.25', '-0.50', 180, '+1.50', '-0.50', 180, 16, 16, 'Primary Open-Angle Glaucoma', 'H40.113', 'IOP well controlled on Timolol & Latanoprost.', '2026-08-19 08:45:00'],
      [23, 'Severe sandy feeling and grittiness', '6/6', '6/9', '0.00', '-0.50', 90, '0.00', '-0.50', 90, 15, 14, 'Dry Eye Syndrome, Bilateral', 'H04.123', 'Prescribed lubricating drops QDS.', '2026-08-22 10:15:00'],
      [27, 'Distance blur and eye fatigue', '6/18', '6/18', '-1.25', '0.00', 0, '-1.25', '0.00', 0, 14, 14, 'Myopia, Bilateral', 'H52.13', 'Prescribed single-vision distance glasses.', '2026-08-21 10:00:00'],
      [30, 'Small print blur when reading Bible', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 15, 'Presbyopia', 'H52.4', 'Prescribed +1.75 DS near reading glasses.', '2026-08-22 11:15:00']
    ];

    initialExams.forEach(e => iexam.run(...e));
  }
} catch (err) {}

db.exec("UPDATE patients SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL");

module.exports = db;