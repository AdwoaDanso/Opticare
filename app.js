const express = require('express');
const db = require('./db');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const { checkForDecline } = require('./vision');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'change-this-later',
  resave: false,
  saveUninitialized: false,
}));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;

  if (req.session.userId) {
    res.locals.currentUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  } else {
    res.locals.currentUser = null;
  }

  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!res.locals.currentUser || !allowedRoles.includes(res.locals.currentUser.role)) {
      return res.status(403).send('Access denied — your role doesn\'t have permission for this. <a href="/dashboard">Back to Dashboard</a>');
    }
    next();
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: function (req, file, cb) {
      const uniqueName = Date.now() + '-' + file.originalname;
      cb(null, uniqueName);
    },
  }),
});

// ===== Auth =====

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.send('No account found with that email. <a href="/login">Try again</a>');
  }

  const passwordMatches = bcrypt.compareSync(password, user.password);

  if (!passwordMatches) {
    return res.send('Wrong password. <a href="/login">Try again</a>');
  }

  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ===== Dashboard =====

app.get('/dashboard', requireLogin, (req, res) => {
  const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
  const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;
  const unpaidCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
  const lowStockCount = db.prepare('SELECT COUNT(*) AS count FROM stock_items WHERE quantity <= 3').get().count;
  const expiringCertificates = db.prepare(
    "SELECT * FROM certificates WHERE expiry_date <= date('now', '+30 days')"
  ).all();

  const thisMonth = new Date().toISOString().slice(0, 7);
  const newClientsThisMonth = db.prepare(
    "SELECT COUNT(*) AS count FROM patients WHERE strftime('%Y-%m', created_at) = ?"
  ).get(thisMonth).count;

  const revenueThisMonth = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE status = 'paid' AND strftime('%Y-%m', created_at) = ?"
  ).get(thisMonth).total;

  const recentPatients = db.prepare('SELECT * FROM patients ORDER BY id DESC LIMIT 5').all();
  const pendingReminders = db.prepare(`
    SELECT reminders.*, patients.full_name
    FROM reminders JOIN patients ON patients.id = reminders.patient_id
    WHERE reminders.status = 'pending'
    ORDER BY reminders.due_date ASC
    LIMIT 5
  `).all();

  const monthlyPatients = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
    FROM patients
    WHERE created_at >= date('now', '-6 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  const stockByCategory = db.prepare(`
    SELECT category, SUM(quantity) AS total
    FROM stock_items
    GROUP BY category
  `).all();

  res.render('dashboard', {
    totalPatients: totalPatients,
    waitingCount: waitingCount,
    unpaidCount: unpaidCount,
    lowStockCount: lowStockCount,
    expiringCertificates: expiringCertificates,
    newClientsThisMonth: newClientsThisMonth,
    revenueThisMonth: revenueThisMonth,
    recentPatients: recentPatients,
    pendingReminders: pendingReminders,
    monthlyPatients: monthlyPatients,
    stockByCategory: stockByCategory,
  });
});

// ===== Home / Patients =====

app.get('/', requireLogin, (req, res) => {
  const searchTerm = req.query.q;

  let patients;
  if (searchTerm) {
    patients = db.prepare('SELECT * FROM patients WHERE full_name LIKE ?').all('%' + searchTerm + '%');
  } else {
    patients = db.prepare('SELECT * FROM patients').all();
  }

  const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
  const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;
  const unpaidCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
  const expiringCertificates = db.prepare(
    "SELECT * FROM certificates WHERE expiry_date <= date('now', '+30 days')"
  ).all();

  res.render('home', {
    clinicName: 'OptiCare Clinic',
    patients: patients,
    totalPatients: totalPatients,
    waitingCount: waitingCount,
    unpaidCount: unpaidCount,
    expiringCertificates: expiringCertificates,
  });
});

app.post('/patients', requireLogin, (req, res) => {
  const fullName = req.body.full_name;
  const phone = req.body.phone;
  const email = req.body.email;
  const confirmed = req.body.confirm_duplicate;

  if (!confirmed) {
    let existing = null;
    if (phone) {
      existing = db.prepare('SELECT * FROM patients WHERE phone = ?').get(phone);
    }
    if (!existing && fullName) {
      existing = db.prepare('SELECT * FROM patients WHERE full_name = ?').get(fullName);
    }

    if (existing) {
      const patients = db.prepare('SELECT * FROM patients').all();
      const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
      const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;
      const unpaidCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
      const expiringCertificates = db.prepare(
        "SELECT * FROM certificates WHERE expiry_date <= date('now', '+30 days')"
      ).all();

      return res.render('home', {
        clinicName: 'OptiCare Clinic',
        patients: patients,
        totalPatients: totalPatients,
        waitingCount: waitingCount,
        unpaidCount: unpaidCount,
        expiringCertificates: expiringCertificates,
        duplicateWarning: existing,
        pendingFullName: fullName,
        pendingPhone: phone,
      });
    }
  }

  db.prepare('INSERT INTO patients (full_name, phone, email, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(fullName, phone, email);
  res.redirect('/');
});

app.get('/patients/:id', requireLogin, (req, res) => {
  const patientId = req.params.id;

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  const exams = db.prepare('SELECT * FROM examinations WHERE patient_id = ? ORDER BY exam_date DESC').all(patientId);
  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
  const reminders = db.prepare('SELECT * FROM reminders WHERE patient_id = ? ORDER BY due_date ASC').all(patientId);
  const stockItems = db.prepare('SELECT * FROM stock_items ORDER BY name').all();
  const files = db.prepare('SELECT * FROM patient_files WHERE patient_id = ? ORDER BY uploaded_at DESC').all(patientId);

  const visionAlert = checkForDecline(exams);
  res.render('patient', {
    patient: patient,
    exams: exams,
    invoices: invoices,
    reminders: reminders,
    visionAlert: visionAlert,
    stockItems: stockItems,
    files: files,
  });
});

app.get('/patients/:id/referral', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  res.render('referral', { patient: patient });
});

app.post('/patients/:id/referral', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  const reason = req.body.reason;
  const referredTo = req.body.referred_to;

  res.render('referral-print', { patient: patient, reason: reason, referredTo: referredTo });
});

// ===== Exams =====

app.post('/patients/:id/exams', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patientId = req.params.id;
  const visualAcuityRight = req.body.visual_acuity_right;
  const visualAcuityLeft = req.body.visual_acuity_left;
  const eyePressureRight = req.body.eye_pressure_right;
  const eyePressureLeft = req.body.eye_pressure_left;
  const colorVision = req.body.color_vision;
  const visualField = req.body.visual_field;
  const diagnosis = req.body.diagnosis;

  db.prepare(`
    INSERT INTO examinations
      (patient_id, visual_acuity_right, visual_acuity_left, eye_pressure_right, eye_pressure_left, color_vision, visual_field, diagnosis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patientId, visualAcuityRight, visualAcuityLeft, eyePressureRight, eyePressureLeft, colorVision, visualField, diagnosis);

  res.redirect('/patients/' + patientId);
});

