import { db, initDb } from './db.js';
import bcrypt from 'bcryptjs';

initDb();

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function(err, row) {
      if (err) reject(err); else resolve(row);
    });
  });
}

async function seed() {
  // Clear existing
  await run('DELETE FROM results');
  await run('DELETE FROM questions');
  await run('DELETE FROM quizzes');
  await run('DELETE FROM users');

  // Users
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('user123', 10);
  await run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', ['admin@example.com', adminHash, 'admin']);
  await run('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', ['user@example.com', userHash, 'user']);

  // Quiz
  const quizRes = await run('INSERT INTO quizzes (title, description) VALUES (?, ?)', ['General Knowledge', 'A simple 3-question quiz']);
  const quizId = quizRes.lastID;

  const questions = [
    {
      text: 'What is the capital of France?',
      choices: ['Berlin', 'Madrid', 'Paris', 'Rome'],
      correct_index: 2,
    },
    {
      text: '2 + 2 = ?',
      choices: ['3', '4', '5', '22'],
      correct_index: 1,
    },
    {
      text: 'Which planet is known as the Red Planet?',
      choices: ['Earth', 'Mars', 'Jupiter', 'Venus'],
      correct_index: 1,
    }
  ];

  for (const q of questions) {
    await run('INSERT INTO questions (quiz_id, text, choices, correct_index) VALUES (?, ?, ?, ?)', [
      quizId,
      q.text,
      JSON.stringify(q.choices),
      q.correct_index,
    ]);
  }

  console.log('Seed completed');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
