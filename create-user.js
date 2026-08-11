const bcrypt = require('bcryptjs');
const db = require('./db');

const email = process.argv[2];
const plainPassword = process.argv[3];
const role = process.argv[4];

if (!email || !plainPassword || !role) {
  console.log('Usage: node create-user.js <email> <password> <role>');
  console.log('Roles: admin, doctor, receptionist');
  process.exit(1);
}

const hashedPassword = bcrypt.hashSync(plainPassword, 10);
db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)').run(email, hashedPassword, role);
console.log('User created:', email, '(' + role + ')');