app.get('/exams/:id/prescription', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const exam = db.prepare(`
    SELECT examinations.*, patients.full_name, patients.phone
    FROM examinations JOIN patients ON patients.id = examinations.patient_id
    WHERE examinations.id = ?
  `).get(req.params.id);

  res.render('prescription', { exam: exam });
});

// ===== Invoices =====

app.post('/patients/:id/invoices', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const patientId = req.params.id;
  const description = req.body.description;
  const amount = req.body.amount;
  const stockItemId = req.body.stock_item_id;
  const quantitySold = req.body.quantity_sold;

  db.prepare(`
    INSERT INTO invoices (patient_id, description, amount, stock_item_id, quantity_sold)
    VALUES (?, ?, ?, ?, ?)
  `).run(patientId, description, amount, stockItemId || null, quantitySold || null);

  if (stockItemId && quantitySold) {
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(stockItemId);
    const newQuantity = Math.max(0, item.quantity - Number(quantitySold));
    db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(newQuantity, stockItemId);
  }

  res.redirect('/patients/' + patientId);
});

app.post('/invoices/:id/pay', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const paymentMethod = req.body.payment_method;

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  db.prepare("UPDATE invoices SET status = 'paid', payment_method = ? WHERE id = ?")
    .run(paymentMethod, req.params.id);

  res.redirect('/patients/' + invoice.patient_id);
});

