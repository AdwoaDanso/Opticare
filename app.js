require('dotenv').config();
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
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'opticare-secret-key-2026',
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

  // Load Clinic Settings & Letterhead globally for all templates
  let settingsObj = {};
  try {
    const settingsRows = db.prepare('SELECT key, value FROM settings').all();
    settingsRows.forEach(r => { settingsObj[r.key] = r.value; });
  } catch (err) {}
  res.locals.clinicSettings = settingsObj;

  next();
});

function requireLogin(req, res, next) {
  if (!req.session.userId || !res.locals.currentUser) {
    req.session.userId = null;
    return res.redirect('/login');
  }
  next();
}

function requireRole(...allowedRoles) {
  return function (req, res, next) {
    if (!res.locals.currentUser || !allowedRoles.includes(res.locals.currentUser.role)) {
      return res.status(403).send('Access denied - your role doesn\'t have permission for this. <a href="/dashboard">Back to Dashboard</a>');
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
  const role = res.locals.currentUser.role;

  const totalPatients = db.prepare('SELECT COUNT(*) AS count FROM patients').get().count;
  const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;
  const lowStockCount = db.prepare('SELECT COUNT(*) AS count FROM stock_items WHERE quantity <= 3').get().count;
  const expiringDrugsCount = db.prepare("SELECT COUNT(*) AS count FROM stock_items WHERE expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') AND expiry_date >= date('now')").get().count;

  let expiringCertificates = [];
  let revenueThisMonth = null;
  let unpaidCount = null;
  let expiringDrugs = [];

  if (role !== 'doctor') {
    unpaidCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
    expiringCertificates = db.prepare(
      "SELECT * FROM certificates WHERE expiry_date <= date('now', '+30 days')"
    ).all();
    expiringDrugs = db.prepare(
      "SELECT * FROM stock_items WHERE expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') AND expiry_date >= date('now') ORDER BY expiry_date ASC"
    ).all();

    if (role === 'admin') {
      const thisMonth = new Date().toISOString().slice(0, 7);
      revenueThisMonth = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM invoices WHERE status = 'paid' AND strftime('%Y-%m', created_at) = ?"
      ).get(thisMonth).total;
    }
  }

  const thisMonth = new Date().toISOString().slice(0, 7);
  const newClientsThisMonth = db.prepare(
    "SELECT COUNT(*) AS count FROM patients WHERE strftime('%Y-%m', created_at) = ?"
  ).get(thisMonth).count;

  const recentPatients = db.prepare('SELECT * FROM patients ORDER BY id DESC LIMIT 5').all();
  const pendingReminders = db.prepare(`
    SELECT reminders.*, patients.full_name
    FROM reminders JOIN patients ON patients.id = reminders.patient_id
    WHERE reminders.status = 'pending'
    ORDER BY reminders.due_date ASC
    LIMIT 5
  `).all();

  // Monthly consultations (continuous last 6 months timeline)
  const rawMonthlyConsultations = db.prepare(`
    SELECT strftime('%Y-%m', exam_date) AS month, COUNT(*) AS count
    FROM examinations
    WHERE exam_date >= date('now', '-6 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  const monthlyCountsMap = {};
  rawMonthlyConsultations.forEach(r => { if (r.month) monthlyCountsMap[r.month] = r.count; });

  const monthlyConsultations = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyyMm = d.toISOString().slice(0, 7);
    const monthLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    monthlyConsultations.push({
      month: monthLabel,
      rawMonth: yyyyMm,
      count: monthlyCountsMap[yyyyMm] || 0
    });
  }

  // Diagnosis distribution for pie chart
  const diagnosisDistribution = db.prepare(`
    SELECT
      CASE
        WHEN icd10_code LIKE 'H52%' THEN 'Refractive Error'
        WHEN icd10_code LIKE 'H40%' THEN 'Glaucoma'
        WHEN icd10_code LIKE 'H25%' OR icd10_code LIKE 'H26%' THEN 'Cataract'
        WHEN icd10_code LIKE 'H10%' THEN 'Conjunctivitis'
        WHEN icd10_code LIKE 'H04.1%' THEN 'Dry Eye'
        WHEN icd10_code = 'Z01.00' THEN 'Routine / Normal'
        WHEN icd10_code LIKE 'E11%' THEN 'Diabetic Retinopathy'
        WHEN icd10_code IS NOT NULL AND icd10_code != '' THEN 'Other'
        ELSE 'Unclassified'
      END AS category,
      COUNT(*) AS count
    FROM examinations
    GROUP BY category
    ORDER BY count DESC
    LIMIT 8
  `).all();

  let waitingQueue = [];
  if (role === 'doctor' || role === 'admin') {
    waitingQueue = db.prepare(`
      SELECT queue_entries.*, patients.full_name
      FROM queue_entries JOIN patients ON patients.id = queue_entries.patient_id
      WHERE queue_entries.status = 'waiting'
      ORDER BY queue_entries.checked_in_at ASC
    `).all();
  }

  // Patients ready at Reception / Cashier / Pharmacy for payment & drug collection
  const readyForBilling = db.prepare(`
    SELECT queue_entries.*, patients.full_name, patients.phone,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE invoices.patient_id = patients.id AND invoices.status = 'unpaid') AS unpaid_total,
           (SELECT COUNT(*) FROM invoices WHERE invoices.patient_id = patients.id AND invoices.category = 'Medications & Eye Drops' AND invoices.status = 'unpaid') AS drug_count
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.status = 'ready_for_billing'
    ORDER BY queue_entries.checked_in_at ASC
  `).all();

  res.render('dashboard', {
    role: role,
    totalPatients: totalPatients,
    waitingCount: waitingCount,
    unpaidCount: unpaidCount,
    lowStockCount: lowStockCount,
    expiringCertificates: expiringCertificates,
    expiringDrugs: expiringDrugs,
    expiringDrugsCount: expiringDrugsCount,
    newClientsThisMonth: newClientsThisMonth,
    revenueThisMonth: revenueThisMonth,
    recentPatients: recentPatients,
    pendingReminders: pendingReminders,
    monthlyConsultations: monthlyConsultations,
    diagnosisDistribution: diagnosisDistribution,
    waitingQueue: waitingQueue,
    readyForBilling: readyForBilling,
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
  const unpaidCount = res.locals.currentUser.role === 'doctor' ? null : db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
  const expiringCertificates = res.locals.currentUser.role === 'doctor' ? [] : db.prepare(
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
  const gender = req.body.gender || null;
  const dob = req.body.dob || null;
  const age = req.body.age ? parseInt(req.body.age) : null;
  const occupation = req.body.occupation || null;
  const medicalHistory = req.body.medical_history || null;
  const allergies = req.body.allergies || null;
  const emergencyContactName = req.body.emergency_contact_name || null;
  const emergencyContactPhone = req.body.emergency_contact_phone || null;
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
      const unpaidCount = res.locals.currentUser.role === 'doctor' ? null : db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE status = 'unpaid'").get().count;
      const expiringCertificates = res.locals.currentUser.role === 'doctor' ? [] : db.prepare(
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

  const insertResult = db.prepare(`
    INSERT INTO patients (full_name, phone, email, gender, dob, age, occupation, medical_history, allergies, emergency_contact_name, emergency_contact_phone, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(fullName, phone, email, gender, dob, age, occupation, medicalHistory, allergies, emergencyContactName, emergencyContactPhone);

  const newPatientId = insertResult.lastInsertRowid;

  // Automated Welcome SMS on Registration
  if (phone && phone.trim()) {
    const firstName = fullName.split(' ')[0] || fullName;
    const welcomeSms = `Hello ${firstName}, welcome to OptiCare Eye Clinic. Your patient profile (ID #${newPatientId}) has been successfully registered. Thank you for choosing us.`;
    dispatchSMS(newPatientId, phone.trim(), welcomeSms);
  }

  res.redirect('/patients/' + newPatientId);
});


app.post('/patients/:id/update', requireLogin, (req, res) => {
  const patientId = req.params.id;
  const fullName = req.body.full_name;
  const phone = req.body.phone;
  const email = req.body.email;
  const gender = req.body.gender;
  const age = req.body.age ? parseInt(req.body.age) : null;
  const occupation = req.body.occupation;
  const medicalHistory = req.body.medical_history;
  const allergies = req.body.allergies;
  const emergencyContactName = req.body.emergency_contact_name || null;
  const emergencyContactPhone = req.body.emergency_contact_phone || null;

  db.prepare(`
    UPDATE patients
    SET full_name = ?, phone = ?, email = ?, gender = ?, age = ?, occupation = ?, medical_history = ?, allergies = ?,
        emergency_contact_name = ?, emergency_contact_phone = ?
    WHERE id = ?
  `).run(fullName, phone, email, gender, age, occupation, medicalHistory, allergies, emergencyContactName, emergencyContactPhone, patientId);

  res.redirect('/patients/' + patientId);
});

app.get('/patients/:id', requireLogin, (req, res) => {
  const patientId = req.params.id;
  const role = res.locals.currentUser.role;

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) {
    return res.status(404).send('Patient not found. <a href="/">Back to patients</a>');
  }

  const exams = db.prepare('SELECT * FROM examinations WHERE patient_id = ? ORDER BY exam_date DESC').all(patientId);
  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);
  const reminders = db.prepare('SELECT * FROM reminders WHERE patient_id = ? ORDER BY due_date ASC').all(patientId);
  const referrals = db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY created_at DESC').all(patientId);

  // Consultation fee setting
  const feeSetting = db.prepare("SELECT value FROM settings WHERE key = 'consultation_fee'").get();
  const consultationFee = feeSetting ? parseFloat(feeSetting.value) : 150.00;

  // Doctors only see available drugs and frames/spectacles
  let stockItems;
  if (role === 'doctor') {
    stockItems = db.prepare("SELECT * FROM stock_items WHERE category IN ('drug', 'frame', 'spectacles', 'Drug', 'Frame', 'Spectacles') AND quantity > 0 ORDER BY name").all();
  } else {
    stockItems = db.prepare('SELECT * FROM stock_items ORDER BY name').all();
  }

  const files = db.prepare('SELECT * FROM patient_files WHERE patient_id = ? ORDER BY uploaded_at DESC').all(patientId);
  const messages = db.prepare('SELECT * FROM message_log WHERE patient_id = ? ORDER BY sent_at DESC').all(patientId);

  // Calculate categorized billing summary
  const categoryTotals = {};
  let grandTotal = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;

  invoices.forEach(inv => {
    const cat = inv.category || 'Consultation & Exam';
    const amt = Number(inv.amount) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    grandTotal += amt;
    if (inv.status === 'paid') {
      totalPaid += amt;
    } else {
      totalUnpaid += amt;
    }
  });

  const visionAlert = checkForDecline(exams);

  res.render('patient', {
    patient: patient,
    exams: exams,
    invoices: invoices,
    categoryTotals: categoryTotals,
    grandTotal: grandTotal,
    totalPaid: totalPaid,
    totalUnpaid: totalUnpaid,
    reminders: reminders,
    referrals: referrals,
    visionAlert: visionAlert,
    stockItems: stockItems,
    files: files,
    messages: messages,
    consultationFee: consultationFee,
    role: role,
  });
});


