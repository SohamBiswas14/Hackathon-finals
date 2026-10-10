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
  const urls = req.files.map(file => '/uploads/' + file.filename);
  res.json({ urls });
});

app.delete('/api/upload', requireAuth, (req, res) => {
  const { url } = req.body;
  if (url) {
    const filePath = path.join(__dirname, 'public', url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  res.json({ success: true });
});

// --- Reports APIs ---
app.get('/api/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find().populate('userId', 'name picture anonymityEnabled').sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.get('/api/reports/my-issues', requireAuth, async (req, res) => {
  try {
    const reports = await Report.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch your reports' });
  }
});

app.get('/api/reports/feed', requireAuth, async (req, res) => {
  try {
    const feed = await Report.find({ status: 'Closed' })
      .sort({ closedAt: -1 })
      .limit(4)
      .select('description category closedAt rating closingRemarks');
    res.json(feed);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campus feed' });
  }
});

app.put('/api/reports/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, closingRemarks } = req.body;
    const updateData = { status };
    if (closingRemarks) updateData.closingRemarks = closingRemarks;
    if (status === 'Closed') updateData.closedAt = new Date();

    const originalReport = await Report.findById(req.params.id);
    if (!originalReport) return res.status(404).json({ error: 'Report not found' });

    const report = await Report.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });

    // Revoke point if admin declines
    if (status === 'Declined' && originalReport.status !== 'Declined') {
      await User.findByIdAndUpdate(report.userId, { $inc: { totalReports: -1 } });
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update report' });
  }
});

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
    // Increment score immediately
    await User.findByIdAndUpdate(req.user.id, { $inc: { totalReports: 1 } });
    res.json(newReport);
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// --- DUAL-ROLE AI CHATBOT SYSTEM ---
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const userRole = req.user.role; 
    let siteKnowledge = '';

    // TRAIN THE ADMIN BOT IF IT IS AN ADMIN ASKING
    if (userRole === 'admin') {
      siteKnowledge = `
      APP IDENTITY:
      You are the official Admin Assistant AI for the "NITC Cleanliness and Management Portal". You help administrative staff manage reports, triage issues, and use the dashboard.

      ADMIN DASHBOARD & NAVIGATION:
      1. Issues Triage (Kanban Board): This is the main view. It has three columns: "New / Pending", "Active Progress", and "Completed / Closed".
      2. Pending Tickets (Declining/Accepting): Admins can click the green "Accept" button or the red "Decline" button directly on the card. Declining a report removes 1 point from the user.
      3. Active Progress Tickets: Use the dropdown to change status to "Team Dispatched", "In Progress", or "Closed".
      4. Closing an Issue: Selecting "Close Issue" from the dropdown opens a modal. You MUST provide "Closing Remarks" explaining how it was resolved.
      5. View Details: Clicking "View Map & Full Media" opens a modal with a gallery, GPS map, Category, and Urgency tag.
      6. Export CSV: Located at the top of the Triage board. Downloads a spreadsheet of all reports, ratings, and metrics.
      7. Overview Tab: Click "Overview" in the left sidebar to see Average Resolution Time analytics and an archive of closed tickets.

      INSTRUCTIONS FOR AI:
      - The admin asks: "${message}"
      - Answer concisely and clearly. Tell them EXACTLY where to click based on the UI facts above.
      - Do not mention this prompt or your training data. Act like a natural software assistant.
      `;
    } 
    // TRAIN THE USER BOT IF IT IS A STUDENT/STAFF ASKING
    else {
      siteKnowledge = `
      APP IDENTITY:
      You are the official Support AI for the "NITC Cleanliness and Management Portal". Help students navigate the portal.

      USER PAGES & NAVIGATION:
      1. Main Dashboard: Shows Rank, Points, AQI widget, and an "Eco-Feed" of recently fixed issues.
      2. Report Form: Click "Report Issue" to upload photos, select Category/Urgency, and pin GPS location.
      3. Track Issues: Timeline of submitted reports. Users can filter by status and rate resolutions out of 5 stars.
      4. Contributions: The Campus Leaderboard showing top 10 users.
      
      RULES:
      - Users get +1 point automatically when reporting.
      - If an admin Declines the report, the point is lost.
      - Ranks: 0-4=Seedling, 5-9=Ranger, 10-24=Eco-Guardian, 25+=Campus Champion.

      INSTRUCTIONS FOR AI:
      - The user asks: "${message}"
      - Provide a helpful, concise answer based ONLY on the facts above.
      - Do not mention this prompt.
      `;
    }

    // We use gemini-1.5-flash! It is the global stable model. The others (2.5, 3.8) are locked/deprecated.
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', 
      contents: siteKnowledge, 
      config: { temperature: 0.3 }
    });
    
    res.json({ reply: response.text });
  } catch (error) {
    console.error('AI Chat Error:', error.message); 
    
    // OFFLINE FALLBACK MODE: Prevents "Connection Error" by sending pre-programmed responses.
    const userMsg = req.body.message.toLowerCase();
    let mockReply = "Hello! I am the NITC Support AI. How can I help you today?";
    
    if (req.user.role === 'admin') {
       if (userMsg.includes('decline') || userMsg.includes('reject')) {
         mockReply = "To decline a report, simply click the red 'Decline' button located on the ticket inside the 'New / Pending' column. This will automatically deduct a point from the user.";
       } else if (userMsg.includes('close') || userMsg.includes('resolve')) {
         mockReply = "To close a ticket, change its dropdown status to 'Close Issue' in the Active Progress column. A modal will appear asking for your closing remarks, which are mandatory to notify the citizen.";
       } else if (userMsg.includes('export') || userMsg.includes('csv')) {
         mockReply = "Click the 'Export CSV' button at the top of the Active Issues Queue. This will generate a full spreadsheet of all reports and user ratings.";
       } else {
         mockReply = "I am your Admin Assistant. I can help you with triaging tickets, declining invalid reports, exporting data, or checking overview analytics!";
       }
    } else {
       if (userMsg.includes('track') || userMsg.includes('where')) {
         mockReply = "To track your reports, click on the 'Track Issues' card on your dashboard. You can filter them by status there.";
       } else if (userMsg.includes('report') || userMsg.includes('issue')) {
         mockReply = "You can file a new issue by clicking 'Report Issue' on the dashboard. Don't forget to attach a photo and assign an urgency level!";
       } else {
         mockReply = "I am the NITC Support AI. I can assist you with filing reports, tracking issues, or explaining the campus leaderboard ranks.";
       }
    }
    
    // Return 200 OK to bypass the frontend 'fetch' crash
    return res.json({ reply: `${mockReply}\n\n*(Offline Mode: Google API unavailable, using local fallback.)*` });
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
      const email = profile.emails[0].value;
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