const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'microworks-admin-2026';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const OTP_TTL_MS = 5 * 60 * 1000;
const otpChallenges = new Map();
const otpSendTimes = new Map();
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
const WEB_DIR = path.join(__dirname, 'web');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.pdf`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.pdf' || (file.mimetype !== 'application/pdf' && file.mimetype !== 'application/octet-stream')) {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

function readRequests() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function writeRequests(items) { fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2)); }
function adminOnly(req, res, next) {
  const key = req.get('x-admin-key') || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || ''); }
function isPhone(value) { return /^\+?[0-9 ()-]{8,20}$/.test(value || ''); }

async function sendAcknowledgement(request) {
  const result = { email: 'not_sent' };
  const emailConfigured = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL;
  if (request.email && emailConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: request.email,
        subject: `MicroWorks: Request Submitted – ${request.id}`,
        text: `Hello ${request.name},\n\nWe have received your MicroWorks service request.\n\nRequest ID: ${request.id}\nService: ${request.service}\nStatus: ${request.status}\nSubmitted: ${new Date(request.createdAt).toLocaleString()}\n\nOur team will review your request and contact you with the next steps. Please keep your request ID for reference.\n\nRegards,\nMicroWorks Support`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172b4d"><h2>Request submitted successfully</h2><p>Hello ${escapeHtml(request.name)},</p><p>We have received your MicroWorks service request.</p><p><b>Request ID:</b> ${request.id}<br><b>Service:</b> ${escapeHtml(request.service)}<br><b>Status:</b> ${request.status}</p><p>Our team will review your request and contact you with the next steps. Please keep your request ID for reference.</p><p>Regards,<br>MicroWorks Support</p></div>`
      });
      result.email = 'sent';
    } catch (err) {
      console.error('Acknowledgement email failed:', err.message);
      result.email = 'failed';
    }
  } else if (request.email) result.email = 'not_configured';

  return result;
}
function normalizeSmsNumber(value) {
  const trimmed = String(value || '').trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  // MicroWorks defaults to India for 10-digit local mobile numbers.
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 12 && digits.startsWith('91')) { /* already India country code */ }
  else if (hasPlus) return `+${digits}`;
  else if (digits.length >= 11) { /* keep supplied country code */ }
  return `+${digits}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


function readUsers() { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; } }
function writeUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function normalizePhone(value) {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return '+' + digits;
}
function hashOtp(phone, code) { return crypto.createHash('sha256').update(`${phone}:${code}:${process.env.OTP_SECRET || ADMIN_KEY}`).digest('hex'); }
function signToken(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured in server/.env');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function authRequired(req, res, next) {
  try {
    const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const parts = token.split('.');
    if (parts.length !== 2 || !process.env.AUTH_SECRET) throw new Error('Invalid token');
    const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('Invalid token');
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) throw new Error('Expired token');
    const user = readUsers().find(u => u.id === payload.sub);
    if (!user) throw new Error('Unknown user');
    req.user = { id: user.id, name: user.name, email: user.email, phone: user.phone };
    next();
  } catch { res.status(401).json({ error: 'Please log in again.' }); }
}
async function sendEmailOtp(email, code, name) {
  const configured = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL;
  if (!configured) throw new Error('Email OTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and FROM_EMAIL.');
  const tx = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: String(process.env.SMTP_SECURE || 'false') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await tx.sendMail({ from: process.env.FROM_EMAIL, to: email, subject: 'Your MicroWorks verification code', text: `Hello ${name || 'there'},\n\nYour MicroWorks verification code is ${code}. It expires in 5 minutes. Do not share this code with anyone.\n\nIf you did not request this code, you can ignore this email.`, html: `<p>Hello ${escapeHtml(name || 'there')},</p><p>Your MicroWorks verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>It expires in 5 minutes. Do not share this code with anyone.</p><p>If you did not request this code, you can ignore this email.</p>` });
}
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const purpose = req.body.purpose === 'signup' ? 'signup' : 'login';
    const name = String(req.body.name || '').trim().slice(0, 100);
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (purpose === 'signup' && !name) return res.status(400).json({ error: 'Enter your name.' });
    const users = readUsers();
    const existing = users.find(u => u.email === email);
    if (purpose === 'signup' && existing) return res.status(409).json({ error: 'An account already exists for this email. Choose Login.' });
    if (purpose === 'login' && !existing) return res.status(404).json({ error: 'No account found for this email. Please sign up first.' });
    const last = otpSendTimes.get(email) || 0;
    if (Date.now() - last < 60_000) return res.status(429).json({ error: 'Please wait 60 seconds before requesting another OTP.' });
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await sendEmailOtp(email, code, name || (existing && existing.name));
    otpChallenges.set(email, { purpose, name, email, codeHash: hashOtp(email, code), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
    otpSendTimes.set(email, Date.now());
    res.json({ message: 'OTP sent to your email. It expires in 5 minutes.' });
  } catch (err) {
    console.error('Email OTP failed:', err.message);
    res.status(502).json({ error: err.message || 'Could not send email OTP.' });
  }
});
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.otp || '').trim();
    if (!isEmail(email) || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter a valid email and 6-digit OTP.' });
    const challenge = otpChallenges.get(email);
    if (!challenge || challenge.expiresAt < Date.now()) { otpChallenges.delete(email); return res.status(400).json({ error: 'OTP expired. Request a new code.' }); }
    if (challenge.attempts >= 5) { otpChallenges.delete(email); return res.status(429).json({ error: 'Too many incorrect attempts. Request a new OTP.' }); }
    challenge.attempts++;
    if (hashOtp(email, code) !== challenge.codeHash) return res.status(400).json({ error: 'Incorrect or expired OTP. Please try again.' });
    otpChallenges.delete(email);
    let users = readUsers();
    let user = users.find(u => u.email === email);
    if (challenge.purpose === 'signup') {
      if (user) return res.status(409).json({ error: 'An account already exists. Please log in.' });
      user = { id: crypto.randomUUID(), name: challenge.name, email: challenge.email, phone: '', createdAt: new Date().toISOString() };
      users.push(user); writeUsers(users);
      try { const tx = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: String(process.env.SMTP_SECURE || 'false') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }); await tx.sendMail({ from: process.env.FROM_EMAIL, to: user.email, subject: 'Welcome to MicroWorks', text: `Hello ${user.name}, your MicroWorks account has been created successfully.` }); } catch (e) { console.error('Welcome email failed:', e.message); }
    } else if (!user) return res.status(404).json({ error: 'Account not found. Please sign up.' });
    const token = signToken({ sub: user.id });
    res.json({ message: challenge.purpose === 'signup' ? 'Account created successfully.' : 'Login successful.', token, user: { id: user.id, name: user.name, email: user.email, phone: user.phone } });
  } catch (err) { console.error('OTP verification failed:', err.message); res.status(500).json({ error: 'Unable to verify OTP. Check server configuration.' }); }
});
app.get('/api/auth/me', authRequired, (req, res) => res.json({ user: req.user }));
app.post('/api/auth/logout', (_req, res) => res.json({ message: 'Logged out. Remove the token from this browser.' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'MicroWorks API' }));

app.post('/api/requests', upload.single('attachment'), async (req, res) => {
  try {
    const service = String(req.body.service || '').trim();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const phone = String(req.body.phone || '').trim();
    const details = String(req.body.details || '').trim();
    if (!service || !name || !details || (!email && !phone)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Name, service, task details, and at least one email address or phone number are required.' });
    }
    if (email && !isEmail(email)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (phone && !isPhone(phone)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Please enter a valid phone number including country code when possible.' });
    }
    const requests = readRequests();
    const id = `MW-${String(Date.now()).slice(-8)}`;
    const request = {
      id, service, name, email, phone,
      contact: [email, phone].filter(Boolean).join(' / '),
      details,
      attachment: req.file ? { originalName: path.basename(req.file.originalname), storedName: req.file.filename, size: req.file.size, mimeType: 'application/pdf' } : null,
      status: 'New', assignedTo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      acknowledgement: { email: email ? 'pending' : 'not_requested', sms: phone ? 'pending' : 'not_requested' }
    };
    requests.unshift(request);
    writeRequests(requests);
    const acknowledgement = await sendAcknowledgement(request);
    request.acknowledgement = acknowledgement;
    writeRequests(requests);
    const sent = acknowledgement.email === 'sent' || acknowledgement.sms === 'sent';
    res.status(201).json({
      message: 'Request received', request: { id: request.id, service: request.service, status: request.status, acknowledgement },
      notificationMessage: sent ? 'Acknowledgement sent.' : 'Request saved. Email/SMS acknowledgement needs notification credentials in server/.env.'
    });
  } catch (err) {
    console.error('Request submission failed:', err);
    res.status(500).json({ error: err.message || 'Unable to submit request.' });
  }
});

app.get('/api/requests', adminOnly, (_req, res) => {
  const requests = readRequests();
  res.json({ requests, total: requests.length });
});

app.get('/api/requests/:id/file', adminOnly, (req, res) => {
  const item = readRequests().find(r => r.id === req.params.id);
  if (!item || !item.attachment) return res.status(404).json({ error: 'Attachment not found' });
  const filePath = path.join(UPLOAD_DIR, path.basename(item.attachment.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Attachment file is missing' });
  res.download(filePath, item.attachment.originalName || 'customer-document.pdf');
});

app.patch('/api/requests/:id', adminOnly, (req, res) => {
  const requests = readRequests();
  const item = requests.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Request not found' });
  if (req.body.status) item.status = String(req.body.status);
  if (req.body.assignedTo !== undefined) item.assignedTo = String(req.body.assignedTo);
  item.updatedAt = new Date().toISOString();
  writeRequests(requests);
  res.json({ request: item });
});

app.use(express.static(WEB_DIR));
app.get('/admin', (_req, res) => res.sendFile(path.join(WEB_DIR, 'admin.html')));
app.get('/auth', (_req, res) => res.sendFile(path.join(WEB_DIR, 'auth.html')));
app.get('*', (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10 MB or smaller.' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err) return res.status(400).json({ error: err.message || 'Request could not be processed.' });
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`MicroWorks server running on port ${PORT}`));