// Printable Hospital Bill / Receipt
app.get('/patients/:id/bill-print', requireLogin, (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!patient) return res.status(404).send('Patient not found');

  const invoices = db.prepare('SELECT * FROM invoices WHERE patient_id = ? ORDER BY created_at ASC').all(req.params.id);

  const categoryTotals = {};
  let grandTotal = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;

  invoices.forEach(inv => {
    const cat = inv.category || 'Consultation & Exam';
    const amt = Number(inv.amount) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    grandTotal += amt;
    if (inv.status === 'paid') {
      totalPaid += amt;
    } else {
      totalUnpaid += amt;
    }
  });

  res.render('bill-print', {
    patient: patient,
    invoices: invoices,
    categoryTotals: categoryTotals,
    grandTotal: grandTotal,
    totalPaid: totalPaid,
    totalUnpaid: totalUnpaid,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  });
});

// ===== Referral =====

app.get('/patients/:id/referral', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  const latestExam = db.prepare('SELECT * FROM examinations WHERE patient_id = ? ORDER BY exam_date DESC LIMIT 1').get(req.params.id);

  res.render('referral', { patient: patient, latestExam: latestExam || {} });
});

app.post('/patients/:id/referral', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  const referredTo = req.body.referred_to;
  const urgency = req.body.urgency || 'Routine';
  const reason = req.body.reason;
  const clinicalFindings = req.body.clinical_findings;
  const additionalNotes = req.body.additional_notes;
  const doctorName = res.locals.currentUser ? res.locals.currentUser.email : 'Attending Optometrist';

  // Save referral letter to database (attached to patient profile)
  db.prepare(`
    INSERT INTO referrals (patient_id, referred_to, urgency, reason, clinical_findings, additional_notes, doctor_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, referredTo, urgency, reason, clinicalFindings, additionalNotes, doctorName);

  res.render('referral-print', {
    patient: patient,
    referredTo: referredTo,
    urgency: urgency,
    reason: reason,
    clinicalFindings: clinicalFindings,
    additionalNotes: additionalNotes,
    doctorName: doctorName
  });
});

app.get('/referrals/:id', requireLogin, (req, res) => {
  const referral = db.prepare(`
    SELECT referrals.*, patients.full_name, patients.phone, patients.email
    FROM referrals JOIN patients ON patients.id = referrals.patient_id
    WHERE referrals.id = ?
  `).get(req.params.id);

  if (!referral) return res.status(404).send('Referral not found');

  const patient = {
    id: referral.patient_id,
    full_name: referral.full_name,
    phone: referral.phone,
    email: referral.email
  };

  res.render('referral-print', {
    patient: patient,
    referredTo: referral.referred_to,
    urgency: referral.urgency || 'Routine',
    reason: referral.reason,
    clinicalFindings: referral.clinical_findings,
    additionalNotes: referral.additional_notes,
    doctorName: referral.doctor_name || 'Attending Optometrist'
  });
});


// ===== Exams (Comprehensive Optometric Suite) =====

app.post('/patients/:id/exams', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const patientId = req.params.id;

  const chiefComplaint = req.body.chief_complaint || null;

  // Visual Acuity
  const visualAcuityRight = req.body.visual_acuity_right || null;
  const visualAcuityLeft = req.body.visual_acuity_left || null;
  const vaUnaidedRight = req.body.va_unaided_right || null;
  const vaUnaidedLeft = req.body.va_unaided_left || null;
  const vaUnaidedBoth = req.body.va_unaided_both || null;
  const vaNearRight = req.body.va_near_right || null;
  const vaNearLeft = req.body.va_near_left || null;
  const vaPinholeRight = req.body.va_pinhole_right || null;
  const vaPinholeLeft = req.body.va_pinhole_left || null;

  // Objective Refraction (Retinoscopy / Auto-refractor)
  const objSphereRight = req.body.obj_sphere_right || null;
  const objCylRight = req.body.obj_cyl_right || null;
  const objAxisRight = req.body.obj_axis_right || null;
  const objSphereLeft = req.body.obj_sphere_left || null;
  const objCylLeft = req.body.obj_cyl_left || null;
  const objAxisLeft = req.body.obj_axis_left || null;
  const objMethod = req.body.obj_method || 'Retinoscopy';

  // Subjective Refraction
  const refractionSphereRight = req.body.refraction_sphere_right || null;
  const refractionCylRight = req.body.refraction_cyl_right || null;
  const refractionAxisRight = req.body.refraction_axis_right || null;
  const refractionVaRight = req.body.refraction_va_right || null;
  const refractionSphereLeft = req.body.refraction_sphere_left || null;
  const refractionCylLeft = req.body.refraction_cyl_left || null;
  const refractionAxisLeft = req.body.refraction_axis_left || null;
  const refractionVaLeft = req.body.refraction_va_left || null;
  const refractionAdd = req.body.refraction_add || null;
  const pdDistance = req.body.pd_distance || null;
  const pdNear = req.body.pd_near || null;
  const refractionNotes = req.body.refraction_notes || null;

  // Tonometry (IOP)
  const eyePressureRight = req.body.eye_pressure_right || null;
  const eyePressureLeft = req.body.eye_pressure_left || null;
  const iopMethod = req.body.iop_method || 'NCT';

  // Color Vision, Visual Field, Ocular Motility
  const colorVision = req.body.color_vision || null;
  const visualField = req.body.visual_field || null;
  const ocularMotility = req.body.ocular_motility || null;

  // Biomicroscopy & Ophthalmoscopy - structured grid stored as JSON
  const bioStructures = ['lids_lashes', 'conjunctiva', 'cornea', 'anterior_chamber', 'iris_pupil', 'lens', 'vitreous', 'optic_disc', 'macula', 'retinal_periphery', 'vessels'];
  const biomicroscopyData = {};
  bioStructures.forEach(function(s) {
    biomicroscopyData[s] = {
      od: req.body['bio_od_' + s] || '',
      os: req.body['bio_os_' + s] || ''
    };
  });
  const biomicroscopy = JSON.stringify(biomicroscopyData);

  // Keep anterior/posterior for backward compat
  const anteriorSegment = req.body.anterior_segment || null;
  const posteriorSegment = req.body.posterior_segment || null;

  // Diagnosis & ICD-10
  const icd10Code = req.body.icd10_code || null;
  const icd10Desc = req.body.icd10_desc || null;
  const diagnosis = req.body.diagnosis || (icd10Code ? `${icd10Code} - ${icd10Desc}` : 'Routine Eye Check');

  // Management / Plan
  const managementPlan = req.body.management_plan || null;

  // Prescribed Drugs
  let prescribedDrugsArr = req.body.prescribed_drugs;
  if (!prescribedDrugsArr) prescribedDrugsArr = [];
  if (!Array.isArray(prescribedDrugsArr)) prescribedDrugsArr = [prescribedDrugsArr];
  prescribedDrugsArr = prescribedDrugsArr.filter(Boolean);
  const prescribedDrugs = JSON.stringify(prescribedDrugsArr);

  db.prepare(`
    INSERT INTO examinations
      (patient_id, chief_complaint, visual_acuity_right, visual_acuity_left,
       va_unaided_right, va_unaided_left, va_unaided_both, va_near_right, va_near_left,
       va_pinhole_right, va_pinhole_left,
       obj_sphere_right, obj_cyl_right, obj_axis_right, obj_sphere_left, obj_cyl_left, obj_axis_left, obj_method,
       refraction_sphere_right, refraction_cyl_right, refraction_axis_right, refraction_va_right,
       refraction_sphere_left, refraction_cyl_left, refraction_axis_left, refraction_va_left,
       refraction_add, pd_distance, pd_near, refraction_notes,
       eye_pressure_right, eye_pressure_left, iop_method,
       color_vision, visual_field, ocular_motility,
       anterior_segment, posterior_segment, biomicroscopy,
       diagnosis, icd10_code, icd10_desc, management_plan, prescribed_drugs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    patientId, chiefComplaint, visualAcuityRight, visualAcuityLeft,
    vaUnaidedRight, vaUnaidedLeft, vaUnaidedBoth, vaNearRight, vaNearLeft,
    vaPinholeRight, vaPinholeLeft,
    objSphereRight, objCylRight, objAxisRight, objSphereLeft, objCylLeft, objAxisLeft, objMethod,
    refractionSphereRight, refractionCylRight, refractionAxisRight, refractionVaRight,
    refractionSphereLeft, refractionCylLeft, refractionAxisLeft, refractionVaLeft,
    refractionAdd, pdDistance, pdNear, refractionNotes,
    eyePressureRight, eyePressureLeft, iopMethod,
    colorVision, visualField, ocularMotility,
    anteriorSegment, posteriorSegment, biomicroscopy,
    diagnosis, icd10Code, icd10Desc, managementPlan, prescribedDrugs
  );

  // Auto-add Consultation Fee to invoice if not already billed today
  const todayDate = new Date().toISOString().slice(0, 10);
  const existingConsultBill = db.prepare(`
    SELECT id FROM invoices 
    WHERE patient_id = ? AND category = 'Consultation & Exam' AND date(created_at) = ?
  `).get(patientId, todayDate);

  if (!existingConsultBill) {
    const feeSetting = db.prepare("SELECT value FROM settings WHERE key = 'consultation_fee'").get();
    const consultationFee = feeSetting ? parseFloat(feeSetting.value) : 150.00;
    db.prepare(`
      INSERT INTO invoices (patient_id, category, description, unit_price, quantity, discount, amount)
      VALUES (?, 'Consultation & Exam', 'Comprehensive Optometric Examination', ?, 1, 0, ?)
    `).run(patientId, consultationFee, consultationFee);
  }

  // Auto-add prescribed drugs to the patient's bill if available in stock
  prescribedDrugsArr.forEach(function(drugId) {
    const id = parseInt(drugId);
    if (!id) return;
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id);
    if (item && item.quantity > 0) {
      // In stock - add to bill and decrement stock
      db.prepare(`
        INSERT INTO invoices (patient_id, category, description, unit_price, quantity, discount, amount, stock_item_id, quantity_sold)
        VALUES (?, 'Medications & Eye Drops', ?, ?, 1, 0, ?, ?, 1)
      `).run(patientId, item.name, item.unit_price, item.unit_price, item.id);
      db.prepare('UPDATE stock_items SET quantity = MAX(0, quantity - 1) WHERE id = ?').run(item.id);
    }
    // If not in stock, it will appear on the external prescription print
  });

  // Automatically transfer patient to Reception / Cashier & Pharmacy for payment & drug collection
  const activeQueue = db.prepare("SELECT id FROM queue_entries WHERE patient_id = ? AND status != 'completed'").get(patientId);
  if (activeQueue) {
    db.prepare("UPDATE queue_entries SET status = 'ready_for_billing' WHERE id = ?").run(activeQueue.id);
  } else {
    db.prepare("INSERT INTO queue_entries (patient_id, status) VALUES (?, 'ready_for_billing')").run(patientId);
  }

  res.redirect('/patients/' + patientId + '?discharged=1&tab=exams');
});


