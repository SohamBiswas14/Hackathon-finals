document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const errorMessage = document.getElementById('error-msg');

  if (urlParams.get('error') === 'domain') {
    errorMessage.style.display = 'block';
    window.history.replaceState({}, document.title, '/');
  }

  try {
    const response = await fetch('/auth/verify');

    if (response.ok) {
      const data = await response.json();

      if (data.authenticated) {
        window.location.href = data.redirectUrl;
      }
    }
  } catch (error) {
    console.log('No valid session found, rendering login screen.', error);
  }

  const infoToggle = document.getElementById('info-toggle');
  const modal = document.getElementById('info-modal');
  const closeButton = document.getElementById('close-modal');

  infoToggle.addEventListener('click', () => {
    modal.style.display = 'flex';
  });

  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
});
