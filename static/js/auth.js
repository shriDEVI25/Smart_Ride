/* auth.js — Smart Ride auth session manager + login/register handlers */

(function () {
  // ── Persistent session IDs (legacy fallback for old rider/driver flow) ──
  if (!localStorage.getItem('rider_id')) {
    localStorage.setItem('rider_id', 'rider-' + Math.random().toString(36).slice(2, 10));
  }
  if (!localStorage.getItem('driver_id')) {
    localStorage.setItem('driver_id', 'driver-' + Math.random().toString(36).slice(2, 10));
  }

  window.getCurrentRiderId = function () {
    // Prefer authenticated user id when role is rider
    const role = localStorage.getItem('smart_ride_role');
    if (role === 'rider') return localStorage.getItem('smart_ride_user_id') || localStorage.getItem('rider_id');
    return localStorage.getItem('rider_id');
  };

  window.getCurrentDriverId = function () {
    const role = localStorage.getItem('smart_ride_role');
    if (role === 'driver') return localStorage.getItem('smart_ride_user_id') || localStorage.getItem('driver_id');
    return localStorage.getItem('driver_id');
  };

  // ── Auth helpers ──────────────────────────────────────────────────────────
  window.smartRideAuth = {
    saveSession: function (user) {
      localStorage.setItem('smart_ride_user_id', user.user_id || '');
      localStorage.setItem('smart_ride_full_name', user.full_name || '');
      localStorage.setItem('smart_ride_email', user.email || '');
      localStorage.setItem('smart_ride_role', user.role || '');
      if (user.gender) {
        localStorage.setItem('smart_ride_gender', user.gender);
      }
      // Also update the legacy id so rider.js / driver.js pick it up
      if (user.role === 'rider') localStorage.setItem('rider_id', user.user_id || '');
      if (user.role === 'driver') localStorage.setItem('driver_id', user.user_id || '');
    },
    clearSession: function () {
      ['smart_ride_user_id', 'smart_ride_full_name', 'smart_ride_email', 'smart_ride_role', 'smart_ride_gender'].forEach(function (k) {
        localStorage.removeItem(k);
      });
    },
    isLoggedIn: function () {
      return !!localStorage.getItem('smart_ride_user_id');
    },
    getFullName: function () {
      return localStorage.getItem('smart_ride_full_name') || '';
    },
    getRole: function () {
      return localStorage.getItem('smart_ride_role') || '';
    },
    getGender: function () {
      return localStorage.getItem('smart_ride_gender') || 'other';
    },
    logout: function () {
      this.clearSession();
      window.location.href = '/login';
    }
  };

  // ── Alert helper ──────────────────────────────────────────────────────────
  function showAuthAlert(msg, type) {
    var el = document.getElementById('authAlert');
    if (!el) return;
    el.textContent = msg;
    el.className = 'alert alert-' + (type || 'error');
    el.style.display = 'block';
  }

  function hideAuthAlert() {
    var el = document.getElementById('authAlert');
    if (el) el.style.display = 'none';
  }

  // ── Login form ────────────────────────────────────────────────────────────
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideAuthAlert();
      var btn = document.getElementById('loginBtn');
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;

      if (!email || !password) { showAuthAlert('Please enter your email and password.'); return; }

      btn.disabled = true;
      btn.textContent = 'Signing in…';

      try {
        var res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        var data = await res.json();
        if (data.success) {
          smartRideAuth.saveSession(data);
          window.location.href = data.redirect;
        } else {
          showAuthAlert(data.error || 'Login failed.');
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      } catch (err) {
        showAuthAlert('Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  // ── Register form ─────────────────────────────────────────────────────────
  var registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      hideAuthAlert();
      var btn = document.getElementById('registerBtn');
      var fullName = document.getElementById('fullName').value.trim();
      var email = document.getElementById('email').value.trim();
      var password = document.getElementById('password').value;
      var roleEl = document.querySelector('input[name="role"]:checked');
      var role = roleEl ? roleEl.value : '';
      var genderEl = document.querySelector('input[name="gender"]:checked');
      var gender = genderEl ? genderEl.value : 'other';

      if (!fullName || !email || !password || !role) {
        showAuthAlert('Please fill in all fields and select a role.');
        return;
      }
      if (password.length < 6) {
        showAuthAlert('Password must be at least 6 characters.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Creating account…';

      try {
        var res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ full_name: fullName, email, password, role, gender })
        });
        var data = await res.json();
        if (data.success) {
          smartRideAuth.saveSession(data);
          window.location.href = role === 'rider' ? '/rider' : '/driver';
        } else {
          showAuthAlert(data.error || 'Registration failed.');
          btn.disabled = false;
          btn.textContent = 'Create Account';
        }
      } catch (err) {
        showAuthAlert('Network error. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }
})();