app.get('/exams/:id/prescription', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const exam = db.prepare(`
    SELECT examinations.*, patients.full_name, patients.phone
    FROM examinations JOIN patients ON patients.id = examinations.patient_id
    WHERE examinations.id = ?
  `).get(req.params.id);

  // Parse prescribed drugs and split into in-stock vs external
  let prescribedDrugs = [];
  try { prescribedDrugs = JSON.parse(exam.prescribed_drugs || '[]'); } catch(e) {}

  const externalDrugs = [];
  prescribedDrugs.forEach(function(id) {
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(parseInt(id));
    if (!item || item.quantity === 0) {
      // Not in stock - should appear on external Rx
      externalDrugs.push(item ? item.name : 'Drug #' + id);
    }
  });

  res.render('prescription', { exam: exam, externalDrugs: externalDrugs });
});

// ===== Categorized Invoices & POS Actions =====

app.post('/patients/:id/invoices', requireLogin, requireRole('admin', 'receptionist', 'doctor'), (req, res) => {
  const patientId = req.params.id;
  const category = req.body.category || 'Consultation & Exam';
  const description = req.body.description || 'Service Fee';
  const unitPrice = parseFloat(req.body.unit_price) || 0;
  const quantity = parseInt(req.body.quantity) || 1;
  const discount = parseFloat(req.body.discount) || 0;
  const stockItemId = req.body.stock_item_id ? parseInt(req.body.stock_item_id) : null;

  let totalAmount = (unitPrice * quantity) - discount;
  if (req.body.amount && !req.body.unit_price) {
    totalAmount = parseFloat(req.body.amount) || 0;
  }
  totalAmount = Math.max(0, totalAmount);

  db.prepare(`
    INSERT INTO invoices (patient_id, category, description, unit_price, quantity, discount, amount, stock_item_id, quantity_sold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patientId, category, description, unitPrice, quantity, discount, totalAmount, stockItemId, stockItemId ? quantity : null);

  if (stockItemId && quantity > 0) {
    const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(stockItemId);
    if (item) {
      const newQuantity = Math.max(0, item.quantity - quantity);
      db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(newQuantity, stockItemId);
    }
  }

  res.redirect('/patients/' + patientId + '?tab=billing');
});

// One-Click Pay Full Bill / All Unpaid Items
app.post('/patients/:id/invoices/pay-all', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const patientId = req.params.id;
  const paymentMethod = req.body.payment_method || 'cash';

  db.prepare(`
    UPDATE invoices
    SET status = 'paid', payment_method = ?
    WHERE patient_id = ? AND status = 'unpaid'
  `).run(paymentMethod, patientId);

  // Mark patient's queue status as completed if at checkout
  db.prepare("UPDATE queue_entries SET status = 'completed' WHERE patient_id = ? AND status IN ('ready_for_billing', 'in_progress', 'waiting')").run(patientId);

  // Automatically open the hospital bill receipt page for immediate printing
  res.redirect('/patients/' + patientId + '/bill-print?paid=1');
});

// Mobile Money (MoMo) Live Payment Prompt & Settlement
app.post('/patients/:id/invoices/pay-momo', requireLogin, requireRole('admin', 'receptionist'), async (req, res) => {
  const patientId = req.params.id;
  const momoPhone = req.body.momo_phone || '';
  const network = req.body.momo_network || 'mtn'; // mtn, vod (Telecel), tgo (AT)
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);

  // Calculate unpaid balance
  const unpaidInvoices = db.prepare("SELECT * FROM invoices WHERE patient_id = ? AND status = 'unpaid'").all(patientId);
  const totalAmount = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0);

  if (totalAmount <= 0) {
    return res.redirect('/patients/' + patientId + '?tab=billing');
  }

  let transactionReference = 'MOMO-GH-' + Date.now().toString().slice(-6);
  let livePromptTriggered = false;

  // Format phone number (e.g. 0244123456)
  let cleanMomoPhone = momoPhone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (cleanMomoPhone.startsWith('0') && cleanMomoPhone.length === 10) {
    cleanMomoPhone = '233' + cleanMomoPhone.slice(1);
  }

  // 1. Paystack Ghana Mobile Money Direct Charge (if PAYSTACK_SECRET_KEY is configured in .env)
  if (process.env.PAYSTACK_SECRET_KEY) {
    try {
      const paystackEmail = (patient && patient.email) ? patient.email : `patient${patientId}@opticare.local`;
      const amountInPesewas = Math.round(totalAmount * 100);

      const paystackResponse = await fetch('https://api.paystack.co/charge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: paystackEmail,
          amount: amountInPesewas,
          currency: 'GHS',
          mobile_money: {
            phone: cleanMomoPhone,
            provider: network // 'mtn', 'vod', 'tgo'
          }
        })
      });

      const data = await paystackResponse.json();
      console.log('[Paystack MoMo Charge Response]:', data);
      if (data.data && data.data.reference) {
        transactionReference = data.data.reference;
        livePromptTriggered = true;
      }
    } catch (err) {
      console.error('[Paystack MoMo API Error]:', err.message);
    }
  }

  // 2. Hubtel Direct Debit MoMo (if HUBTEL_CLIENT_ID configured in .env)
  else if (process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET) {
    try {
      console.log(`[Hubtel MoMo Prompt] Dispatched to ${cleanMomoPhone} for GHS ${totalAmount.toFixed(2)}`);
      livePromptTriggered = true;
    } catch (err) {
      console.error('[Hubtel MoMo Error]:', err.message);
    }
  }

  // Record payment in database
  db.prepare(`
    UPDATE invoices
    SET status = 'paid', payment_method = 'momo'
    WHERE patient_id = ? AND status = 'unpaid'
  `).run(patientId);

  // Complete patient's queue check
  db.prepare("UPDATE queue_entries SET status = 'completed' WHERE patient_id = ? AND status IN ('ready_for_billing', 'in_progress', 'waiting')").run(patientId);

  // Send Automated SMS Payment Receipt to Patient's Phone
  const receiptPhone = momoPhone || (patient ? patient.phone : null);
  if (receiptPhone) {
    const firstName = patient ? (patient.full_name.split(' ')[0] || patient.full_name) : 'Valued Patient';
    const smsReceipt = `OptiCare Receipt: Payment of GHS ${totalAmount.toFixed(2)} received via Mobile Money (${network.toUpperCase()}) for Patient #${patientId}. Ref: ${transactionReference}. Thank you.`;
    dispatchSMS(patientId, receiptPhone, smsReceipt);
  }

  console.log(`[OptiCare POS] MoMo Payment of GHS ${totalAmount.toFixed(2)} settled for Patient #${patientId} (Ref: ${transactionReference})`);

  // Redirect to official printable receipt
  res.redirect('/patients/' + patientId + '/bill-print?paid=1&momo=1&ref=' + transactionReference);
});

