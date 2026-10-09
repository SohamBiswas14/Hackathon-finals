document.addEventListener('DOMContentLoaded', async () => {

  // Global Theme Setup
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // Modal Overlay Interactions
  window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none'; });
  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.modal-overlay').style.display = 'none'));
  const setupModal = (btnId, modalId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => document.getElementById(modalId).style.display = 'flex');
  };
  setupModal('btn-help', 'modal-help');
  setupModal('btn-settings', 'modal-settings');

  // --- Phase 1: Login Check ---
  if (!document.querySelector('.dashboard-body') && !document.querySelector('.admin-body')) {
    if (new URLSearchParams(window.location.search).get('error') === 'domain') {
      document.getElementById('error-msg').style.display = 'block';
      window.history.replaceState({}, document.title, '/');
    }
    fetch('/auth/verify').then(res => res.json()).then(data => {
      if (data.authenticated) window.location.href = data.redirectUrl;
    }).catch(console.error);
    setupModal('info-toggle', 'info-modal');
  }

  // --- Phase 2: Main User Dashboard Specifics ---
  if (document.querySelector('.dashboard-body') && !document.querySelector('.report-action-body') && !document.querySelector('.track-body') && !document.querySelector('.contributions-body')) {

    async function loadProfile() {
      try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
          const user = await res.json();
          document.getElementById('user-name').textContent = user.name || 'Student';
          document.getElementById('user-avatar').src = user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name);
          document.getElementById('user-dept').textContent = user.department || 'Not Specified';
          document.getElementById('user-score').textContent = user.totalReports ?? 0;
          document.getElementById('edit-name').value = user.name || '';
          document.getElementById('edit-dept').value = user.department || '';
          document.getElementById('edit-anon').checked = Boolean(user.anonymityEnabled);
        }
      } catch (err) { console.error('Failed to load profile', err); }
    }
    loadProfile();

    document.getElementById('save-profile')?.addEventListener('click', async () => {
      const name = document.getElementById('edit-name').value;
      const dept = document.getElementById('edit-dept').value;
      const anon = document.getElementById('edit-anon').checked;
      try {
        const res = await fetch('/api/user/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, department: dept, anonymityEnabled: anon }) });
        if(res.ok) { document.getElementById('modal-profile').style.display = 'none'; loadProfile(); }
      } catch (err) { console.error('Failed to update', err); }
    });
    setupModal('btn-profile', 'modal-profile');

    document.getElementById('toggle-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.log(err));
      else document.exitFullscreen();
    });
  }

 // --- Phase 5: Reporting Form & Leaflet GPS Map ---
  if (document.querySelector('.report-action-body')) {
    // Initialize map centered at NITC by default
    let defaultCoords = [11.3216, 75.9336];
    let map = L.map('map').setView(defaultCoords, 15);

    // CHANGED: Using Esri World Street Map tiles which are free, reliable, and do not require an API key
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
      maxZoom: 19
    }).addTo(map);

    let marker = L.marker(defaultCoords, { draggable: true }).addTo(map);

    // Try to get precise location
    document.getElementById('get-location-btn').addEventListener('click', () => {
      if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const newCoords = [pos.coords.latitude, pos.coords.longitude];
          map.setView(newCoords, 17);
          marker.setLatLng(newCoords);
        }, () => alert("Please allow location access in your browser."));
      }
    });
