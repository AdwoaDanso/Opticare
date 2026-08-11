const express = require('express');
const db = require('./db');
const session = require('express-session');
const bcrypt = require('bcryptjs');
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
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
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

  res.render('home', {
    clinicName: 'OptiCare Clinic',
    patients: patients,
    totalPatients: totalPatients,
    waitingCount: waitingCount,
    unpaidCount: unpaidCount,
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

      return res.render('home', {
        clinicName: 'OptiCare Clinic',
        patients: patients,
        totalPatients: totalPatients,
        waitingCount: waitingCount,
        unpaidCount: unpaidCount,
        duplicateWarning: existing,
        pendingFullName: fullName,
        pendingPhone: phone,
      });
    }
  }

  db.prepare('INSERT INTO patients (full_name, phone, email) VALUES (?, ?, ?)').run(fullName, phone, email);
  res.redirect('/');
});

app.get('/patients/:id', requireLogin, (req, res) => {
  const patientId = req.params.id;

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  const exams = db.prepare('SELECT * FROM examinations WHERE patient_id = ? ORDER BY exam_date DESC').all(patientId);
  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
  const reminders = db.prepare('SELECT * FROM reminders WHERE patient_id = ? ORDER BY due_date ASC').all(patientId);
  const stockItems = db.prepare('SELECT * FROM stock_items ORDER BY name').all();

  const visionAlert = checkForDecline(exams);
  res.render('patient', { patient: patient, exams: exams, invoices: invoices, reminders: reminders, visionAlert: visionAlert, stockItems: stockItems });
});

// ===== Exams =====

app.post('/patients/:id/exams', requireLogin, (req, res) => {
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

// ===== Invoices =====

app.post('/patients/:id/invoices', requireLogin, (req, res) => {
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

app.post('/invoices/:id/pay', requireLogin, (req, res) => {
  const paymentMethod = req.body.payment_method;

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  db.prepare("UPDATE invoices SET status = 'paid', payment_method = ? WHERE id = ?")
    .run(paymentMethod, req.params.id);

  res.redirect('/patients/' + invoice.patient_id);
});

app.post('/invoices/:id/order-status', requireLogin, (req, res) => {
  const orderStatus = req.body.order_status;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  db.prepare('UPDATE invoices SET order_status = ? WHERE id = ?').run(orderStatus, req.params.id);

  res.redirect('/patients/' + invoice.patient_id);
});

// ===== Reminders =====

app.post('/patients/:id/reminders', requireLogin, (req, res) => {
  const patientId = req.params.id;
  const dueDate = req.body.due_date;
  const note = req.body.note;

  db.prepare('INSERT INTO reminders (patient_id, due_date, note) VALUES (?, ?, ?)').run(patientId, dueDate, note);

  res.redirect('/patients/' + patientId);
});

app.post('/reminders/:id/send', requireLogin, (req, res) => {
  const channel = req.body.channel; // 'email' or 'whatsapp'

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

  // DEMO MODE: we're not actually connected to a real email/WhatsApp service,
  // so instead of sending, we log what *would* have been sent.
  db.prepare(
    'INSERT INTO message_log (patient_id, channel, recipient, body) VALUES (?, ?, ?, ?)'
  ).run(reminder.patient_id, channel, recipient, messageBody);

  db.prepare("UPDATE reminders SET status = 'sent' WHERE id = ?").run(reminder.id);

  res.redirect('/patients/' + reminder.patient_id);
});

// ===== Queue =====

app.post('/queue/checkin/:patientId', requireLogin, (req, res) => {
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

// ===== Misc =====

app.get('/about', (req, res) => {
  res.send('About OptiCare');
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

app.get('/exams/:id/prescription', requireLogin, (req, res) => {
  const exam = db.prepare(`
    SELECT examinations.*, patients.full_name, patients.phone
    FROM examinations JOIN patients ON patients.id = examinations.patient_id
    WHERE examinations.id = ?
  `).get(req.params.id);

  res.render('prescription', { exam: exam });
});

app.get('/export/patients', requireLogin, (req, res) => {
  const patients = db.prepare('SELECT * FROM patients').all();

  let csv = 'ID,Full Name,Phone\n';
  patients.forEach(function(p) {
    csv += p.id + ',' + p.full_name + ',' + (p.phone || '') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="patients.csv"');
  res.send(csv);
});

app.get('/recall', requireLogin, (req, res) => {
  const overduePatients = db.prepare(`
    SELECT patients.*, MAX(examinations.exam_date) AS last_visit
    FROM patients
    LEFT JOIN examinations ON examinations.patient_id = patients.id
    GROUP BY patients.id
    HAVING last_visit IS NULL OR last_visit < date('now', '-180 days')
  `).all();

  res.render('recall', { overduePatients: overduePatients });
});

app.post('/recall/send', requireLogin, (req, res) => {
  let patientIds = req.body.patient_ids;
  if (!Array.isArray(patientIds)) patientIds = [patientIds];

  patientIds.forEach(function(id) {
    db.prepare("INSERT INTO reminders (patient_id, due_date, note, status) VALUES (?, date('now'), 'Recall: overdue for review', 'sent')").run(id);
  });

  res.redirect('/recall');
});

// ===== Inventory =====

app.get('/inventory', requireLogin, (req, res) => {
  const items = db.prepare('SELECT * FROM stock_items ORDER BY category, name').all();
  res.render('inventory', { items: items });
});

app.post('/inventory', requireLogin, (req, res) => {
  const name = req.body.name;
  const category = req.body.category;
  const quantity = req.body.quantity;
  const unitPrice = req.body.unit_price;

  db.prepare('INSERT INTO stock_items (name, category, quantity, unit_price) VALUES (?, ?, ?, ?)')
    .run(name, category, quantity, unitPrice);

  res.redirect('/inventory');
});

app.post('/inventory/:id/adjust', requireLogin, (req, res) => {
  const delta = Number(req.body.delta);
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  const newQuantity = Math.max(0, item.quantity + delta);

  db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(newQuantity, req.params.id);

  res.redirect('/inventory');
});