const db = require('./db');
const bcrypt = require('bcryptjs');

console.log('Seeding OptiCare Eye Clinic (Ghanaian demo data)...');

// 1. WIPE OLD DATA
['referrals','reminders','queue_entries','invoices','patient_files','examinations','message_log','patients','stock_items'].forEach(t => db.exec('DELETE FROM ' + t));
try {
  db.exec('UPDATE sqlite_sequence SET seq = 0 WHERE name IN ("patients","examinations","invoices","queue_entries","reminders","referrals","patient_files","message_log","stock_items")');
} catch(e) {}
console.log('Cleared database tables.');

// 2. SEED DEFAULT USERS (Admin, Doctor, Receptionist)
const userExists = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
if (userExists === 0) {
  const hash = bcrypt.hashSync('password123', 10);
  const insUser = db.prepare('INSERT INTO users (name, email, password, role, room) VALUES (?, ?, ?, ?, ?)');
  insUser.run('Dr. Kwesi Asante Boateng, OD', 'doctor@opticare.local', hash, 'doctor', 'Consultation Room 1');
  insUser.run('Dr. Efua Serwaa Mensah, OD', 'dr.mensah@opticare.local', hash, 'doctor', 'Consultation Room 2');
  insUser.run('Adwoa Poku (Reception Desk)', 'receptionist@opticare.local', hash, 'receptionist', 'Reception / Cashier Desk');
  insUser.run('System Administrator', 'admin@opticare.local', hash, 'admin', 'Administration Office');
  console.log('Created default multi-doctor staff accounts (password: password123)');
}

// 3. SEED INVENTORY & PHARMACEUTICAL STOCK
const is = db.prepare('INSERT INTO stock_items(name,category,quantity,unit_price,expiry_date) VALUES(?,?,?,?,?)');
[
  ['Chloramphenicol Eye Drops 0.5%', 'drug', 42, 18.00, '2026-11-30'],
  ['Ciprofloxacin Eye Drops 0.3%', 'drug', 28, 22.50, '2026-09-15'],
  ['Tobramycin Eye Drops 0.3%', 'drug', 15, 26.00, '2027-02-28'],
  ['Dexamethasone Eye Drops 0.1%', 'drug', 20, 24.00, '2027-01-31'],
  ['Artificial Tears CMC 0.5%', 'drug', 60, 14.50, '2027-06-30'],
  ['Timolol Maleate 0.5% Eye Drops', 'drug', 18, 32.00, '2026-12-31'],
  ['Latanoprost 0.005% Eye Drops', 'drug', 10, 55.00, '2026-10-31'],
  ['Atropine Sulfate 1% Eye Drops', 'drug', 12, 19.00, '2027-03-31'],
  ['Tropicamide 1% Eye Drops', 'drug', 8, 21.00, '2027-01-15'],
  ['Prednisolone Acetate 1% Eye Drops', 'drug', 14, 29.00, '2026-11-15'],
  ['Maxitrol Eye Drops', 'drug', 9, 38.00, '2026-09-30'],
  ['Ketotifen Fumarate Eye Drops', 'drug', 25, 16.00, '2027-05-31'],
  ['Titanium Alloy Frame Full Rim', 'frame', 12, 380.00, null],
  ['Acetate Frame Tortoiseshell', 'frame', 8, 220.00, null],
  ['Rimless Titanium Frame', 'frame', 6, 460.00, null],
  ['Plastic Zyl Frame Black', 'frame', 20, 140.00, null],
  ['Kids Flex Frame Blue', 'frame', 10, 180.00, null],
  ['Contact Lens Solution 240ml', 'lens_solution', 30, 42.00, '2027-08-31'],
  ['Microfibre Cleaning Cloth', 'glasses_case', 50, 5.00, null],
  ['Hard Protective Eyewear Case', 'glasses_case', 35, 15.00, null],
].forEach(r => is.run(...r));
console.log('Stock items: 20 seeded.');

