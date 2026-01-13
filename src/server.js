import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db, initDb } from './db.js';
import { generateToken, authRequired, adminRequired } from './auth.js';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

initDb();

const PORT = process.env.PORT || 4000;

// Auth routes
app.post('/api/auth/signup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  stmt.run(email, hash, function(err) {
    if (err) return res.status(400).json({ error: 'Email already exists' });
    const user = { id: this.lastID, email, role: 'user' };
    res.json({ token: generateToken(user) });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: generateToken(row) });
  });
});

// Quizzes
app.get('/api/quizzes', (req, res) => {
  db.all('SELECT id, title, description FROM quizzes ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.get('/api/quizzes/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT id, title, description FROM quizzes WHERE id = ?', [id], (err, quiz) => {
    if (err || !quiz) return res.status(404).json({ error: 'Quiz not found' });
    db.all('SELECT id, text, choices FROM questions WHERE quiz_id = ?', [id], (err2, qs) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      const questions = qs.map(q => ({ id: q.id, text: q.text, choices: JSON.parse(q.choices) }));
      res.json({ ...quiz, questions });
    });
  });
});

app.post('/api/quizzes', authRequired, adminRequired, (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const stmt = db.prepare('INSERT INTO quizzes (title, description) VALUES (?, ?)');
  stmt.run(title, description || null, function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ id: this.lastID, title, description });
  });
});

app.post('/api/quizzes/:id/questions', authRequired, adminRequired, (req, res) => {
  const quizId = req.params.id;
  const { text, choices, correctIndex } = req.body;
  if (!text || !Array.isArray(choices) || choices.length < 2 || typeof correctIndex !== 'number') {
    return res.status(400).json({ error: 'Invalid question payload' });
  }
  const stmt = db.prepare('INSERT INTO questions (quiz_id, text, choices, correct_index) VALUES (?, ?, ?, ?)');
  stmt.run(quizId, text, JSON.stringify(choices), correctIndex, function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ id: this.lastID, quizId, text, choices, correctIndex });
  });
});

app.post('/api/quizzes/:id/submit', authRequired, (req, res) => {
  const quizId = req.params.id;
  const { answers } = req.body; // [{questionId, choiceIndex}]
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'Invalid answers' });
  db.all('SELECT id, correct_index FROM questions WHERE quiz_id = ?', [quizId], (err, qs) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const key = new Map(qs.map(q => [q.id, q.correct_index]));
    let score = 0;
    for (const a of answers) {
      if (key.has(a.questionId) && key.get(a.questionId) === a.choiceIndex) score++;
    }
    const total = qs.length;
    const stmt = db.prepare('INSERT INTO results (user_id, quiz_id, score, total) VALUES (?, ?, ?, ?)');
    stmt.run(req.user.id, quizId, score, total, function(err2) {
      if (err2) return res.status(500).json({ error: 'DB error' });
      res.json({ score, total });
    });
  });
});

app.get('/api/results', authRequired, (req, res) => {
  db.all(`SELECT r.id, r.quiz_id as quizId, q.title as quizTitle, r.score, r.total, r.created_at as createdAt
          FROM results r JOIN quizzes q ON r.quiz_id = q.id
          WHERE r.user_id = ? ORDER BY r.created_at DESC`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