// Handle Local File Uploads (Photos & Videos)
    const mediaUpload = document.getElementById('media-upload');
    const btnUploadMedia = document.getElementById('btn-upload-media');
    const photoUrlInput = document.getElementById('photo-url');
    const uploadStatus = document.getElementById('upload-status');
    const previewContainer = document.getElementById('media-preview-container');

    // Array to track all uploaded file URLs
    let uploadedFiles = [];

    if (btnUploadMedia && mediaUpload) {
      btnUploadMedia.addEventListener('click', () => mediaUpload.click());

      mediaUpload.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;

        uploadStatus.textContent = 'Uploading... Please wait.';
        uploadStatus.style.color = 'var(--accent-color)';

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append('media', files[i]);
        }

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            // Append new files to our array
            uploadedFiles = uploadedFiles.concat(data.urls);
            updatePreviewAndInput();

            uploadStatus.textContent = 'Files uploaded successfully!';
            uploadStatus.style.color = 'var(--primary-color)';
          } else {
            uploadStatus.textContent = 'Upload failed. Please try again.';
            uploadStatus.style.color = 'red';
          }
        } catch (err) {
          console.error(err);
          uploadStatus.textContent = 'Error connecting to server for upload.';
          uploadStatus.style.color = 'red';
        }

        // Reset file input so the user can select the same file again if they deleted it
        mediaUpload.value = '';
      });

      // Global function to remove a file when the 'X' button is clicked
      window.removeUploadedFile = async (index) => {
        const urlToRemove = uploadedFiles[index];

        // Remove from UI array instantly
        uploadedFiles.splice(index, 1);
        updatePreviewAndInput();

        // Tell backend to delete the file from the server
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlToRemove })
          });
        } catch (err) { console.error('Failed to delete file on server', err); }
      };

      // Function to render the UI previews and update the hidden text box
      function updatePreviewAndInput() {
        // We store the URLs as a comma-separated list in the hidden database input
        photoUrlInput.value = uploadedFiles.join(',');

        previewContainer.innerHTML = '';
        uploadedFiles.forEach((url, index) => {
          const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
          const mediaTag = isVideo
            ? `<video src="${url}" muted autoplay loop></video>`
            : `<img src="${url}" alt="Preview">`;

          previewContainer.innerHTML += `
            <div class="preview-item">
              ${mediaTag}
              <button type="button" class="delete-preview-btn" onclick="removeUploadedFile(${index})" title="Remove file"><i class="ph ph-x"></i></button>
            </div>
          `;
        });
      }
    }
    // Handle Form Submit
    document.getElementById('issue-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const photoUrl = document.getElementById('photo-url').value;
      const description = document.getElementById('issue-desc').value;
      const position = marker.getLatLng();

      try {
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrl,
            description,
            lat: position.lat,
            lng: position.lng
          })
        });
        if(res.ok) window.location.href = '/track.html'; // redirect on success
        else alert("Failed to submit issue.");
      } catch(err) { console.error(err); }
    });
  }

  // --- Phase 4: User Issue Tracking List ---
  if (document.querySelector('.track-body')) {
    const fetchMyIssues = async () => {
      try {
        const res = await fetch('/api/reports/my-issues');
        const issues = await res.json();
        const list = document.getElementById('my-issues-list');
        list.innerHTML = '';

        if(issues.length === 0) return list.innerHTML = '<p>No issues reported yet.</p>';

       issues.forEach((issue, index) => {
          const states = ['Pending', 'Accepted', 'Team Dispatched', 'In Progress', 'Closed'];
          const currentIndex = states.indexOf(issue.status);

          let timelineHtml = `<div class="timeline-bar">`;
          states.forEach((s, idx) => {
            if(issue.status === 'Declined') timelineHtml += `<div class="timeline-step ${s==='Pending'?'active':''}" data-label="${s}"></div>`;
            else timelineHtml += `<div class="timeline-step ${idx <= currentIndex ? 'active' : ''}" data-label="${s}"></div>`;
          });
          timelineHtml += `</div>`;

          let remarksHtml = '';
          if (issue.status === 'Closed' && issue.closingRemarks) remarksHtml = `<div class="track-remarks"><strong>Resolution:</strong> ${issue.closingRemarks}</div>`;
          if (issue.status === 'Declined') remarksHtml = `<div class="track-remarks" style="background:#ffebee; color:#c62828;">Issue Declined by Management</div>`;

         list.innerHTML += `
  <div class="track-card">
    <img src="${issue.photoUrl.split(',')[0]}" alt="Thumbnail">
    <div class="track-details">
      <h4>Serial No.: ${index + 1}</h4>
      <h4>Reported on: ${new Date(issue.createdAt).toLocaleDateString()}</h4>
      <p>${issue.description}</p>
      ${timelineHtml}
      ${remarksHtml}
    </div>
  </div>`;
        });
      } catch (err) { console.error(err); }
    };
    fetchMyIssues();
  }

  // --- Phase 5: Contributions & Gamification ---
  if (document.querySelector('.contributions-body')) {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        const leaders = await res.json();
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';

        if(leaders.length === 0) return list.innerHTML = '<p style="text-align:center;">No reports filed yet. Be the first!</p>';

        leaders.forEach((user, index) => {
          const displayName = user.anonymityEnabled ? "Anonymous Citizen" : user.name;
          const displayPic = user.anonymityEnabled ? "https://ui-avatars.com/api/?name=Anon&background=random" : user.picture;
          const dept = user.anonymityEnabled ? "Hidden" : (user.department || "Not Specified");

          list.innerHTML += `
            <div class="leader-card">
              <div class="leader-info">
                <h2>#${index + 1}</h2>
                <img src="${displayPic}" alt="Avatar">
                <div>
                  <h4>${displayName}</h4>
                  <small style="color: #777;">${dept}</small>
                </div>
              </div>
              <div class="leader-score">
                <i class="ph ph-leaf"></i> ${user.totalReports}
              </div>
            </div>`;
        });
      } catch(err) { console.error(err); }
    };
    fetchLeaderboard();
  }

  // --- Phase 3 & 4: Admin Management Logic ---
  if (document.querySelector('.admin-body')) {
    let allAdminIssues = [];
    let adminMap = null;
    let adminMarker = null;

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.style.display = 'none');
        e.currentTarget.classList.add('active');
        document.getElementById(e.currentTarget.dataset.target).style.display = 'block';
      });
    });

    const fetchAdminIssues = async () => {
      try {
        const res = await fetch('/api/reports');
        if (!res.ok) { if(res.status === 403) window.location.href = '/report.html'; return; }
        const issues = await res.json();

        const colPending = document.getElementById('col-pending');
        const colActive = document.getElementById('col-active');
        const colClosed = document.getElementById('col-closed');

        colPending.innerHTML = ''; colActive.innerHTML = ''; colClosed.innerHTML = '';

        allAdminIssues = issues; // Save issues to state for the modal

        issues.forEach(issue => {
          const uName = issue.userId?.anonymityEnabled ? 'Anonymous' : (issue.userId?.name || 'Unknown');
          const card = document.createElement('div');
          card.className = `issue-card status-${issue.status.replace(' ', '')}`;
          card.innerHTML = `
            <span class="status-badge status-${issue.status.replace(' ', '')}">${issue.status}</span>
            <img src="${issue.photoUrl.split(',')[0]}" alt="Issue Photo">
            <h4>Reported by: ${uName}</h4>
            <p>${issue.description}</p>
            <button type="button" class="btn-secondary view-details-btn" data-id="${issue._id}" style="width: 100%; padding: 6px; margin: 8px 0; font-size: 13px;">View Map & Full Media</button>
            <div class="issue-actions" data-id="${issue._id}">
              ${generateAdminControls(issue.status)}
            </div>
          `;

          if (issue.status === 'Pending') colPending.appendChild(card);
          else if (['Accepted', 'Team Dispatched', 'In Progress'].includes(issue.status)) colActive.appendChild(card);
          else colClosed.appendChild(card);
        });

        attachAdminActionListeners();

        // Attach logic to the new "View Details" buttons
        document.querySelectorAll('.view-details-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const issueId = e.target.dataset.id;
            const issue = allAdminIssues.find(i => i._id === issueId);
            if(!issue) return;

            const uName = issue.userId?.anonymityEnabled ? 'Anonymous Citizen' : (issue.userId?.name || 'Unknown User');
            document.getElementById('detail-reporter').textContent = uName;
            document.getElementById('detail-description').textContent = issue.description;

            // Show closing remarks if closed
            const remarksContainer = document.getElementById('detail-remarks-container');
            if (issue.status === 'Closed' && issue.closingRemarks) {
              document.getElementById('detail-remarks').textContent = issue.closingRemarks;
              remarksContainer.style.display = 'block';
            } else {
              remarksContainer.style.display = 'none';
            }

            // Populate Media Gallery
            const mediaContainer = document.getElementById('detail-media-gallery');
            mediaContainer.innerHTML = '';
            const urls = issue.photoUrl.split(',');
            urls.forEach(url => {
              if(!url) return;
              const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
              if(isVideo) {
                mediaContainer.innerHTML += `<video src="${url}" controls style="height: 150px; border-radius: 6px; flex-shrink: 0; background: black;"></video>`;
              } else {
                mediaContainer.innerHTML += `<a href="${url}" target="_blank"><img src="${url}" style="height: 150px; border-radius: 6px; flex-shrink: 0; cursor: pointer; border: 1px solid var(--border-color);"></a>`;
              }
            });

            // Show modal
            document.getElementById('modal-issue-details').style.display = 'flex';

            // Initialize or update Map
            setTimeout(() => {
              const coords = [issue.location.lat, issue.location.lng];
              if(!adminMap) {
                adminMap = L.map('detail-map').setView(coords, 17);
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                  attribution: 'Tiles &copy; Esri', maxZoom: 19
                }).addTo(adminMap);
                adminMarker = L.marker(coords).addTo(adminMap);
              } else {
                adminMap.setView(coords, 17);
                adminMarker.setLatLng(coords);
                adminMap.invalidateSize(); // Fixes map rendering glitch inside modals
              }
            }, 100);
          });
        });

      } catch (err) { console.error('Admin Fetch Error:', err); }
    };

    const generateAdminControls = (status) => {
      if (status === 'Pending') return `<button class="btn-accept">Accept</button> <button class="btn-decline">Decline</button>`;
      if (['Accepted', 'Team Dispatched', 'In Progress'].includes(status)) {
        return `
          <select class="status-dropdown">
            <option value="Accepted" ${status==='Accepted'?'selected':''}>Accepted</option>
            <option value="Team Dispatched" ${status==='Team Dispatched'?'selected':''}>Team Dispatched</option>
            <option value="In Progress" ${status==='In Progress'?'selected':''}>In Progress</option>
            <option value="Closed">Close Issue</option>
          </select>
        `;
      }
      return `<em>Archived</em>`;
    };

    const updateIssueStatus = async (id, status, closingRemarks = null) => {
      await fetch(`/api/reports/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, closingRemarks })
      });
      fetchAdminIssues();
    };

    const attachAdminActionListeners = () => {
      document.querySelectorAll('.btn-accept').forEach(btn => btn.addEventListener('click', (e) => updateIssueStatus(e.target.parentElement.dataset.id, 'Accepted')));
      document.querySelectorAll('.btn-decline').forEach(btn => btn.addEventListener('click', (e) => updateIssueStatus(e.target.parentElement.dataset.id, 'Declined')));
      document.querySelectorAll('.status-dropdown').forEach(sel => sel.addEventListener('change', (e) => {
        const status = e.target.value;
        const id = e.target.parentElement.dataset.id;
        if (status === 'Closed') {
          document.getElementById('modal-close-issue').style.display = 'flex';
          document.getElementById('close-issue-id').value = id;
          e.target.value = e.target.options[0].value;
        } else {
          updateIssueStatus(id, status);
        }
      }));
    };

    document.getElementById('submit-close-issue')?.addEventListener('click', () => {
      const remarks = document.getElementById('close-remarks').value.trim();
      const id = document.getElementById('close-issue-id').value;
      if (!remarks) return alert("Closing remarks are mandatory!");
      updateIssueStatus(id, 'Closed', remarks);
      document.getElementById('modal-close-issue').style.display = 'none';
      document.getElementById('close-remarks').value = '';
    });

    document.getElementById('refresh-issues')?.addEventListener('click', fetchAdminIssues);
    fetchAdminIssues();
  }

  // --- Shared Component: AI Chatbot ---
  const chatFab = document.getElementById('chat-fab');
  const chatWindow = document.getElementById('chat-window');
  if (chatFab && chatWindow) {
    chatFab.addEventListener('click', () => chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none');

    const chatInput = document.getElementById('chat-input');
    const chatLog = document.getElementById('chat-log');

    const sendMessage = async () => {
      const text = chatInput.value.trim();
      if (!text) return;
      chatLog.innerHTML += `<div class="chat-bubble user-msg">${text}</div>`;
      chatInput.value = '';
      chatLog.scrollTop = chatLog.scrollHeight;

      const typing = document.createElement('div'); typing.className = 'chat-bubble ai-msg'; typing.textContent = 'Thinking...';
      chatLog.appendChild(typing);

      try {
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
        const data = await res.json();
        chatLog.removeChild(typing);

        // Check if the server responded successfully before trying to print 'data.reply'
        if (res.ok && data.reply) {
          chatLog.innerHTML += `<div class="chat-bubble ai-msg">${data.reply}</div>`;
        } else {
          // If there is an error, print the error message instead of 'undefined'
          chatLog.innerHTML += `<div class="chat-bubble ai-msg error">${data.error || 'Connection error.'}</div>`;
        }
      } catch (err) {
        chatLog.removeChild(typing);
        chatLog.innerHTML += `<div class="chat-bubble ai-msg error">Connection error.</div>`;
      }
    };

    document.getElementById('chat-send')?.addEventListener('click', sendMessage);
    chatInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
  }

});