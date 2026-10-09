require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // Serve HTML/JS from 'public' folder
app.use(passport.initialize());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));

    // User Schema & Model
    const userSchema = new mongoose.Schema({
      googleId: String,
        email: String,
          name: String,
            picture: String,
              role: { type: String, enum: ['user', 'admin'], default: 'user' }
              });
              const User = mongoose.model('User', userSchema);

              // Passport Google Strategy
              passport.use(new GoogleStrategy({
                  clientID: process.env.GOOGLE_CLIENT_ID,
                      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                          callbackURL: '/auth/google/callback'
                            },
                              async (accessToken, refreshToken, profile, done) => {
                                  try {
                                        // Backend Domain Verification (Failsafe)
                                              if (profile._json.hd !== 'nitc.ac.in') {
                                                      return done(null, false, { message: 'Invalid domain' });
                                                            }

                                                                  let user = await User.findOne({ googleId: profile.id });
                                                                        if (!user) {
                                                                                user = await User.create({
                                                                                          googleId: profile.id,
                                                                                                    email: profile.emails[0].value,
                                                                                                              name: profile.displayName,
                                                                                                                        picture: profile.photos[0].value,
                                                                                                                                  role: 'user' // Default. Admins are modified manually in DB.
                                                                                                                                          });
                                                                                                                                                }
                                                                                                                                                      return done(null, user);
                                                                                                                                                          } catch (err) {
                                                                                                                                                                return done(err, null);
                                                                                                                                                                    }
                                                                                                                                                                      }
                                                                                                                                                                      ));

                                                                                                                                                                      // --- Auth Routes ---

                                                                                                                                                                      // Trigger Google Login. hd parameter restricts UI to nitc.ac.in
                                                                                                                                                                      app.get('/auth/google', passport.authenticate('google', { 
                                                                                                                                                                        scope: ['profile', 'email'],
                                                                                                                                                                          hostedDomain: 'nitc.ac.in',
                                                                                                                                                                            session: false
                                                                                                                                                                            }));

                                                                                                                                                                            // Google Callback
                                                                                                                                                                            app.get('/auth/google/callback', 
                                                                                                                                                                              passport.authenticate('google', { failureRedirect: '/?error=domain', session: false }),
                                                                                                                                                                                (req, res) => {
                                                                                                                                                                                    // Generate JWT
                                                                                                                                                                                        const token = jwt.sign(
                                                                                                                                                                                              { id: req.user._id, role: req.user.role }, 
                                                                                                                                                                                                    process.env.JWT_SECRET, 
                                                                                                                                                                                                          { expiresIn: '7d' }
                                                                                                                                                                                                              );

                                                                                                                                                                                                                  // Set secure cookie to fix CSRF and XSS vulnerabilities
                                                                                                                                                                                                                      res.cookie('auth_token', token, {
                                                                                                                                                                                                                            httpOnly: true,
                                                                                                                                                                                                                                  secure: process.env.NODE_ENV === 'production', // Requires HTTPS in prod
                                                                                                                                                                                                                                        sameSite: 'strict',
                                                                                                                                                                                                                                              maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
                                                                                                                                                                                                                                                  });

                                                                                                                                                                                                                                                      // Role-based routing
                                                                                                                                                                                                                                                          if (req.user.role === 'admin') {
                                                                                                                                                                                                                                                                res.redirect('/issues.html'); // Placeholder for Admin dashboard
                                                                                                                                                                                                                                                                    } else {
                                                                                                                                                                                                                                                                          res.redirect('/report.html'); // Placeholder for User dashboard
                                                                                                                                                                                                                                                                              }
                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                );

                                                                                                                                                                                                                                                                                // Verify Endpoint (Solves HttpOnly contradiction)
                                                                                                                                                                                                                                                                                app.get('/auth/verify', (req, res) => {
                                                                                                                                                                                                                                                                                  const token = req.cookies.auth_token;
                                                                                                                                                                                                                                                                                    if (!token) return res.status(401).json({ authenticated: false });

                                                                                                                                                                                                                                                                                      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                                                                                                                                                                                                                                                                                          if (err) return res.status(401).json({ authenticated: false });
                                                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                                                  // Return routing directive so frontend knows where to auto-redirect
                                                                                                                                                                                                                                                                                                      const redirectUrl = decoded.role === 'admin' ? '/issues.html' : '/report.html';
                                                                                                                                                                                                                                                                                                          res.status(200).json({ authenticated: true, redirectUrl });
                                                                                                                                                                                                                                                                                                            });
                                                                                                                                                                                                                                                                                                            });

                                                                                                                                                                                                                                                                                                            app.listen(process.env.PORT, () => {
                                                                                                                                                                                                                                                                                                              console.log(`Server running on http://localhost:${process.env.PORT}`);
                                                                                                                                                                                                                                                                                                              });
                                                                                                                                                                                                                                                                                                              