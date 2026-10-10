# NITC Cleanliness Portal

A comprehensive, community-driven platform designed to empower students and faculty at the National Institute of Technology Calicut (NITC) to report, track, and resolve cleanliness and environmental hazards on campus.

## The Problem Statement

**Alignment: Track 4: Civic Tech & Governance** – *Using technologies to improve public services, transparency, urban mobility, waste management, governance, and citizen engagement.*

Managing infrastructure, public services, and waste management across a sprawling campus municipality like NIT Calicut is a monumental task. When a pipe bursts, waste piles up, or an environmental hazard occurs, the traditional reporting process is often fragmented and opaque. Campus citizens lack a direct, trackable way to alert authorities, which stifles active citizen engagement. Simultaneously, campus governance and management lack precise location data, priority sorting, and visual context for these issues, leading to delayed response times, inefficient resource allocation, and a lack of transparency in how public services are maintained.

## Proposed Solution

The **NITC Cleanliness Portal** bridges the gap between the campus community and management. It provides a seamless, mobile-friendly interface for students and staff to instantly report issues by uploading multiple photos or videos, tagging the issue category (e.g., Waste Management, Plumbing), assigning urgency levels, and pinpointing the exact GPS coordinates. For authorities, it acts as a centralized command center with a Kanban-style triage board, ensuring every reported issue is categorized, assigned, and resolved transparently.

## Key Features

* **Precision Reporting & Multimedia:** Users can submit issues with up to 5 photos or videos, categorized tags, urgency levels, and exact GPS locations via an interactive map interface powered by Leaflet.

* **Real-Time Tracking & User Feedback:** A visual timeline allows users to track their tickets from *Pending* to *Closed*, view official resolution remarks, and rate the quality of the resolution (1-5 stars) upon completion.

* **Admin Kanban Dashboard & Analytics:** A dedicated portal for authorized management personnel to triage reports. Includes an Analytics Overview for average resolution times and a one-click CSV Export feature for data auditing.

* **Civic Leaderboard & Gamification:** A dynamic tier-based ranking system (Seedling, Ranger, Eco-Guardian, Campus Champion) encourages community participation by tracking the number of valid reports submitted by each user.

* **Dual-Role AI Support Assistant:** An integrated, context-aware chatbot (powered by Google Gemini 1.5 Flash) with distinct training for users (navigating reports) and admins (managing triage). It includes a robust offline fallback mode if API connection drops.

* **Environmental "Eco-Feed" & Daily Quote:** A live feed displays recently resolved campus issues to highlight management's active efforts, paired with a daily environmental quote fetched dynamically.

## User Experience & Interface Compatibility

The platform is engineered with a strict focus on modern UX principles, ensuring it is highly intuitive and accessible:

* **Fully Responsive Design:** The interface adapts flawlessly across devices. Mobile compatibility is critical for enabling on-the-go reporting and GPS data capture.

* **Dark Mode & Dynamic UI:** Built-in dark mode support, glassmorphism login overlays with rotating backgrounds, and custom scrollbars improve visual aesthetics and reduce eye strain.

* **Frictionless Onboarding:** By integrating with existing institutional Google accounts, the system bypasses tedious registration procedures, routing users directly to their actionable dashboard.

## Development Challenges & Bug Fixes

During the development lifecycle, several critical bugs were identified and successfully resolved to ensure a stable production environment:

1. **Authentication Routing Failures:** 
   * *Issue:* Upon successful Google OAuth login, the system failed to redirect users to their respective dashboards.
   * *Resolution:* Corrected the JWT token generation and verification middleware to ensure seamless redirection based on the user's explicit role (`user` vs. `admin`) directly from the callback route.

2. **AI Chatbot Integration & Context Drops:** 
   * *Issue:* The AI chatbot consistently failed to return responses on both the user and admin pages due to model deprecation and API connection timeouts.
   * *Resolution:* Upgraded the API integration to `gemini-1.5-flash` for stable responses and implemented a robust offline fallback mechanism. If the API fails, the backend intercepts the error and serves localized, context-aware instructions based on the user's role.

3. **UI Overlap & Z-Index Conflicts:** 
   * *Issue:* The globally fixed "Quote of the Day" footer intercepted click events, completely blocking users from clicking lower-screen elements like the "Logout" button.
   * *Resolution:* Applied `pointer-events: none` to the footer container, allowing physical clicks to pass through to the buttons beneath it, while adjusting overall body padding to prevent visual overlap.

4. **Session Persistence & Stale Cookies:** 
   * *Issue:* Logging out did not properly terminate the session. The browser retained stale cookies, automatically signing the user back into their previously used account without prompting for credentials.
   * *Resolution:* Implemented rigorous cookie clearing on the logout route and added `prompt: 'select_account'` to the Google Strategy configuration, forcing the OAuth screen to ask for account selection on every fresh login attempt.

5. **Domain-Restriction Blocking Authorized Admins:** 
   * *Issue:* The strict security policy limiting access to `@nitc.ac.in` domain emails inadvertently locked out external email addresses designated for system administrators.
   * *Resolution:* Modified the OAuth callback logic to evaluate incoming emails against an explicit array of `authorizedAdmins`. The system now successfully bypasses the institutional domain check for these specific administrative accounts.

## Security Architecture

* **Domain-Restricted OAuth:** Authentication is strictly limited to valid `@nitc.ac.in` Google accounts (and whitelisted admins), ensuring that only verified members can access the system.
* **Secure Session Management:** The application utilizes HTTP-only JSON Web Tokens (JWT) for stateless session management, mitigating the risk of cross-site scripting (XSS) attacks.
* **Role-Based Access Control (RBAC):** Rigorous backend middleware checks guarantee that administrative operations are restricted to pre-authorized management personnel.

## Scalability & Future Development

While currently optimized for NIT Calicut, the underlying architecture is designed for high scalability:

* **Multi-Tenant Expansion:** The database schema can be readily adapted into a multi-tenant architecture to support deployment across multiple universities globally.
* **Cloud-Native Infrastructure:** Built on a robust stack of Node.js, Express, and MongoDB Atlas, the backend is engineered to handle high volumes of concurrent requests and multimedia uploads.
* **Extensible API:** The modular, RESTful API design facilitates seamless integration of future enhancements, including dedicated mobile applications, webhooks for IoT waste-bin sensors, and automated maintenance dispatch systems.