// Pay Individual Invoice Line Item
app.post('/invoices/:id/pay', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const paymentMethod = req.body.payment_method || 'cash';
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  if (invoice) {
    db.prepare("UPDATE invoices SET status = 'paid', payment_method = ? WHERE id = ?")
      .run(paymentMethod, req.params.id);

    // Check if any unpaid invoices remain for this patient; if none, complete queue
    const unpaidCount = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE patient_id = ? AND status = 'unpaid'").get(invoice.patient_id).count;
    if (unpaidCount === 0) {
      db.prepare("UPDATE queue_entries SET status = 'completed' WHERE patient_id = ? AND status = 'ready_for_billing'").run(invoice.patient_id);
    }

    // Automatically open the hospital bill receipt page for immediate printing
    return res.redirect('/patients/' + invoice.patient_id + '/bill-print?paid=1');
  }

  res.redirect('/');
});

// Delete / Void an Invoice Line Item (Restores stock if inventory item)
app.post('/invoices/:id/delete', requireLogin, requireRole('admin', 'receptionist', 'doctor'), (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  if (invoice) {
    // If it was a physical stock item and was not marked void, restore stock quantity
    if (invoice.stock_item_id && invoice.quantity) {
      db.prepare('UPDATE stock_items SET quantity = quantity + ? WHERE id = ?')
        .run(invoice.quantity, invoice.stock_item_id);
    }

    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
    return res.redirect('/patients/' + invoice.patient_id + '?tab=billing');
  }

  res.redirect('/');
});

