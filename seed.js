const db = require('./db');

const insert = db.prepare('INSERT INTO patients (full_name, phone) VALUES (?, ?)');

insert.run('Ama Serwaa', '0244123456');

console.log('Patient added!');