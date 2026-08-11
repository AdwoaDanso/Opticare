const bcrypt = require('bcryptjs');
const db = require('./db');

const email = 'admin@opticare.local';
const plainPassword = 'admin123';

const hashedPassword = bcrypt.hashSync(plainPassword, 10);

db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hashedPassword);

console.log('Admin user created:', email);