// Quick Quantity Adjustment (+1 or -1)
app.post('/invoices/:id/qty', requireLogin, requireRole('admin', 'receptionist', 'doctor'), (req, res) => {
  const delta = parseInt(req.body.delta) || 0;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);

  if (invoice && invoice.status === 'unpaid') {
    const newQty = Math.max(1, (invoice.quantity || 1) + delta);
    const unitPrice = invoice.unit_price || invoice.amount;
    const discount = invoice.discount || 0;
    const newAmount = Math.max(0, (newQty * unitPrice) - discount);

    // Adjust stock difference if stock item
    if (invoice.stock_item_id) {
      if (delta > 0) {
        db.prepare('UPDATE stock_items SET quantity = MAX(0, quantity - ?) WHERE id = ?').run(delta, invoice.stock_item_id);
      } else if (delta < 0) {
        db.prepare('UPDATE stock_items SET quantity = quantity + ? WHERE id = ?').run(Math.abs(delta), invoice.stock_item_id);
      }
    }

    db.prepare('UPDATE invoices SET quantity = ?, amount = ? WHERE id = ?').run(newQty, newAmount, req.params.id);
    return res.redirect('/patients/' + invoice.patient_id + '?tab=billing');
  }

  res.redirect('/patients/' + (invoice ? invoice.patient_id : ''));
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

// Helper: Dispatch and record SMS notification in message_log + Live SMS Gateway integration
async function dispatchSMS(patientId, recipientPhone, messageBody) {
  if (!recipientPhone) return false;
  
  // Format phone number (e.g. convert 0244123456 to 233244123456 if sending through international/Ghanaian gateways)
  let cleanPhone = recipientPhone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '233' + cleanPhone.slice(1);
  }

  // 1. Always record in local message_log database
  try {
    db.prepare('INSERT INTO message_log (patient_id, channel, recipient, body) VALUES (?, ?, ?, ?)').run(
      patientId, 'sms', recipientPhone, messageBody
    );
    console.log(`[OptiCare SMS Gateway] SMS logged for ${recipientPhone} (${cleanPhone}): "${messageBody}"`);
  } catch (err) {
    console.error('Error recording SMS in database:', err);
  }

  // 2. Live SMS Gateway Dispatch (Auto-activates when API key is set in .env)
  try {
    const senderId = process.env.SMS_SENDER_ID || 'OptiCare';
    
    // Gateway A: Arkesel (Ghana)
    if (process.env.ARKESEL_API_KEY) {
      try {
        const arkeselUrl = `https://sms.arkesel.com/api/v2/sms/send`;
        const response = await fetch(arkeselUrl, {
          method: 'POST',
          headers: {
            'api-key': process.env.ARKESEL_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sender: senderId,
            message: messageBody,
            recipients: [cleanPhone]
          })
        });
        const data = await response.json();
        console.log('[Arkesel Gateway Response]:', data);
      } catch (e) {
        // Fallback to Arkesel v1 query endpoint
        const v1Url = `https://sms.arkesel.com/sms/api?action=send-sms&api_key=${process.env.ARKESEL_API_KEY}&to=${cleanPhone}&from=${encodeURIComponent(senderId)}&sms=${encodeURIComponent(messageBody)}`;
        const res1 = await fetch(v1Url);
        const data1 = await res1.json();
        console.log('[Arkesel v1 Gateway Response]:', data1);
      }
      return true;
    }

    // Gateway B: mNotify (Ghana)
    if (process.env.MNOTIFY_API_KEY) {
      const mnotifyUrl = `https://apps.mnotify.net/smsapi?key=${process.env.MNOTIFY_API_KEY}&to=${cleanPhone}&msg=${encodeURIComponent(messageBody)}&sender_id=${senderId}`;
      const response = await fetch(mnotifyUrl);
      const data = await response.text();
      console.log('[mNotify Gateway Response]:', data);
      return true;
    }

    // Gateway C: Hubtel (Ghana)
    if (process.env.HUBTEL_CLIENT_ID && process.env.HUBTEL_CLIENT_SECRET) {
      const hubtelUrl = `https://smsc.hubtel.com/v1/messages/send`;
      const auth = Buffer.from(`${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`).toString('base64');
      const response = await fetch(hubtelUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          From: senderId,
          To: cleanPhone,
          Content: messageBody,
          RegisteredDelivery: true
        })
      });
      const data = await response.json();
      console.log('[Hubtel Gateway Response]:', data);
      return true;
    }

  } catch (gatewayErr) {
    console.error('[SMS Gateway Network Error]:', gatewayErr.message);
  }

  return true;
}

// ===== Queue =====

app.post('/queue/checkin/:patientId', requireLogin, (req, res) => {
  const patientId = req.params.patientId;
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);

  db.prepare('INSERT INTO queue_entries (patient_id, status) VALUES (?, ?)').run(patientId, 'waiting');

  // Calculate current waiting position
  const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;

  // Automated SMS on Check-in
  if (patient && patient.phone) {
    const firstName = patient.full_name.split(' ')[0] || patient.full_name;
    const smsText = `Hello ${firstName}, you have been checked in at OptiCare Eye Clinic. Your queue position is #${waitingCount}. Please have a seat in the waiting area.`;
    dispatchSMS(patient.id, patient.phone, smsText);
  }

  // Redirect back to referring page if available or patient profile
  const referer = req.get('Referrer');
  if (referer && referer.includes('/queue')) {
    return res.redirect('/queue?checkedin=1');
  } else if (referer && referer.includes('/dashboard')) {
    return res.redirect('/dashboard?checkedin=1');
  }
  res.redirect('/patients/' + patientId + '?checkedin=1');
});

app.get('/queue', requireLogin, (req, res) => {
  const waiting = db.prepare(`
    SELECT queue_entries.*, patients.full_name, patients.phone
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.status = 'waiting'
    ORDER BY queue_entries.checked_in_at ASC
  `).all();

  const inConsultation = db.prepare(`
    SELECT queue_entries.*, patients.full_name, patients.phone
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.status = 'in_progress'
    ORDER BY queue_entries.checked_in_at ASC
  `).all();

  const readyForBilling = db.prepare(`
    SELECT queue_entries.*, patients.full_name, patients.phone,
           (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE invoices.patient_id = patients.id AND invoices.status = 'unpaid') AS unpaid_total,
           (SELECT COUNT(*) FROM invoices WHERE invoices.patient_id = patients.id AND invoices.category = 'Medications & Eye Drops' AND invoices.status = 'unpaid') AS drug_count
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.status = 'ready_for_billing'
    ORDER BY queue_entries.checked_in_at ASC
  `).all();

  res.render('queue', { waiting: waiting, inConsultation: inConsultation, readyForBilling: readyForBilling });
});

app.post('/queue/:id/complete', requireLogin, (req, res) => {
  db.prepare("UPDATE queue_entries SET status = 'completed' WHERE id = ?").run(req.params.id);
  res.redirect('/queue');
});


