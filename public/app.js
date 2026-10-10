document.addEventListener('DOMContentLoaded', async () => {

  // Global Theme Setup
  if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-theme');
  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // Daily Quote Logic (Global & Dynamic via API)
  const dailyQuoteMarquee = document.getElementById('daily-quote-marquee');
  if (dailyQuoteMarquee) {
    const today = new Date().toDateString();
    const storedQuote = localStorage.getItem('dailyQuote');
    const storedDate = localStorage.getItem('dailyQuoteDate');

    // If we already fetched a quote today, use it. Otherwise, fetch a new one!
    if (storedDate === today && storedQuote) {
      dailyQuoteMarquee.textContent = "🌍 Quote of the Day: " + storedQuote;
    } else {
      fetch('https://dummyjson.com/quotes/random')
        .then(res => res.json())
        .then(data => {
          const quoteText = `“${data.quote}” — ${data.author}`;
          localStorage.setItem('dailyQuote', quoteText);
          localStorage.setItem('dailyQuoteDate', today);
          dailyQuoteMarquee.textContent = "🌍 Quote of the Day: " + quoteText;
        })
        .catch(err => {
          console.error("Failed to fetch quote:", err);
          const fallback = "“The Earth is what we all have in common.” — Wendell Berry";
          dailyQuoteMarquee.textContent = "🌍 Quote of the Day: " + fallback;
        });
    }
  }

  // Modal Overlay Interactions
  window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none'; });
  document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.modal-overlay').style.display = 'none'));
  const setupModal = (btnId, modalId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', () => document.getElementById(modalId).style.display = 'flex');
  };
  setupModal('btn-help', 'modal-help');
  setupModal('btn-settings', 'modal-settings');

  // --- Phase 1: Login Check & Rotating Backgrounds ---
  if (!document.querySelector('.dashboard-body') && !document.querySelector('.admin-body')) {
    
    // Rotating Backgrounds for Login Page
    const bgs = [
      'url("https://upload.wikimedia.org/wikipedia/commons/e/e4/NIT_Calicut_Main_Building.jpg")',
      'url("https://images.shiksha.com/mediadata/images/1572506240phpLp1vL8.jpeg")',
      'url("https://www.nitc.ac.in/xc-assets/images/header/image-1.jpg")'
    ];
    let bgIndex = 0;
    setInterval(() => {
      bgIndex = (bgIndex + 1) % bgs.length;
      document.body.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), ${bgs[bgIndex]}`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center center';
    }, 6000);

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
        mediaUpload.value = '';
      });

      window.removeUploadedFile = async (index) => {
        const urlToRemove = uploadedFiles[index];
        uploadedFiles.splice(index, 1);
        updatePreviewAndInput();
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlToRemove })
          });
        } catch (err) { console.error('Failed to delete file on server', err); }
      };

      function updatePreviewAndInput() {
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
      const category = document.getElementById('issue-category').value;
      const urgency = document.getElementById('issue-urgency').value;
      const position = marker.getLatLng();

      try {
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoUrl,
            description,
            category,
            urgency,
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
    let allUserIssues = [];

    const renderMyIssues = (filterVal = 'All') => {
      const list = document.getElementById('my-issues-list');
      list.innerHTML = '';

      let filteredIssues = allUserIssues;
      if (filterVal !== 'All') {
          filteredIssues = allUserIssues.filter(i => i.status === filterVal);
      }

      if(filteredIssues.length === 0) return list.innerHTML = '<p>No issues found for this filter.</p>';

      filteredIssues.forEach((issue, index) => {
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

        // Rating UI if Closed
        let ratingHtml = '';
        if (issue.status === 'Closed') {
            if (issue.rating > 0) {
                ratingHtml = `<div style="margin-top: 10px; font-size: 13px; color: var(--primary-color);">You rated this resolution: <strong>${issue.rating} / 5 Stars</strong></div>`;
            } else {
                ratingHtml = `
                <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.02); border: 1px solid var(--border-color); border-radius: 6px;">
                  <label style="font-size:12px; display:block; margin-bottom:5px;">Rate Resolution Quality:</label>
                  <div style="display:flex; gap: 5px;">
                    <select class="issue-rating-select" style="padding: 4px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-color);">
                      <option value="5">5 - Excellent</option>
                      <option value="4">4 - Good</option>
                      <option value="3">3 - Average</option>
                      <option value="2">2 - Poor</option>
                      <option value="1">1 - Terrible</option>
                    </select>
                    <button class="btn-primary rate-submit-btn" data-id="${issue._id}" style="padding: 4px 12px;">Submit Rating</button>
                  </div>
                </div>`;
            }
        }

        list.innerHTML += `
        <div class="track-card">
          <img src="${issue.photoUrl.split(',')[0]}" alt="Thumbnail">
          <div class="track-details">
            <h4>Serial No.: ${index + 1} <span style="font-size:12px; color: #666; font-weight:normal; float:right;">${issue.category || 'Other'}</span></h4>
            <h4>Reported on: ${new Date(issue.createdAt).toLocaleDateString()}</h4>
            <p>${issue.description}</p>
            ${timelineHtml}
            ${remarksHtml}
            ${ratingHtml}
          </div>
        </div>`;
      });

      // Attach Rating Event Listeners
      document.querySelectorAll('.rate-submit-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
              const issueId = e.target.dataset.id;
              const selectEl = e.target.previousElementSibling;
              const rating = selectEl.value;
              try {
                  const res = await fetch(`/api/reports/${issueId}/rate`, {
                      method: 'PUT',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ rating })
                  });
                  if (res.ok) {
                      alert('Thank you for your feedback!');
                      fetchMyIssues(); // Refresh list to hide the dropdown and show the score
                  }
              } catch (err) { console.error('Rating failed', err); }
          });
      });
    };

    const fetchMyIssues = async () => {
      try {
        const res = await fetch('/api/reports/my-issues');
        allUserIssues = await res.json();
        const filterVal = document.getElementById('status-filter').value;
        renderMyIssues(filterVal);
      } catch (err) { console.error(err); }
    };
    fetchMyIssues();

    document.getElementById('status-filter')?.addEventListener('change', (e) => renderMyIssues(e.target.value));
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
        const closedReportsList = document.getElementById('closed-reports-list');

        colPending.innerHTML = ''; colActive.innerHTML = ''; colClosed.innerHTML = '';
        if (closedReportsList) closedReportsList.innerHTML = '';

        allAdminIssues = issues; // Save issues to state for the modal
        let totalTime = 0;
        let closedCount = 0;

        issues.forEach(issue => {
          const uName = issue.userId?.anonymityEnabled ? 'Anonymous' : (issue.userId?.name || 'Unknown');
          const card = document.createElement('div');
          card.className = `issue-card status-${issue.status.replace(' ', '')}`;
          card.innerHTML = `
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 5px;">
              <span class="status-badge status-${issue.status.replace(' ', '')}">${issue.status}</span>
              <span style="font-size:10px; color:#fff; background:${issue.urgency==='Critical'?'#c62828':issue.urgency==='High'?'#f57c00':issue.urgency==='Medium'?'#fbc02d':'#4caf50'}; padding: 3px 6px; border-radius: 4px; font-weight:bold;">${issue.urgency}</span>
            </div>
            <img src="${issue.photoUrl.split(',')[0]}" alt="Issue Photo">
            <h4 style="margin-bottom: 2px;">${issue.category || 'Other'}</h4>
            <p style="font-size:11px; margin-bottom: 5px; color:#888;">Reported by: ${uName}</p>
            <p>${issue.description}</p>
            <button type="button" class="btn-secondary view-details-btn" data-id="${issue._id}" style="width: 100%; padding: 6px; margin: 8px 0; font-size: 13px;">View Map & Full Media</button>
            <div class="issue-actions" data-id="${issue._id}">
              ${generateAdminControls(issue.status)}
            </div>
          `;

          if (issue.status === 'Pending') colPending.appendChild(card);
          else if (['Accepted', 'Team Dispatched', 'In Progress'].includes(issue.status)) colActive.appendChild(card);
          else colClosed.appendChild(card);

          // Populate the new Admin Overview Page with completed tracking
          if (issue.status === 'Closed' && closedReportsList) {
             let timeText = 'Unknown time (legacy)';
             if (issue.closedAt && issue.createdAt) {
                 const diff = new Date(issue.closedAt) - new Date(issue.createdAt);
                 const hours = Math.floor(diff / (1000 * 60 * 60));
                 const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                 timeText = `${hours}h ${minutes}m`;
                 totalTime += diff;
                 closedCount++;
             }

             const archiveCard = document.createElement('div');
             archiveCard.className = `issue-card status-Closed`;
             archiveCard.innerHTML = `
                <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                  <span class="status-badge status-Closed">Closed</span>
                  <span style="font-size:12px; color:#666;"><i class="ph ph-clock"></i> Res. Time: <strong>${timeText}</strong></span>
                </div>
                <h4>Reported by: ${uName}</h4>
                <p style="margin-bottom: 8px;">${issue.description}</p>
                <div style="background:#e8f5e9; padding: 8px; border-radius: 4px; font-size:13px; color:#1b5e20; margin-bottom: 5px;">
                  <strong>Remarks:</strong> ${issue.closingRemarks || 'No remarks provided'}
                </div>
                ${issue.rating > 0 ? `<div style="font-size: 12px; color: var(--primary-color);">Citizen Rating: <strong>${issue.rating} / 5</strong></div>` : ''}
             `;
             closedReportsList.appendChild(archiveCard);
          }
        });

        // Generate Metrics Component
        const overviewStats = document.getElementById('overview-stats');
        if (overviewStats) {
            if (closedCount > 0) {
                const avgDiff = totalTime / closedCount;
                const avgHours = Math.floor(avgDiff / (1000 * 60 * 60));
                const avgMins = Math.floor((avgDiff % (1000 * 60 * 60)) / (1000 * 60));
                overviewStats.innerHTML = `
                <div class="cta-card secondary" style="padding: 20px; text-align: left; display: flex; align-items: center; gap: 20px;">
                    <i class="ph ph-chart-line-up" style="font-size: 40px; margin:0;"></i>
                    <div>
                      <h4 style="margin:0; font-size: 16px; color: #666;">Average Resolution Time</h4>
                      <h2 style="margin: 5px 0 0 0; font-size: 28px; color: var(--text-color);">${avgHours}h ${avgMins}m</h2>
                      <p style="margin: 5px 0 0 0; font-size:13px; color:#888;">Based on ${closedCount} successfully tracked closed tickets.</p>
                    </div>
                </div>`;
            } else {
                overviewStats.innerHTML = `<p style="color:#666;">No valid closed tickets available to calculate analytics.</p>`;
            }
        }

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
            document.getElementById('detail-category').textContent = issue.category || 'Other';
            document.getElementById('detail-urgency').textContent = issue.urgency || 'Low';

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
    
    // -- Admin Export CSV Feature --
    document.getElementById('export-csv')?.addEventListener('click', () => {
        if(!allAdminIssues || !allAdminIssues.length) return alert('No data available to export.');
        let csvContent = "data:text/csv;charset=utf-8,";
        // CSV Header
        csvContent += "ID,Reporter Name,Category,Urgency,Status,CreatedAt,ClosedAt,User Rating (1-5),Closing Remarks\n";
        
        allAdminIssues.forEach(i => {
            let reporter = i.userId?.name || 'Anonymous';
            let remarks = i.closingRemarks ? i.closingRemarks.replace(/,/g, " ") : "None";
            let cAt = new Date(i.createdAt).toISOString();
            let dAt = i.closedAt ? new Date(i.closedAt).toISOString() : "Not Closed";
            
            let row = `${i._id},${reporter},${i.category || 'Other'},${i.urgency || 'Low'},${i.status},${cAt},${dAt},${i.rating || 0},${remarks}`;
            csvContent += row + "\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `nitc_reports_export_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    });

    fetchAdminIssues();

    // -- Admin Profile & Settings Handling --
    const loadAdminProfile = async () => {
      try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
          const user = await res.json();
          document.getElementById('admin-display-name').textContent = user.name || 'Admin';
          const avatar = document.getElementById('admin-avatar');
          if (avatar) avatar.src = user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name);
          const nameInput = document.getElementById('admin-edit-name');
          if (nameInput) nameInput.value = user.name || '';
          const deptInput = document.getElementById('admin-edit-dept');
          if (deptInput) deptInput.value = user.department || '';
        }
      } catch (err) { console.error('Failed to load admin profile', err); }
    };
    loadAdminProfile();

    document.getElementById('save-admin-profile')?.addEventListener('click', async () => {
      const name = document.getElementById('admin-edit-name').value;
      const dept = document.getElementById('admin-edit-dept').value;
      try {
        const res = await fetch('/api/user/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, department: dept }) });
        if (res.ok) { alert('Admin Profile updated successfully!'); loadAdminProfile(); }
      } catch (err) { console.error('Failed to update admin profile', err); }
    });

    document.getElementById('toggle-theme-admin')?.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });

    document.getElementById('toggle-fullscreen-admin')?.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.log(err));
      else document.exitFullscreen();
    });
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

        if (res.ok && data.reply) {
          chatLog.innerHTML += `<div class="chat-bubble ai-msg">${data.reply}</div>`;
        } else {
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