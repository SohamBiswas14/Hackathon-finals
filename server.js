require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const multer = require('multer');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Middleware ---
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// --- Schemas ---
const userSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  picture: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  department: { type: String, default: 'Not Specified' },
  anonymityEnabled: { type: Boolean, default: false },
  totalReports: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

const reportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  photoUrl: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['Waste Management', 'Infrastructure', 'Plumbing', 'Electrical', 'Hazard', 'Other'], default: 'Other' },
  urgency: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Low' },
  location: { lat: Number, lng: Number },
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Declined', 'Team Dispatched', 'In Progress', 'Closed'],
    default: 'Pending'
  },
  closingRemarks: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date }
});
const Report = mongoose.model('Report', reportSchema);

// --- Auth Middleware ---
const requireAuth = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden: Admins only' });
  next();
};

// --- User Profile APIs ---
app.get('/api/user/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-googleId');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/user/me', requireAuth, async (req, res) => {
  try {
    const { name, department, anonymityEnabled } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id, { name, department, anonymityEnabled }, { returnDocument: 'after' }
    ).select('-googleId');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Phase 5: Leaderboard API ---
app.get('/api/leaderboard', requireAuth, async (req, res) => {
  try {
    const topUsers = await User.find({ role: 'user', totalReports: { $gt: 0 } })
      .sort({ totalReports: -1 })
      .limit(10)
      .select('name picture department anonymityEnabled totalReports');
    res.json(topUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// --- File Upload API ---
app.post('/api/upload', requireAuth, upload.array('media', 5), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  // Return an array of the public URLs for the frontend to use
  const urls = req.files.map(file => '/uploads/' + file.filename);
  res.json({ urls });
});

// Endpoint to delete a mistakenly uploaded file
app.delete('/api/upload', requireAuth, (req, res) => {
  const { url } = req.body;
  if (url) {
    const filePath = path.join(__dirname, 'public', url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  res.json({ success: true });
});

// --- Reports APIs (Phase 4 & 5) ---
// Admin: Get all reports
app.get('/api/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find().populate('userId', 'name picture anonymityEnabled').sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// User: Get my reports
app.get('/api/reports/my-issues', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch your reports' });
  }
});

// Admin: Update report status
app.put('/api/reports/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, closingRemarks } = req.body;
    const updateData = { status };
    if (closingRemarks) updateData.closingRemarks = closingRemarks;
    if (status === 'Closed') updateData.closedAt = new Date();

    // Fetch the original report first to check its previous status
    const originalReport = await Report.findById(req.params.id);
    if (!originalReport) return res.status(404).json({ error: 'Report not found' });

    const report = await Report.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });

    // If the admin is declining a report that wasn't already declined, revoke the user's credit
    if (status === 'Declined' && originalReport.status !== 'Declined') {
      await User.findByIdAndUpdate(report.userId, { $inc: { totalReports: -1 } });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// User: Rate a resolved report
app.put('/api/reports/:id/rate', requireAuth, async (req, res) => {
  try {
    const { rating } = req.body;
    const report = await Report.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { rating: Number(rating) },
      { returnDocument: 'after' }
    );
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to rate issue' });
  }
});

// User: Create an ACTUAL report (Phase 5)
app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    const { photoUrl, description, category, urgency, lat, lng } = req.body;
    const newReport = await Report.create({
      userId: req.user.id,
      photoUrl: photoUrl || 'https://via.placeholder.com/400x300?text=No+Photo+Provided',
      description: description,
      category: category || 'Other',
      urgency: urgency || 'Low',
      location: { lat, lng }
    });
    // Increment user report count for gamification
    await User.findByIdAndUpdate(req.user.id, { $inc: { totalReports: 1 } });
    res.json(newReport);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// --- AI Chatbot ---
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    
    // We combine the system prompt directly into the message. 
    // This safely bypasses strict 'systemInstruction' schema bugs in the newest SDK.
    const fullPrompt = `You are the NITC Portal Support Agent. Help users navigate the portal, track issues, and manage dashboard tasks. Keep answers brief.\n\nUser: ${message}\nAgent:`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: fullPrompt, 
      config: { temperature: 0.3 }
    });
    
    res.json({ reply: response.text });
  } catch (error) {
    console.error('AI Chat Error:', error.message); 
    
    // Auto-Fallback Mode: If your API key is invalid/expired, we keep the app working 
    // by providing smart fallback responses instead of crashing the UI.
    const errorStr = String(error.message).toLowerCase();
    if (errorStr.includes('key') || errorStr.includes('fetch') || errorStr.includes('400') || errorStr.includes('403') || errorStr.includes('unauthenticated')) {
      const userMsg = req.body.message.toLowerCase();
      let mockReply = "Hello! I am the NITC Support AI. How can I help you today?";
      
      if (userMsg.includes('track') || userMsg.includes('where')) {
        mockReply = "To track your reports, click on the 'Track Issues' card on your dashboard. You can filter them by status there.";
      } else if (userMsg.includes('report') || userMsg.includes('issue')) {
        mockReply = "You can file a new issue by clicking 'Report Issue' on the dashboard. Don't forget to attach a photo and assign an urgency level!";
      } else if (userMsg.includes('admin') || userMsg.includes('export') || userMsg.includes('csv')) {
        mockReply = "Admins can view all campus issues from the Triage Board, update ticket statuses, and export the database as a CSV file.";
      }
      
      return res.json({ reply: `${mockReply}\n\n*(Offline Mode: Your Google API Key is invalid, using fallback responses)*` });
    }

    // If it's a completely different error, send the REAL error to the UI so you can read it.
    res.status(500).json({ error: `API Error: ${error.message}` });
  }
});

// --- Auth Routes ---
const authorizedAdmins = ['gautham_b261353ec@nitc.ac.in', 'tgbdragon2008@gmail.com','sampa6723@gmail.com'];

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || '/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Get the email first so we can check if they are an admin
      const email = profile.emails[0].value;

      // Block if domain is not nitc.ac.in AND the email is NOT in the authorizedAdmins list
      if (profile._json.hd !== 'nitc.ac.in' && !authorizedAdmins.includes(email)) {
        return done(null, false, { message: 'Invalid domain' });
      }

      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email,
          name: profile.displayName,
          picture: profile.photos[0].value,
          role: authorizedAdmins.includes(email) ? 'admin' : 'user'
        });
      }
      return done(null, user);
    } catch (err) { return done(err, null); }
}));

// Removed hostedDomain so the Google UI doesn't lock the input, but backend logic still verifies the domain
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
  prompt: 'select_account'
}));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?error=domain', session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 86400000 });
  res.redirect(req.user.role === 'admin' ? '/issues.html' : '/report.html');
});

app.get('/auth/verify', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ authenticated: false });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ authenticated: false });
    res.status(200).json({ authenticated: true, redirectUrl: decoded.role === 'admin' ? '/issues.html' : '/report.html', role: decoded.role });
  });
});

app.get('/auth/logout', (req, res) => { res.clearCookie('auth_token'); res.redirect('/'); });

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));