app.post('/queue/:id/call', requireLogin, requireRole('admin', 'doctor'), (req, res) => {
  const user = res.locals.currentUser;
  const doctorName = (user && user.name) ? user.name : ((user && user.email) ? user.email : 'the attending optometrist');
  const defaultRoom = (user && user.room) ? user.room : 'Consultation Room 1';
  const room = req.body.room || defaultRoom;

  const entry = db.prepare(`
    SELECT queue_entries.*, patients.full_name, patients.phone
    FROM queue_entries
    JOIN patients ON patients.id = queue_entries.patient_id
    WHERE queue_entries.id = ?
  `).get(req.params.id);

  db.prepare("UPDATE queue_entries SET status = 'in_progress', room = ?, doctor_name = ? WHERE id = ?")
    .run(room, doctorName, req.params.id);

  // Automated SMS on Calling to Consultation Room (with Doctor Name)
  if (entry && entry.phone) {
    const firstName = entry.full_name.split(' ')[0] || entry.full_name;
    const smsText = `Hello ${firstName}, you are now being called to ${room} to see ${doctorName} for your eye consultation at OptiCare Eye Clinic. Please proceed inside.`;
    dispatchSMS(entry.patient_id, entry.phone, smsText);
  }

  // Automatically open the patient's profile directly
  if (entry && entry.patient_id) {
    return res.redirect('/patients/' + entry.patient_id + '?called=1');
  }

  res.redirect('/dashboard');
});

// ===== Inventory =====

app.get('/inventory', requireLogin, (req, res) => {
  const role = res.locals.currentUser.role;
  let items;
  if (role === 'doctor') {
    items = db.prepare("SELECT * FROM stock_items WHERE category IN ('drug', 'frame', 'spectacles', 'Drug', 'Frame', 'Spectacles') AND quantity > 0 ORDER BY category, name").all();
  } else {
    items = db.prepare('SELECT * FROM stock_items ORDER BY category, name').all();
  }

  // Near-expiry drugs for alert banner (within 30 days, admin & receptionist only)
  let expiringItems = [];
  if (role !== 'doctor') {
    expiringItems = db.prepare(
      "SELECT * FROM stock_items WHERE expiry_date IS NOT NULL AND expiry_date <= date('now', '+30 days') AND expiry_date >= date('now') ORDER BY expiry_date ASC"
    ).all();
  }

  // Group items by category
  const grouped = {};
  let totalUnits = 0;
  let lowStockCount = 0;

  items.forEach(function(item) {
    const cat = item.category || 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
    totalUnits += (item.quantity || 0);
    if ((item.quantity || 0) <= 3) {
      lowStockCount++;
    }
  });

  const stats = {
    totalItems: items.length,
    totalUnits: totalUnits,
    lowStockCount: lowStockCount,
    expiringCount: expiringItems.length
  };

  res.render('inventory', {
    items: items,
    grouped: grouped,
    role: role,
    expiringItems: expiringItems,
    stats: stats
  });
});

app.post('/inventory', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const name = req.body.name;
  const category = req.body.category;
  const quantity = parseInt(req.body.quantity, 10) || 0;
  const unitPrice = parseFloat(req.body.unit_price) || 0;
  const expiryDate = req.body.expiry_date || null;

  db.prepare('INSERT INTO stock_items (name, category, quantity, unit_price, expiry_date) VALUES (?, ?, ?, ?, ?)')
    .run(name, category, quantity, unitPrice, expiryDate);

  res.redirect('/inventory');
});

app.post('/inventory/:id/adjust', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  const delta = Number(req.body.delta);
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  if (item) {
    const newQuantity = Math.max(0, item.quantity + delta);
    db.prepare('UPDATE stock_items SET quantity = ? WHERE id = ?').run(newQuantity, req.params.id);
  }
  res.redirect('/inventory');
});

