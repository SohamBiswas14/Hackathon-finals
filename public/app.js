document.addEventListener('DOMContentLoaded', async () => {
  // === PHASE 1: Login & Auto-Redirect Logic ===
  if (!document.querySelector('.dashboard-body')) {
    const urlParams = new URLSearchParams(window.location.search);
    const errorMessage = document.getElementById('error-msg');

    // Handle Auth Errors
    if (urlParams.get('error') === 'domain' && errorMessage) {
      errorMessage.style.display = 'block';
      window.history.replaceState({}, document.title, '/');
    }

    // Auto-login Verification
    try {
      const response = await fetch('/auth/verify');
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.redirectUrl) {
          window.location.href = data.redirectUrl;
        }
      }
    } catch (error) {
      console.log('No valid session found, rendering login screen.');
    }

    // Setup Login Info Modal
    const infoToggle = document.getElementById('info-toggle');
    const modal = document.getElementById('info-modal');
    const closeBtn = document.getElementById('close-info-modal');

    if (infoToggle && modal) infoToggle.addEventListener('click', () => modal.style.display = 'flex');
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  }

  // === SYSTEM WIDE: Theme & Modals Overlay Clicks ===
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
  }

  window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay')) {
      event.target.style.display = 'none';
    }
  });


  // === PHASE 2: Dashboard Specific Logic ===
  if (document.querySelector('.dashboard-body')) {

    // 1. Fetch & Load Profile
    async function loadProfile() {
      try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
          const user = await res.json();
          // Update Display
          document.getElementById('user-name').textContent = user.name || 'Student';
          document.getElementById('user-avatar').src = user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name || 'NITC User');
          document.getElementById('user-dept').textContent = user.department || 'Not Specified';
          document.getElementById('user-score').textContent = user.totalReports ?? 0;

          // Update Modal Form Inputs
          document.getElementById('edit-name').value = user.name || '';
          document.getElementById('edit-dept').value = user.department || '';
          document.getElementById('edit-anon').checked = Boolean(user.anonymityEnabled);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      }
    }
    loadProfile();

    // 2. Profile Update Action
    document.getElementById('save-profile')?.addEventListener('click', async () => {
      const name = document.getElementById('edit-name').value;
      const dept = document.getElementById('edit-dept').value;
      const anon = document.getElementById('edit-anon').checked;

      try {
        const res = await fetch('/api/user/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, department: dept, anonymityEnabled: anon })
        });
        if(res.ok) {
          document.getElementById('modal-profile').style.display = 'none';
          loadProfile(); // Refresh header UI
        }
      } catch (err) {
        console.error('Failed to update profile', err);
      }
    });

    // 3. Modal Setup Utility
    const setupModal = (btnId, modalId) => {
      const btn = document.getElementById(btnId);
      const modal = document.getElementById(modalId);
      if (btn && modal) {
        btn.addEventListener('click', () => modal.style.display = 'flex');
        modal.querySelectorAll('.close-modal').forEach(closeBtn => {
          closeBtn.addEventListener('click', () => modal.style.display = 'none');
        });
      }
    };

    setupModal('btn-profile', 'modal-profile');
    setupModal('btn-settings', 'modal-settings');
    setupModal('btn-help', 'modal-help');

    // 4. System Settings Features
    document.getElementById('toggle-theme')?.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    document.getElementById('toggle-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.log(err));
      } else {
        document.exitFullscreen();
      }
    });

    // 5. AI Chatbot Logic
    const chatFab = document.getElementById('chat-fab');
    const chatWindow = document.getElementById('chat-window');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const chatLog = document.getElementById('chat-log');

    if (chatFab && chatWindow) {
      chatFab.addEventListener('click', () => {
        chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
      });
    }

    if (chatLog && chatInput && chatSend) {
      const appendMessage = (text, sender) => {
        const msg = document.createElement('div');
        msg.className = `chat-bubble ${sender}`;
        msg.textContent = text;
        chatLog.appendChild(msg);
        chatLog.scrollTop = chatLog.scrollHeight;
      };

      const sendMessage = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        appendMessage(text, 'user-msg');
        chatInput.value = '';

        // Typing indicator
        const typingMsg = document.createElement('div');
        typingMsg.className = 'chat-bubble ai-msg';
        typingMsg.textContent = 'Thinking...';
        chatLog.appendChild(typingMsg);

        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
          });
          const data = await res.json();
          chatLog.removeChild(typingMsg);
          appendMessage(data.reply, 'ai-msg');
        } catch (err) {
          chatLog.removeChild(typingMsg);
          appendMessage('Error connecting to support agent.', 'ai-msg error');
        }
      };

      chatSend.addEventListener('click', sendMessage);
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
      });
    }
  }
});