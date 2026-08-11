const db = require('./db');

const patients = db.prepare('SELECT * FROM patients').all();

console.log(patients);