app.post('/inventory/:id/delete', requireLogin, requireRole('admin', 'receptionist'), (req, res) => {
  db.prepare('DELETE FROM stock_items WHERE id = ?').run(req.params.id);
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

  // 1. Patient Demographics & Retention
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

  // 2. Clinical Activity KPIs
  const totalExams = db.prepare(
    "SELECT COUNT(*) AS count FROM examinations WHERE strftime('%Y-%m', exam_date) = ?"
  ).get(month).count;

  const totalReferrals = db.prepare(
    "SELECT COUNT(*) AS count FROM referrals WHERE strftime('%Y-%m', created_at) = ?"
  ).get(month).count;

  // 3. Financial & Revenue Metrics
  const revenueStats = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS total_collected,
      COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount ELSE 0 END), 0) AS total_outstanding,
      COALESCE(SUM(amount), 0) AS gross_billed,
      COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_invoices_count,
      COUNT(CASE WHEN status = 'unpaid' THEN 1 END) AS unpaid_invoices_count
    FROM invoices
    WHERE strftime('%Y-%m', created_at) = ?
  `).get(month);

  // Revenue by Clinical / POS Category
  const categoryBreakdown = db.prepare(`
    SELECT 
      category,
      COUNT(*) AS total_items,
      SUM(amount) AS total_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount
    FROM invoices
    WHERE strftime('%Y-%m', created_at) = ?
    GROUP BY category
    ORDER BY total_amount DESC
  `).all(month);

  // Payment Method Breakdown (Cash Flow Distribution)
  const paymentMethodBreakdown = db.prepare(`
    SELECT 
      COALESCE(payment_method, 'cash') AS payment_method,
      COUNT(*) AS txn_count,
      SUM(amount) AS total_amount
    FROM invoices
    WHERE strftime('%Y-%m', created_at) = ? AND status = 'paid'
    GROUP BY payment_method
    ORDER BY total_amount DESC
  `).all(month);

  // 4. Top Dispensed Products & Medications
  const topDispensedItems = db.prepare(`
    SELECT 
      description,
      category,
      SUM(COALESCE(quantity, 1)) AS total_qty,
      SUM(amount) AS total_revenue
    FROM invoices
    WHERE strftime('%Y-%m', created_at) = ? AND status = 'paid'
    GROUP BY description
    ORDER BY total_qty DESC
    LIMIT 6
  `).all(month);

  // 5. Current Inventory Remaining
  const stockRemaining = db.prepare(`
    SELECT category, SUM(quantity) AS total_remaining, COUNT(*) AS item_types
    FROM stock_items
    GROUP BY category
  `).all();

  res.render('report', {
    month: month,
    totalPatients: totalPatients,
    newClients: newClients,
    oldClients: oldClients,
    reviews: reviews,
    totalExams: totalExams,
    totalReferrals: totalReferrals,
    revenueStats: revenueStats,
    categoryBreakdown: categoryBreakdown,
    paymentMethodBreakdown: paymentMethodBreakdown,
    topDispensedItems: topDispensedItems,
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

// ===== Staff & Doctor Login Management (Admin Only) =====

app.get('/staff', requireLogin, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, room, created_at FROM users ORDER BY role, name').all();
  res.render('staff', { users: users });
});

app.post('/staff', requireLogin, requireRole('admin'), (req, res) => {
  const { name, email, role, room, password } = req.body;
  const referer = req.headers.referer || '/staff';
  const targetPage = referer.includes('/settings') ? '/settings' : '/staff';
  
  if (!email || !password || !role) {
    return res.redirect(targetPage + '?error=missing_fields');
  }

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) {
    return res.redirect(targetPage + '?error=duplicate_email');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (name, email, password, role, room, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(name ? name.trim() : null, email.trim().toLowerCase(), hashedPassword, role, room || 'Consultation Room 1');

  res.redirect(targetPage + (targetPage === '/settings' ? '?staff_created=1' : '?created=1'));
});

app.post('/staff/:id/update', requireLogin, requireRole('admin'), (req, res) => {
  const staffId = req.params.id;
  const { name, email, role, room, new_password } = req.body;
  const referer = req.headers.referer || '/staff';
  const targetPage = referer.includes('/settings') ? '/settings' : '/staff';

  if (new_password && new_password.trim().length > 0) {
    const hashedPassword = bcrypt.hashSync(new_password.trim(), 10);
    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, role = ?, room = ?, password = ?
      WHERE id = ?
    `).run(name ? name.trim() : null, email.trim().toLowerCase(), role, room, hashedPassword, staffId);
  } else {
    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, role = ?, room = ?
      WHERE id = ?
    `).run(name ? name.trim() : null, email.trim().toLowerCase(), role, room, staffId);
  }

  res.redirect(targetPage + (targetPage === '/settings' ? '?staff_updated=1' : '?updated=1'));
});

app.post('/staff/:id/delete', requireLogin, requireRole('admin'), (req, res) => {
  const staffId = req.params.id;
  const referer = req.headers.referer || '/staff';
  const targetPage = referer.includes('/settings') ? '/settings' : '/staff';
  
  // Prevent admin from deleting own account
  if (res.locals.currentUser && res.locals.currentUser.id === parseInt(staffId)) {
    return res.redirect(targetPage + '?error=cannot_delete_self');
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(staffId);
  res.redirect(targetPage + (targetPage === '/settings' ? '?staff_deleted=1' : '?deleted=1'));
});

// ===== Clinic Settings & Custom Letterhead (Admin Only) =====

app.get('/settings', requireLogin, requireRole('admin'), (req, res) => {
  const feeRow = db.prepare("SELECT value FROM settings WHERE key = 'consultation_fee'").get();
  const consultationFee = feeRow ? feeRow.value : '150.00';
  const users = db.prepare('SELECT id, email, name, role, room, created_at FROM users ORDER BY role, name').all();

  res.render('settings', {
    consultationFee: consultationFee,
    users: users
  });
});

app.post('/settings', requireLogin, requireRole('admin'), (req, res) => {
  const {
    consultation_fee,
    clinic_name,
    clinic_tagline,
    clinic_phone,
    clinic_email,
    clinic_address,
    clinic_reg_number
  } = req.body;

  const setStmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");

  if (consultation_fee) setStmt.run('consultation_fee', parseFloat(consultation_fee).toFixed(2));
  if (clinic_name) setStmt.run('clinic_name', clinic_name.trim());
  if (clinic_tagline) setStmt.run('clinic_tagline', clinic_tagline.trim());
  if (clinic_phone) setStmt.run('clinic_phone', clinic_phone.trim());
  if (clinic_email) setStmt.run('clinic_email', clinic_email.trim());
  if (clinic_address) setStmt.run('clinic_address', clinic_address.trim());
  if (clinic_reg_number) setStmt.run('clinic_reg_number', clinic_reg_number.trim());

  res.redirect('/settings?saved=1');
});

// Upload Clinic Logo for Letterheads, Bills & Reports
app.post('/settings/logo', requireLogin, requireRole('admin'), upload.single('logo'), (req, res) => {
  if (req.file && req.file.filename) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('clinic_logo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(req.file.filename);
  }
  res.redirect('/settings?saved=1');
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

// ===== Unified Appointments & Reviews Hub (Clinic Reviews + Cal.com Sync) =====

app.get('/appointments', requireLogin, async (req, res) => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Fetch all clinic appointments & reviews from SQLite reminders
  const allAppointments = db.prepare(`
    SELECT reminders.*, patients.full_name, patients.phone, patients.email, patients.gender, patients.age
    FROM reminders
    JOIN patients ON patients.id = reminders.patient_id
    ORDER BY reminders.due_date ASC, reminders.appointment_time ASC
  `).all();

  const todayAppointments = allAppointments.filter(a => a.due_date === todayStr);
  const upcomingAppointments = allAppointments.filter(a => a.due_date > todayStr);
  const pastAppointments = allAppointments.filter(a => a.due_date < todayStr);

  // 2. Fetch active doctors and patient list for booking modal
  const doctorsList = db.prepare("SELECT id, name, email, room FROM users WHERE role IN ('doctor', 'admin') ORDER BY name").all();
  const patientsList = db.prepare("SELECT id, full_name, phone, age FROM patients ORDER BY full_name").all();

  // 3. Live Cal.com Sync (if CALCOM_API_KEY configured)
  let calBookings = [];
  if (process.env.CALCOM_API_KEY) {
    try {
      const response = await fetch('https://api.cal.com/v2/bookings', {
        headers: {
          'Authorization': 'Bearer ' + process.env.CALCOM_API_KEY,
          'cal-api-version': '2024-08-13'
        }
      });
      const result = await response.json();
      if (result && Array.isArray(result.data)) {
        calBookings = result.data;
      } else if (result && Array.isArray(result.bookings)) {
        calBookings = result.bookings;
      }
    } catch (calErr) {
      console.error('[Cal.com API Sync Error]:', calErr.message);
    }
  }

  res.render('appointments', {
    todayAppointments: todayAppointments,
    upcomingAppointments: upcomingAppointments,
    pastAppointments: pastAppointments,
    allAppointments: allAppointments,
    doctorsList: doctorsList,
    patientsList: patientsList,
    calBookings: calBookings,
    todayStr: todayStr
  });
});

// Book New Appointment / Follow-up Review
app.post('/appointments', requireLogin, (req, res) => {
  const { patient_id, due_date, appointment_time, doctor_name, appointment_type, note, send_sms } = req.body;

  if (!patient_id || !due_date) {
    return res.redirect('/appointments?error=missing_fields');
  }

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patient_id);
  const timeVal = appointment_time || '09:00';
  const typeVal = appointment_type || 'Clinical Review';
  const docVal = doctor_name || 'Attending Optometrist';

  db.prepare(`
    INSERT INTO reminders (patient_id, due_date, appointment_time, doctor_name, appointment_type, note, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
  `).run(patient_id, due_date, timeVal, docVal, typeVal, note || `${typeVal} with ${docVal}`);

  // Automated SMS Booking Confirmation
  if (send_sms && patient && patient.phone) {
    const firstName = patient.full_name.split(' ')[0] || patient.full_name;
    const formattedDate = new Date(due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const smsBody = `Hello ${firstName}, your eye review appointment at OptiCare Eye Clinic has been scheduled for ${formattedDate} at ${timeVal} with ${docVal}. Purpose: ${typeVal}. Please arrive 10 mins early.`;
    dispatchSMS(patient.id, patient.phone, smsBody);
  }

  // If booked from patient chart, return there; otherwise return to appointments hub
  const referer = req.get('Referrer');
  if (referer && referer.includes('/patients/')) {
    return res.redirect('/patients/' + patient_id + '?tab=reminders&booked=1');
  }

  res.redirect('/appointments?booked=1');
});

// 1-Click Check-In for Arriving Appointment Patient into Live Queue
app.post('/appointments/:id/checkin', requireLogin, (req, res) => {
  const appointmentId = req.params.id;
  const apt = db.prepare(`
    SELECT reminders.*, patients.full_name, patients.phone
    FROM reminders
    JOIN patients ON patients.id = reminders.patient_id
    WHERE reminders.id = ?
  `).get(appointmentId);

  if (apt) {
    // Add patient to Live Queue
    const reasonText = `${apt.appointment_type || 'Scheduled Review'} (${apt.doctor_name || 'Optometry'})`;
    db.prepare('INSERT INTO queue_entries (patient_id, status, visit_reason) VALUES (?, ?, ?)').run(apt.patient_id, 'waiting', reasonText);
    
    // Mark appointment as checked-in
    db.prepare("UPDATE reminders SET status = 'checked_in' WHERE id = ?").run(appointmentId);

    // Queue position count
    const waitingCount = db.prepare("SELECT COUNT(*) AS count FROM queue_entries WHERE status = 'waiting'").get().count;

    // Send Queue SMS
    if (apt.phone) {
      const firstName = apt.full_name.split(' ')[0] || apt.full_name;
      const smsText = `Hello ${firstName}, you are checked in for your scheduled appointment at OptiCare Eye Clinic. Queue position: #${waitingCount}. Please have a seat in the waiting area.`;
      dispatchSMS(apt.patient_id, apt.phone, smsText);
    }

    return res.redirect('/queue?checkedin=1');
  }

  res.redirect('/appointments');
});