app.post('/invoices/:id/order-status', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const orderStatus = req.body.order_status;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  db.prepare('UPDATE invoices SET order_status = ? WHERE id = ?').run(orderStatus, req.params.id);

  if (orderStatus === 'ready') {
    db.prepare(`
      INSERT INTO reminders (patient_id, due_date, note)
      VALUES (?, date('now'), 'Your glasses are ready for collection!')
    `).run(invoice.patient_id);
  }

  if (orderStatus === 'collected') {
    db.prepare(`
      INSERT INTO reminders (patient_id, due_date, note)
      VALUES (?, date('now', '+2 years'), 'Time to consider replacing your glasses (2 years since collection).')
    `).run(invoice.patient_id);
  }

  res.redirect('/patients/' + invoice.patient_id);
});

// ===== Reminders =====

app.post('/patients/:id/reminders', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const patientId = req.params.id;
  const dueDate = req.body.due_date;
  const note = req.body.note;

  db.prepare('INSERT INTO reminders (patient_id, due_date, note) VALUES (?, ?, ?)').run(patientId, dueDate, note);

  res.redirect('/patients/' + patientId);
});

app.post('/reminders/:id/send', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const channel = req.body.channel;

  const reminder = db.prepare(`
    SELECT reminders.*, patients.full_name, patients.email, patients.phone
    FROM reminders JOIN patients ON patients.id = reminders.patient_id
    WHERE reminders.id = ?
  `).get(req.params.id);

  const recipient = channel === 'email' ? reminder.email : reminder.phone;

  if (!recipient) {
    return res.send('This patient has no ' + channel + ' on file. <a href="javascript:history.back()">Go back</a>');
  }

  const messageBody = 'Hi ' + reminder.full_name + ', this is a reminder from OptiCare Clinic. ' +
    (reminder.note || 'Please visit us for your review.') + ' (Due: ' + reminder.due_date + ')';

  db.prepare(
    'INSERT INTO message_log (patient_id, channel, recipient, body) VALUES (?, ?, ?, ?)'
  ).run(reminder.patient_id, channel, recipient, messageBody);

  db.prepare("UPDATE reminders SET status = 'sent' WHERE id = ?").run(reminder.id);

  res.redirect('/patients/' + reminder.patient_id);
});

// ===== Queue =====

app.post('/queue/checkin/:patientId', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const patientId = req.params.patientId;
  db.prepare('INSERT INTO queue_entries (patient_id, status) VALUES (?, ?)').run(patientId, 'waiting');
  res.redirect('/patients/' + patientId);
});

app.get('/queue', requireLogin, (req, res) => {
  const queueEntries = db.prepare(`
    SELECT queue_entries.*, patients.full_name
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.status = 'waiting'
  `).all();

  res.render('queue', { queueEntries: queueEntries });
});

app.post('/queue/:id/complete', requireLogin, (req, res) => {
  db.prepare("UPDATE queue_entries SET status = 'completed' WHERE id = ?").run(req.params.id);
  res.redirect('/queue');
});

// ===== Inventory =====

app.get('/inventory', requireLogin, (req, res) => {
  const items = db.prepare('SELECT * FROM stock_items ORDER BY category, name').all();
  res.render('inventory', { items: items });
});

app.post('/inventory', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const name = req.body.name;
  const category = req.body.category;
  const quantity = req.body.quantity;
  const unitPrice = req.body.unit_price;

  db.prepare('INSERT INTO stock_items (name, category, quantity, unit_price) VALUES (?, ?, ?, ?)')
    .run(name, category, quantity, unitPrice);

  res.redirect('/inventory');
});

app.post('/inventory/:id/adjust', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const delta = Number(req.body.delta);
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  const newQuantity = Math.max(0, item.quantity + delta);

  db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(newQuantity, req.params.id);

  res.redirect('/inventory');
});

// ===== Recall =====

app.get('/recall', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const overduePatients = db.prepare(`
    SELECT patients.*, MAX(examinations.exam_date) AS last_visit
    FROM patients
    LEFT JOIN examinations ON examinations.patient_id = patients.id
    GROUP BY patients.id
    HAVING last_visit IS NULL OR last_visit < date('now', '-180 days')
  `).all();

  res.render('recall', { overduePatients: overduePatients });
});