// 4. SEED 30 REALISTIC GHANAIAN PATIENTS
const ip = db.prepare('INSERT INTO patients(full_name,phone,email,gender,age,occupation,medical_history,allergies,emergency_contact_name,emergency_contact_phone,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
[
  ['Abena Serwaa Asante', '0244801234', 'abena.asante@gmail.com', 'Female', 34, 'Seamstress', 'Hypertension (on Amlodipine 5mg)', 'Penicillin', 'Kofi Asante (Husband)', '0244801235', '2026-01-08 09:15:00'],
  ['Kwame Boateng Mensah', '0207654321', 'k.mensah@yahoo.com', 'Male', 52, 'Commercial Truck Driver', 'Type 2 Diabetes Mellitus, Hypertension', 'Sulfonamides', 'Akua Mensah (Wife)', '0207654322', '2026-01-14 10:30:00'],
  ['Efua Amoah Darko', '0231122334', 'efua.darko@outlook.com', 'Female', 27, 'Graphic Designer (8+ hrs screen)', 'No significant medical history', 'None known', 'Yaw Darko (Brother)', '0231122335', '2026-01-22 11:00:00'],
  ['Yaw Ofori Amponsah', '0501234567', null, 'Male', 61, 'Retired Civil Servant', 'Primary Open-Angle Glaucoma, Type 2 Diabetes', 'None known', 'Adwoa Amponsah (Wife)', '0501234568', '2026-01-29 08:45:00'],
  ['Ama Owusu Frimpong', '0268901234', 'ama.frimpong@gmail.com', 'Female', 19, 'SHS Student', 'No significant medical history', 'None known', 'Emmanuel Frimpong (Father)', '0268901200', '2026-02-05 13:20:00'],
  ['Kofi Asare Bediako', '0244123890', 'kofi.bediako@outlook.com', 'Male', 45, 'Secondary School Teacher', 'Hypertension (controlled)', 'Aspirin', 'Adwoa Bediako (Wife)', '0244123891', '2026-02-11 09:00:00'],
  ['Akosua Boadu Gyamfi', '0209876543', null, 'Female', 73, 'Retired Nurse', 'Cataract (bilateral), Hypertension, Arthritis', 'None known', 'Kweku Gyamfi (Son)', '0209876500', '2026-02-18 08:30:00'],
  ['Prince Kwabena Tetteh', '0246543210', 'pkwtetteh@gmail.com', 'Male', 38, 'Software Engineer (12+ hrs screen)', 'Mild Dry Eye Syndrome', 'None known', 'Serwaah Tetteh (Sister)', '0246543211', '2026-02-25 14:00:00'],
  ['Adwoa Sarpong Adjei', '0557112233', 'a.adjei@ug.edu.gh', 'Female', 23, 'University Student (UG Legon)', 'Seasonal allergic conjunctivitis', 'Pollen, Dust', 'Nana Adjei (Mother)', '0557112200', '2026-03-03 10:15:00'],
  ['Emmanuel Nyarko Asante', '0244099887', null, 'Male', 55, 'Pastor / Community Leader', 'Type 2 Diabetes, Hypertension', 'Penicillin', 'Grace Asante (Wife)', '0244099888', '2026-03-10 09:30:00'],
  ['Gifty Abena Opoku', '0201234567', 'gifty.opoku@gmail.com', 'Female', 42, 'Market Trader (Makola Market)', 'No significant ocular or systemic history', 'None known', 'Samuel Opoku (Husband)', '0201234568', '2026-03-17 11:30:00'],
  ['Nana Kwesi Asiedu', '0302011122', 'nasiedu@outlook.com', 'Male', 67, 'Farmer', 'Mature cataract right eye, Pterygium, Hypertension', 'None known', 'Akua Asiedu (Daughter)', '0302011100', '2026-03-24 08:00:00'],
  ['Maame Yaa Boateng', '0244556677', 'maame.boateng@gmail.com', 'Female', 31, 'Registered Nurse (KATH)', 'Mild myopia, contact lens wearer', 'Latex', 'Kwame Boateng (Husband)', '0244556678', '2026-04-01 12:00:00'],
  ['Kwaku Domfeh Asante', '0207788990', null, 'Male', 48, 'Taxi Driver', 'Hypertension (on Atenolol)', 'None known', 'Abena Asante (Wife)', '0207788991', '2026-04-07 09:00:00'],
  ['Esther Asabea Bekoe', '0246800001', 'esther.bekoe@outlook.com', 'Female', 36, 'Accountant', 'Migraine, Computer Vision Syndrome', 'Ibuprofen', 'George Bekoe (Husband)', '0246800002', '2026-04-14 10:45:00'],
  ['Osei Yaw Twum', '0244320099', 'oseiyawtwum@gmail.com', 'Male', 29, 'Graphic Designer', 'No significant history', 'None known', 'Afia Twum (Sister)', '0244320098', '2026-04-21 13:00:00'],
  ['Akua Afriyie Poku', '0501121314', null, 'Female', 58, 'Seamstress / Dress Designer', 'Presbyopia, mild ARMD, Hypertension', 'Sulfa drugs', 'Emmanuel Poku (Son)', '0501121300', '2026-04-28 08:15:00'],
  ['Benjamin Kwofie Asare', '0209001122', 'bkasare@gmail.com', 'Male', 44, 'Bank Officer (GCB Bank)', 'Glaucoma suspect (optic disc asymmetry)', 'None known', 'Abena Asare (Wife)', '0209001123', '2026-05-05 09:45:00'],
  ['Abigail Osei Bonsu', '0244678900', 'a.bonsu@yahoo.com', 'Female', 16, 'JHS Student (Class 3)', 'No significant history; mother has myopia', 'None known', 'Kwame Bonsu (Father)', '0244678901', '2026-05-12 11:00:00'],
  ['Kwabena Amoako Tweneboah', '0207345678', null, 'Male', 71, 'Retired Teacher', 'Advanced POAG both eyes, Diabetic Retinopathy', 'Penicillin', 'Ama Tweneboah (Daughter)', '0207345600', '2026-05-19 08:00:00'],
  ['Comfort Asante Adom', '0231456789', 'comfort.adom@gmail.com', 'Female', 25, 'Fashion Designer', 'Seasonal allergic conjunctivitis, mild astigmatism', 'None known', 'Kweku Adom (Brother)', '0231456700', '2026-06-02 10:00:00'],
  ['Isaac Kwame Frimpong', '0244900123', null, 'Male', 50, 'Police Officer (GPS)', 'Hypertension, Presbyopia', 'None known', 'Adwoa Frimpong (Wife)', '0244900100', '2026-06-09 09:15:00'],
  ['Cecilia Afia Acheampong', '0209543210', 'c.acheampong@outlook.com', 'Female', 40, 'Secondary School Teacher', 'Chronic dry eye, Thyroid eye disease', 'Iodine', 'Kwabena Acheampong (Husband)', '0209543211', '2026-06-16 11:30:00'],
  ['Nana Ama Owusu Prempeh', '0244001122', 'namaprempeh@gmail.com', 'Female', 12, 'Primary School Pupil', 'No significant history; father wears glasses', 'None known', 'Owusu Prempeh (Father)', '0244001100', '2026-06-23 13:30:00'],
  ['Richard Adu Gyasi', '0207111222', null, 'Male', 63, 'Cocoa Farmer', 'Pterygium right eye, Hypertension', 'None known', 'Akosua Gyasi (Wife)', '0207111200', '2026-07-07 08:30:00'],
  ['Patricia Oforiwah Mensah', '0501889900', 'patricia.mensah@gmail.com', 'Female', 47, 'Civil Engineer', 'Migraine with visual aura, Dry Eye Syndrome', 'Aspirin', 'Kofi Mensah (Husband)', '0501889901', '2026-07-14 10:00:00'],
  ['Eric Owusu Barimah', '0246334455', 'eric.barimah@yahoo.com', 'Male', 33, 'IT Manager', 'Mild myopia; LASIK candidate enquiry', 'None known', 'Abena Barimah (Wife)', '0246334456', '2026-07-21 09:45:00'],
  ['Florence Asantewaa Danso', '0244777888', null, 'Female', 56, 'Caterer', 'Type 2 Diabetes, early Cataract', 'Penicillin', 'Samuel Danso (Husband)', '0244777800', '2026-07-28 08:00:00'],
  ['Kweku Asante Gyimah', '0209223344', 'kweku.gyimah@gmail.com', 'Male', 22, 'KNUST Student', 'No significant history', 'None known', 'Adwoa Gyimah (Mother)', '0209223300', '2026-08-04 14:00:00'],
  ['Beatrice Akosua Ofori', '0244991001', 'b.ofori@outlook.com', 'Female', 39, 'Pharmacist', 'Presbyopia (early onset), Chronic sinusitis', 'Sulfonamides', 'Emmanuel Ofori (Husband)', '0244991002', '2026-08-11 09:30:00'],
].forEach(r => ip.run(...r));
console.log('Patients: 30 records created.');

// 5. SEED INVOICES & BILLING
const ii = db.prepare('INSERT INTO invoices(patient_id,category,description,unit_price,quantity,discount,amount,status,payment_method,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
[
  [1, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'cash', '2026-01-08 09:50:00'],
  [1, 'Optical & Spectacles', 'Acetate Frame Tortoiseshell', 220, 1, 0, 220, 'paid', 'cash', '2026-01-08 09:52:00'],
  [2, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'momo', '2026-01-14 11:05:00'],
  [3, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'card', '2026-01-22 11:40:00'],
  [3, 'Optical & Spectacles', 'Titanium Alloy Frame Full Rim', 380, 1, 20, 360, 'paid', 'card', '2026-01-22 11:42:00'],
  [4, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'insurance', '2026-01-29 09:10:00'],
  [4, 'Diagnostics & Procedures', 'Tonometry (IOP Check)', 50, 1, 0, 50, 'paid', 'insurance', '2026-01-29 09:12:00'],
  [4, 'Diagnostics & Procedures', 'Visual Field Test (HFA 24-2)', 120, 1, 0, 120, 'paid', 'insurance', '2026-01-29 09:13:00'],
  [5, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'cash', '2026-02-05 13:50:00'],
  [5, 'Optical & Spectacles', 'Kids Flex Frame Blue', 180, 1, 0, 180, 'paid', 'cash', '2026-02-05 13:52:00'],
  [7, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'cash', '2026-02-18 09:00:00'],
  [8, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'card', '2026-02-25 14:30:00'],
  [8, 'Medications & Eye Drops', 'Artificial Tears CMC 0.5%', 14.50, 2, 0, 29, 'paid', 'card', '2026-02-25 14:32:00'],
  [11, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'cash', '2026-03-17 12:00:00'],
  [11, 'Optical & Spectacles', 'Plastic Zyl Frame Black', 140, 1, 0, 140, 'paid', 'cash', '2026-03-17 12:02:00'],
  [14, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'cash', '2026-04-07 09:30:00'],
  [18, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'momo', '2026-05-05 10:15:00'],
  [18, 'Diagnostics & Procedures', 'Tonometry (IOP Check)', 50, 1, 0, 50, 'paid', 'momo', '2026-05-05 10:16:00'],
  [18, 'Diagnostics & Procedures', 'Visual Field Test (HFA 24-2)', 120, 1, 0, 120, 'paid', 'momo', '2026-05-05 10:17:00'],
  [20, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'insurance', '2026-05-19 08:30:00'],
  [20, 'Medications & Eye Drops', 'Latanoprost 0.005% Eye Drops', 55, 1, 0, 55, 'paid', 'insurance', '2026-05-19 08:32:00'],
  [20, 'Medications & Eye Drops', 'Timolol Maleate 0.5% Eye Drops', 32, 1, 0, 32, 'paid', 'insurance', '2026-05-19 08:33:00'],
  [27, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'paid', 'card', '2026-07-21 10:20:00'],
  [6, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'unpaid', null, '2026-08-22 09:00:00'],
  [6, 'Medications & Eye Drops', 'Ciprofloxacin Eye Drops 0.3%', 22.50, 1, 0, 22.50, 'unpaid', null, '2026-08-22 09:05:00'],
  [23, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'unpaid', null, '2026-08-22 10:00:00'],
  [23, 'Medications & Eye Drops', 'Artificial Tears CMC 0.5%', 14.50, 2, 0, 29, 'unpaid', null, '2026-08-22 10:05:00'],
  [23, 'Diagnostics & Procedures', 'Dry Eye Workup / Schirmer Test', 80, 1, 0, 80, 'unpaid', null, '2026-08-22 10:06:00'],
  [30, 'Consultation & Exam', 'Comprehensive Optometric Examination', 150, 1, 0, 150, 'unpaid', null, '2026-08-22 11:00:00'],
].forEach(r => ii.run(...r));
console.log('Invoices: 29 items created.');

// 6. SEED CLINICAL EXAMINATIONS ACROSS LAST 6 MONTHS
const iexam = db.prepare(`
  INSERT INTO examinations(
    patient_id, chief_complaint, visual_acuity_right, visual_acuity_left,
    refraction_sphere_right, refraction_cyl_right, refraction_axis_right,
    refraction_sphere_left, refraction_cyl_left, refraction_axis_left,
    eye_pressure_right, eye_pressure_left, diagnosis, icd10_code, management_plan, exam_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

[
  [1, 'Blurry distance vision when sewing', '6/18', '6/24', '-1.50', '-0.50', 90, '-1.75', '-0.75', 85, 14, 15, 'Compound Myopic Astigmatism', 'H52.13', 'Prescribed single vision corrective glasses with anti-glare coating.', '2026-03-08 09:30:00'],
  [2, 'Gradual reduction in vision and floaters', '6/24', '6/36', '+0.50', '-1.00', 180, '+0.75', '-1.25', 175, 18, 19, 'Nonproliferative Diabetic Retinopathy with Macular Oedema', 'E11.319', 'Urgent referral sent to Korle Bu Eye Clinic. Counselled on glycaemic control.', '2026-03-14 10:45:00'],
  [3, 'Severe eye strain and headaches after computer work', '6/6', '6/6', '+0.50', '-0.25', 90, '+0.50', '-0.25', 90, 13, 13, 'Asthenopia / Computer Vision Fatigue', 'H53.149', 'Prescribed blue-light filtering spectacle lenses and 20-20-20 rule.', '2026-04-22 11:20:00'],
  [4, 'Routine glaucoma review and visual field test', '6/9', '6/12', '+1.00', '0.00', 0, '+1.25', '0.00', 0, 22, 24, 'Primary Open-Angle Glaucoma (POAG)', 'H40.113', 'Continue Latanoprost 0.005% 1 drop nocte OU. Review in 6 months.', '2026-04-29 08:55:00'],
  [5, 'Blurry blackboard vision in school', '6/36', '6/24', '-2.25', '-0.75', 10, '-2.00', '-0.50', 170, 14, 15, 'Myopia, Bilateral', 'H52.13', 'Prescribed full-time spectacle wear with polycarbonate shatter-proof lenses.', '2026-05-05 13:40:00'],
  [6, 'Redness, foreign body sensation, and discharge', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 15, 'Acute Bacterial Conjunctivitis', 'H10.9', 'Prescribed Ciprofloxacin 0.3% Eye Drops QDS for 7 days. Cold compresses.', '2026-05-11 09:15:00'],
  [7, 'Severe clouding of vision, cannot recognise faces', 'CF 1m', '6/60', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 13, 'Age-Related Nuclear Cataract, Bilateral', 'H25.9', 'Referred to KATH Ophthalmology for cataract extraction and IOL implantation.', '2026-06-18 08:45:00'],
  [8, 'Burning, itching, and dry sensation in both eyes', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 14, 'Dry Eye Syndrome / MGD', 'H04.123', 'Prescribed Artificial Tears CMC 0.5% QDS and warm lid massages.', '2026-06-25 14:15:00'],
  [9, 'Itchy red eyes during dusty weather', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 16, 'Allergic Conjunctivitis (Seasonal)', 'H10.9', 'Prescribed Olopatadine 0.1% eye drops BD. Avoid eye rubbing.', '2026-07-03 10:30:00'],
  [11, 'Difficulty reading near text and Makola ledger', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 14, 15, 'Presbyopia', 'H52.4', 'Prescribed +2.00 DS near reading glasses in lightweight plastic frame.', '2026-07-17 11:45:00'],
  [14, 'Blurry night driving and glare', '6/12', '6/18', '-0.75', '-1.00', 95, '-1.00', '-1.25', 85, 16, 17, 'Myopic Astigmatism', 'H52.223', 'Prescribed anti-reflective night driving lenses.', '2026-07-07 09:15:00'],
  [18, 'Occasional ocular throbbing and halo around lights', '6/9', '6/9', '+0.75', '0.00', 0, '+0.75', '0.00', 0, 21, 22, 'Ocular Hypertension / Glaucoma Suspect', 'H40.113', 'Advised baseline HVF 24-2 and OCT RNFL scan.', '2026-08-05 10:00:00'],
  [20, 'Follow-up for chronic open angle glaucoma', '6/12', '6/12', '+1.25', '-0.50', 180, '+1.50', '-0.50', 180, 16, 16, 'Primary Open-Angle Glaucoma', 'H40.113', 'IOP well controlled on Timolol & Latanoprost. Continue current drops.', '2026-08-19 08:45:00'],
  [23, 'Severe sandy feeling and grittiness', '6/6', '6/9', '0.00', '-0.50', 90, '0.00', '-0.50', 90, 15, 14, 'Dry Eye Syndrome, Bilateral', 'H04.123', 'Prescribed preservative-free lubricating drops QDS and warm lid hygiene.', '2026-08-22 10:15:00'],
  [27, 'Distance blur and eye fatigue', '6/18', '6/18', '-1.25', '0.00', 0, '-1.25', '0.00', 0, 14, 14, 'Simple Myopia', 'H52.13', 'Prescribed single-vision distance glasses.', '2026-08-21 10:00:00'],
  [30, 'Small print blur when reading Bible', '6/6', '6/6', '0.00', '0.00', 0, '0.00', '0.00', 0, 15, 15, 'Presbyopia', 'H52.4', 'Prescribed +1.75 DS near reading glasses.', '2026-08-22 11:15:00'],
].forEach(r => iexam.run(...r));
console.log('Examinations: 16 clinical records created.');

// 7. SEED LIVE QUEUE ENTRIES
const iq = db.prepare('INSERT INTO queue_entries(patient_id,status,room,checked_in_at) VALUES(?,?,?,?)');
[
  [6, 'ready_for_billing', 'Consultation Room 1', '2026-08-22 09:00:00'],
  [23, 'ready_for_billing', 'Consultation Room 2', '2026-08-22 10:00:00'],
  [30, 'waiting', null, '2026-08-22 11:05:00'],
  [29, 'in_progress', 'Consultation Room 1', '2026-08-22 11:00:00'],
].forEach(r => iq.run(...r));
console.log('Live Queue: 4 entries initialized.');

// 7. SEED CLINICAL REMINDERS
const ir = db.prepare('INSERT INTO reminders(patient_id,due_date,note,status) VALUES(?,?,?,?)');
[
  [1, '2026-09-08', '6-month myopia review and blood pressure ocular check', 'pending'],
  [2, '2026-07-14', 'Urgent ophthalmology follow-up: Diabetic Macular Oedema referral', 'sent'],
  [4, '2026-10-01', 'IOP and optic nerve review: POAG monitoring', 'pending'],
  [8, '2026-11-25', '3-month dry eye review: MGD treatment response', 'pending'],
  [12, '2026-09-24', 'Post-pterygium referral: surgical assessment result follow-up', 'sent'],
  [18, '2026-11-05', 'Glaucoma suspect: HVF and OCT RNFL results review', 'pending'],
  [20, '2026-09-19', 'POAG medication compliance review', 'sent'],
  [24, '2026-11-23', 'Back-to-school annual eye check (JHS Class 7)', 'pending'],
  [28, '2027-01-28', 'Annual diabetic eye review: cataract progression assessment', 'pending'],
  [30, '2026-11-11', 'Presbyopia adaptation review: reading glasses', 'pending'],
].forEach(r => ir.run(...r));
console.log('Reminders: 10 recalls created.');

// 8. SEED MEDICAL REFERRALS
const iref = db.prepare('INSERT INTO referrals(patient_id,referred_to,urgency,reason,clinical_findings,additional_notes,doctor_name,created_at) VALUES(?,?,?,?,?,?,?,?)');
[
  [2, 'Korle Bu Teaching Hospital (Ophthalmology Unit)', 'Urgent', 'Diabetic Macular Oedema with non-proliferative diabetic retinopathy.', 'VA: 6/24 OD, 6/36 OS. Hard exudates circinate pattern right macula. Dot/blot haemorrhages bilateral. IOP: 18/19 mmHg.', 'Patient to continue Metformin. Glycaemic control review before surgical assessment.', 'Dr. Kwesi Asante Boateng, OD', '2026-01-14 11:30:00'],
  [7, 'Komfo Anokye Teaching Hospital (Ophthalmology)', 'Urgent', 'Bilateral age-related cataract causing severe visual impairment.', 'VA: CF 1m OD, 6/60 OS. Dense nuclear cataract OD, PSC cataract OS. IOP: 14/13 mmHg.', 'Family counselled regarding surgical risk and expected outcome.', 'Dr. Kwesi Asante Boateng, OD', '2026-02-18 09:30:00'],
  [12, '37 Military Hospital (Ophthalmology)', 'Routine', 'Encroaching pterygium right eye approaching pupillary margin.', 'VA: 6/12 OD, 6/6 OS. Pterygium head 1mm from pupil margin (nasal side).', 'Patient to use lubricating drops pre-operatively.', 'Dr. Kwesi Asante Boateng, OD', '2026-03-24 09:00:00'],
].forEach(r => iref.run(...r));
console.log('Referrals: 3 letters archived.');

console.log('\nSeed completed successfully.');