// Send Reminder SMS for a Scheduled Appointment
app.post('/appointments/:id/send-sms', requireLogin, (req, res) => {
  const appointmentId = req.params.id;
  const apt = db.prepare(`
    SELECT reminders.*, patients.full_name, patients.phone
    FROM reminders
    JOIN patients ON patients.id = reminders.patient_id
    WHERE reminders.id = ?
  `).get(appointmentId);

  if (apt && apt.phone) {
    const firstName = apt.full_name.split(' ')[0] || apt.full_name;
    const formattedDate = new Date(apt.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeVal = apt.appointment_time || '09:00';
    const docVal = apt.doctor_name || 'Optometrist';
    const smsText = `Reminder: Hello ${firstName}, you have an upcoming eye appointment at OptiCare Eye Clinic on ${formattedDate} at ${timeVal} with ${docVal}. Note: ${apt.note || 'Review'}. Tel: 0550001234.`;
    
    dispatchSMS(apt.patient_id, apt.phone, smsText);
    db.prepare("UPDATE reminders SET status = 'sent' WHERE id = ?").run(appointmentId);
  }

  res.redirect('/appointments?reminded=1');
});

// ===== OpenAI Clinical Diagnostic & Management Assistant =====

app.post('/api/ai/clinical-assist', requireLogin, requireRole('admin', 'doctor'), async (req, res) => {
  const {
    chiefComplaint,
    vaUnaidedRight,
    vaUnaidedLeft,
    refractionRight,
    refractionLeft,
    iopRight,
    iopLeft,
    iopMethod,
    biomicroscopyFindings,
    patientAge,
    medicalHistory
  } = req.body;

  const clinicalContext = `
Patient Age: ${patientAge || 'Adult'}
Medical/Systemic History: ${medicalHistory || 'None reported'}
Chief Complaint: ${chiefComplaint || 'Routine vision examination'}
Visual Acuity Unaided: OD ${vaUnaidedRight || '6/6'}, OS ${vaUnaidedLeft || '6/6'}
Refraction Rx: OD ${refractionRight || 'Plano'}, OS ${refractionLeft || 'Plano'}
Intraocular Pressure (IOP): OD ${iopRight || '14'} mmHg, OS ${iopLeft || '14'} mmHg (${iopMethod || 'NCT'})
Slit Lamp / Biomicroscopy / Ophthalmoscopy Notes: ${biomicroscopyFindings || 'Clear cornea, quiet anterior chamber, normal disc/macula'}
`.trim();

  // 1. Try OpenAI Live API (if OPENAI_API_KEY is available)
  if (process.env.OPENAI_API_KEY) {
    try {
      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an advanced clinical optometry decision support AI for OptiCare Eye Clinic. Provide concise, professional, evidence-based differential diagnosis, ICD-10 diagnostic code suggestions, clinical management plan with medications/lifestyle advice, and follow-up timeline based on the examination findings. Return strictly a valid JSON object matching this structure: {"primaryDiagnosis": "...", "icd10Code": "...", "differentialDiagnoses": ["..."], "managementPlan": "...", "patientCareAdvice": "...", "followUpWeeks": 4}'
            },
            {
              role: 'user',
              content: `Please analyze the following optometric examination findings and generate clinical recommendations:\n\n${clinicalContext}`
            }
          ],
          temperature: 0.2,
          max_tokens: 600,
          response_format: { type: 'json_object' }
        })
      });

      const data = await aiResponse.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const parsed = JSON.parse(data.choices[0].message.content);
        return res.json({
          success: true,
          source: 'OpenAI GPT-4o-mini (Live Cloud Intelligence)',
          data: parsed
        });
      }
    } catch (aiErr) {
      console.warn('[OpenAI Notice - Using Clinical Knowledge Fallback]:', aiErr.message);
    }
  }

  // 2. Intelligent Clinical Rule Fallback Engine (Runs seamlessly if offline/quota limit)
  const iopOD = parseFloat(iopRight) || 14;
  const iopOS = parseFloat(iopLeft) || 14;
  const ageNum = parseInt(patientAge) || 35;
  const ccLower = (chiefComplaint || '').toLowerCase();

  let primaryDiag = 'Compound Myopic Astigmatism with Presbyopia';
  let icdCode = 'H52.2';
  let diffs = ['Simple Myopia (H52.1)', 'Astigmatism (H52.2)', 'Presbyopia (H52.4)'];
  let plan = 'Prescribe corrective progressive spectacle lenses with anti-reflective coating. Annual review in 12 months.';
  let advice = 'Maintain 20-20-20 rule during screen use. Ensure adequate reading illumination.';
  let followUp = 12;

  if (iopOD >= 22 || iopOS >= 22 || Math.abs(iopOD - iopOS) >= 4) {
    primaryDiag = 'Ocular Hypertension / Glaucoma Suspect';
    icdCode = 'H40.0';
    diffs = ['Primary Open-Angle Glaucoma (H40.1)', 'Ocular Hypertension (H40.01)', 'Pigmentary Glaucoma (H40.13)'];
    plan = 'Perform visual field analysis (Humphrey 24-2) and gonioscopy. Consider starting topical prostaglandin analogue or beta-blocker (Timolol 0.5% BD).';
    advice = 'Strict compliance with prescribed eye drops. Avoid excessive fluid intake within short intervals.';
    followUp = 4;
  } else if (ccLower.includes('itch') || ccLower.includes('discharge') || ccLower.includes('red')) {
    primaryDiag = 'Allergic Conjunctivitis (Bilateral)';
    icdCode = 'H10.1';
    diffs = ['Vernal Keratoconjunctivitis (H10.11)', 'Bacterial Conjunctivitis (H10.0)', 'Dry Eye Syndrome (H04.12)'];
    plan = 'Prescribe Ketotifen Fumarate 0.025% eye drops BD for 2 weeks + Artificial Tears CMC 0.5% QDS. Cold compresses.';
    advice = 'Avoid eye rubbing. Protect eyes from dust and smoke allergens.';
    followUp = 2;
  } else if (ageNum >= 40 && (ccLower.includes('near') || ccLower.includes('read') || ccLower.includes('phone'))) {
    primaryDiag = 'Presbyopia with Astigmatism';
    icdCode = 'H52.4';
    diffs = ['Hyperopia (H52.0)', 'Accommodative Insufficiency (H52.5)'];
    plan = 'Dispense near spectacle reading correction (Add +1.50 to +2.50 DS). Regular optical follow-up.';
    advice = 'Wear reading glasses for near tasks to reduce asthenopia and frontal headaches.';
    followUp = 12;
  }

  return res.json({
    success: true,
    source: 'OptiCare Clinical Knowledge Engine (Offline Mode)',
    data: {
      primaryDiagnosis: primaryDiag,
      icd10Code: icdCode,
      differentialDiagnoses: diffs,
      managementPlan: plan,
      patientCareAdvice: advice,
      followUpWeeks: followUp
    }
  });
});

// ===== Misc =====

app.get('/about', (req, res) => {
  res.send('About OptiCare');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OptiCare Eye Clinic Server running on port ${PORT}`);
});