app.post('/recall/send', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  let patientIds = req.body.patient_ids;
  if (!Array.isArray(patientIds)) patientIds = [patientIds];

  patientIds.forEach(function(id) {
    db.prepare("INSERT INTO reminders (patient_id, due_date, note, status) VALUES (?, date('now'), 'Recall: overdue for review', 'sent')").run(id);
  });

  res.redirect('/recall');
});

// ===== Report =====

app.get('/report', requireLogin, requireRole('admin'), (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;

  const newClients = db.prepare(
    "SELECT COUNT(*) AS count FROM patients WHERE strftime('%Y-%m', created_at) = ?"
  ).get(month).count;

  const oldClients = db.prepare(`
    SELECT COUNT(DISTINCT examinations.patient_id) AS count
    FROM examinations
    JOIN patients ON patients.id = examinations.patient_id
    WHERE strftime('%Y-%m', examinations.exam_date) = ?
      AND (patients.created_at IS NULL OR strftime('%Y-%m', patients.created_at) != ?)
  `).get(month, month).count;

  const reviews = db.prepare(`
    SELECT COUNT(*) AS count
    FROM examinations e1
    WHERE strftime('%Y-%m', e1.exam_date) = ?
      AND EXISTS (
        SELECT 1 FROM examinations e2
        WHERE e2.patient_id = e1.patient_id AND e2.exam_date < e1.exam_date
      )
  `).get(month).count;

  const salesByCategory = db.prepare(`
    SELECT stock_items.category AS category,
           SUM(invoices.quantity_sold) AS total_sold,
           SUM(invoices.amount) AS total_revenue
    FROM invoices
    JOIN stock_items ON stock_items.id = invoices.stock_item_id
    WHERE strftime('%Y-%m', invoices.created_at) = ?
    GROUP BY stock_items.category
  `).all(month);

  const stockRemaining = db.prepare(`
    SELECT category, SUM(quantity) AS total_remaining
    FROM stock_items
    GROUP BY category
  `).all();

  res.render('report', {
    month: month,
    totalPatients: totalPatients,
    newClients: newClients,
    oldClients: oldClients,
    reviews: reviews,
    salesByCategory: salesByCategory,
    stockRemaining: stockRemaining,
  });
});

// ===== Certificates =====

app.get('/certificates', requireLogin, requireRole('admin'), (req, res) => {
  const certificates = db.prepare('SELECT * FROM certificates ORDER BY expiry_date ASC').all();
  res.render('certificates', { certificates: certificates });
});

app.post('/certificates', requireLogin, requireRole('admin'), (req, res) => {
  const name = req.body.name;
  const expiryDate = req.body.expiry_date;

  db.prepare('INSERT INTO certificates (name, expiry_date) VALUES (?, ?)').run(name, expiryDate);

  res.redirect('/certificates');
});

app.post('/certificates/:id/renew', requireLogin, requireRole('admin'), (req, res) => {
  const newExpiryDate = req.body.expiry_date;

  db.prepare('UPDATE certificates SET expiry_date = ?, renewed_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newExpiryDate, req.params.id);

  res.redirect('/certificates');
});

// ===== Files (scans/images) =====

app.post('/patients/:id/files', requireLogin, requireRole('admin', 'doctor'), upload.single('file'), (req, res) => {
  const patientId = req.params.id;

  db.prepare('INSERT INTO patient_files (patient_id, filename, original_name) VALUES (?, ?, ?)')
    .run(patientId, req.file.filename, req.file.originalname);

  res.redirect('/patients/' + patientId);
});

app.get('/uploads/:filename', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  res.sendFile(path.join(__dirname, 'uploads', req.params.filename));
});

// ===== Export =====

app.get('/export/patients', requireLogin, requireRole('admin'), (req, res) => {
  const patients = db.prepare('SELECT * FROM patients').all();

  let csv = 'ID,Full Name,Phone\n';
  patients.forEach(function(p) {
    csv += p.id + ',' + p.full_name + ',' + (p.phone || '') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="patients.csv"');
  res.send(csv);
});

// ===== Misc =====

app.get('/about', (req, res) => {
  res.send('About OptiCare');
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});