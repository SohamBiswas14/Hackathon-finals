require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ai = new GoogleGenAI(); // Automatically uses process.env.GEMINI_API_KEY

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(passport.initialize());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// User Schema (Phase 2 Expanded)
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

// Auth Middleware
const requireAuth = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

// --- API Routes ---

// Get current user profile
app.get('/api/user/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-googleId');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Update user profile (Phase 2 additions)
app.put('/api/user/me', requireAuth, async (req, res) => {
  try {
    const { name, department, anonymityEnabled } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, department, anonymityEnabled },
      { new: true, runValidators: true }
    ).select('-googleId');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// AI Chatbot endpoint
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const systemPrompt = `You are the NITC Portal Support Agent. Help users navigate reporting environmental hazards, uploading photos, tracking issues, and portal settings. Keep answers brief and professional.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: message,
      config: { systemInstruction: systemPrompt, temperature: 0.3 }
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error('AI Error:', error);
    res.status(500).json({ error: 'Failed to process AI request' });
  }
});

// --- Auth Routes ---
const authorizedAdmins = ['gautham_b261353ec@nitc.ac.in', 'tgbdragon2008@gmail.com'];

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      if (profile._json.hd !== 'nitc.ac.in') {
        return done(null, false, { message: 'Invalid domain' });
      }

      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        const userEmail = profile.emails[0].value;
        const assignedRole = authorizedAdmins.includes(userEmail) ? 'admin' : 'user';

        user = await User.create({
          googleId: profile.id,
          email: userEmail,
          name: profile.displayName,
          picture: profile.photos[0].value,
          role: assignedRole
        });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  hostedDomain: 'nitc.ac.in',
  session: false
}));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=domain', session: false }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user._id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    if (req.user.role === 'admin') {
      res.redirect('/issues.html');
    } else {
      res.redirect('/report.html');
    }
  }
);

app.get('/auth/verify', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ authenticated: false });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ authenticated: false });
    const redirectUrl = decoded.role === 'admin' ? '/issues.html' : '/report.html';
    res.status(200).json({ authenticated: true, redirectUrl });
  });
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});