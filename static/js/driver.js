// --- Leaflet Map Engine for Driver ---
let driverMap = null;
let driverPickupMarker = null;
let driverDropoffMarker = null;
let driverPolyline = null;

// Global driver state
let isOnline = true;
let activeTrip = null;

function createDriverCustomIcon(color) {
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: `<div style="
      background-color: ${color};
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 8px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

const driverGreenIcon = createDriverCustomIcon('#22c55e');
const driverRedIcon = createDriverCustomIcon('#ef4444');

function renderDriverMap(pLat, pLng, dLat, dLng, pickupText, dropoffText) {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  if (!driverMap) {
    driverMap = L.map('map').setView([pLat, pLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(driverMap);
  } else {
    driverMap.invalidateSize();
    driverMap.setView([pLat, pLng], 13);
    if (driverPickupMarker) driverMap.removeLayer(driverPickupMarker);
    if (driverDropoffMarker) driverMap.removeLayer(driverDropoffMarker);
    if (driverPolyline) driverMap.removeLayer(driverPolyline);
  }

  // Plot Pickup Marker with popup
  driverPickupMarker = L.marker([pLat, pLng], { icon: driverGreenIcon })
    .addTo(driverMap)
    .bindPopup(`<b>Pickup Location</b><br>${pickupText || (pLat + ', ' + pLng)}`)
    .openPopup();

  // Plot Dropoff Marker with popup
  driverDropoffMarker = L.marker([dLat, dLng], { icon: driverRedIcon })
    .addTo(driverMap)
    .bindPopup(`<b>Dropoff Location</b><br>${dropoffText || (dLat + ', ' + dLng)}`);

  // Connect route
  const latlngs = [[pLat, pLng], [dLat, dLng]];
  driverPolyline = L.polyline(latlngs, {
    color: '#10b981',
    weight: 4,
    opacity: 0.85,
    dashArray: '6, 6'
  }).addTo(driverMap);

  const bounds = L.latLngBounds([pLat, pLng], [dLat, dLng]);
  driverMap.fitBounds(bounds, { padding: [40, 40] });

  // Invalidate size to ensure container renders completely inside flex layout
  setTimeout(() => {
    if (driverMap) driverMap.invalidateSize();
  }, 250);
}


// Retrieve persistent driver ID from session auth
function getDriverId() {
  if (typeof getCurrentDriverId === 'function') {
    return getCurrentDriverId();
  }
  return localStorage.getItem('driver_id') || localStorage.getItem('smart_ride_driver_id') || 'driver-session-001';
}

// UI Alert Helper
function showAlert(message, type = 'info') {
  const alertEl = document.getElementById('driver-alert');
  alertEl.textContent = message;
  alertEl.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-info');
  alertEl.style.display = 'block';
}

function clearAlert() {
  const alertEl = document.getElementById('driver-alert');
  alertEl.style.display = 'none';
  alertEl.textContent = '';
}

// 1. Online / Offline Status Toggle
const toggleStatus = document.getElementById('driver-status-toggle');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

toggleStatus.addEventListener('change', (e) => {
  isOnline = e.target.checked;
  if (isOnline) {
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Online';
    fetchAvailableTrips();
    showAlert('You are online. Incoming rides will appear below.', 'info');
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Offline';
    document.getElementById('trips-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💤</div>
        <p>You are currently offline. Switch toggle to online to see trips.</p>
      </div>
    `;
    document.getElementById('trips-count-badge').textContent = 'Offline';
    showAlert('You are offline.', 'info');
  }
});

// Helper for vehicle icon
function getVehicleIcon(type) {
  switch (type ? type.toLowerCase() : '') {
    case 'bike': return '🏍️';
    case 'auto': return '🛺';
    case 'car': return '🚗';
    default: return '🚘';
  }
}

// 2. Fetch Pending Trips from Supabase via Flask backend
async function fetchAvailableTrips() {
  if (!isOnline || activeTrip) return;

  const listContainer = document.getElementById('trips-list');
  const countBadge = document.getElementById('trips-count-badge');
  clearAlert();

  const driverId = getDriverId();
  const driverGender = localStorage.getItem('smart_ride_gender') || '';

  try {
    const res = await fetch(`/api/available-trips?driver_id=${encodeURIComponent(driverId)}&driver_gender=${encodeURIComponent(driverGender)}`);
    const trips = await res.json();

    if (!res.ok) {
      throw new Error(trips.error || 'Failed to fetch available trips');
    }

    countBadge.textContent = `${trips.length} Available`;

    if (trips.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>No ride requests currently available. Refreshing automatically...</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = trips.map(trip => {
      const icon = getVehicleIcon(trip.vehicle_type);
      const fare = parseFloat(trip.fare).toFixed(2);
      const tripId = trip.id;
      const vehicle = trip.vehicle_type || 'Ride';
      const isWomenOnly = Boolean(trip.women_driver_only);
      const paymentMethod = (trip.payment_method || 'cash').toUpperCase();
      const customerName = trip.customer_name || 'Passenger';

      // Format Pickup and Dropoff locations
      const pickupText = (trip.pickup_lat != null && trip.pickup_lng != null)
        ? `${Number(trip.pickup_lat).toFixed(4)}°, ${Number(trip.pickup_lng).toFixed(4)}°`
        : 'Coordinates not provided';

      const dropoffText = (trip.drop_lat != null && trip.drop_lng != null)
        ? `${Number(trip.drop_lat).toFixed(4)}°, ${Number(trip.drop_lng).toFixed(4)}°`
        : 'Coordinates not provided';

      const distanceText = trip.distance_km != null 
        ? `${Number(trip.distance_km).toFixed(2)} km`
        : '~ km';

      // JSON encoded trip string for safe passing
      const tripJSON = encodeURIComponent(JSON.stringify({
        tripId,
        riderId: trip.rider_id,
        customerName: customerName,
        vehicleType: vehicle,
        fare: parseFloat(trip.fare),
        pickupText,
        dropoffText,
        distanceText,
        pickupLat: trip.pickup_lat,
        pickupLng: trip.pickup_lng,
        dropLat: trip.drop_lat,
        dropLng: trip.drop_lng,
        womenOnly: isWomenOnly,
        paymentMethod: trip.payment_method || 'cash'
      }));

      return `
        <div class="trip-item-card" data-trip-id="${tripId}" style="flex-direction: column; align-items: stretch; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="trip-main-info">
              <div class="trip-avatar">${icon}</div>
              <div class="trip-details">
                <div style="font-weight: 600; text-transform: capitalize; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                  ${vehicle} Request
                  ${isWomenOnly ? '<span class="pink-ride-tag">🌸 Women Driver Requested</span>' : ''}
                </div>
                <div class="trip-meta">Trip #${tripId} • Rider: <strong>${customerName}</strong> • Method: <strong>${paymentMethod}</strong></div>
              </div>
            </div>
            <div style="text-align: right;">
              <div class="trip-fare-badge">₹${fare}</div>
              <span class="status-badge status-requested" style="font-size: 0.7rem;">${distanceText}</span>
            </div>
          </div>

          <!-- Pickup and Dropoff Location Details -->
          <div class="route-locations-box">
            <div class="location-row">
              <div class="location-marker pickup">A</div>
              <div class="location-info">
                <span class="location-tag pickup">Pickup Location</span>
                <span class="location-coord">${pickupText}</span>
              </div>
            </div>
            <div class="location-row">
              <div class="location-marker dropoff">B</div>
              <div class="location-info">
                <span class="location-tag dropoff">Dropoff Location</span>
                <span class="location-coord">${dropoffText}</span>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 0.25rem;">
            <button type="button" class="btn btn-primary btn-accept" onclick="acceptTrip('${tripJSON}')" style="width: 100%;">
              Accept Ride (₹${fare})
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    showAlert(err.message, 'error');
  }
}

// 3. Accept Ride Handler
window.acceptTrip = async function(tripJSONEncoded) {
  clearAlert();
  const driverId = getDriverId();
  const trip = JSON.parse(decodeURIComponent(tripJSONEncoded));

  try {
    const res = await fetch('/api/accept-ride', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip_id: trip.tripId,
        driver_id: driverId
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Could not accept ride');
    }

    // Cache active trip state
    activeTrip = trip;

    // UI State Shift
    document.getElementById('available-trips-section').style.display = 'none';
    document.getElementById('active-ride-section').style.display = 'block';

    document.getElementById('active-trip-id').textContent = trip.tripId;
    document.getElementById('active-fare').textContent = `₹${trip.fare.toFixed(2)}`;
    document.getElementById('active-vehicle').textContent = trip.vehicleType;
    document.getElementById('active-rider-id').textContent = trip.customerName ? `${trip.customerName} (${trip.riderId})` : trip.riderId;
    document.getElementById('active-status').textContent = 'Accepted';
    document.getElementById('active-status').className = 'status-badge status-accepted';

    // Set Pickup & Dropoff details in Active view
    document.getElementById('active-pickup-coord').textContent = trip.pickupText;
    document.getElementById('active-dropoff-coord').textContent = trip.dropoffText;
    document.getElementById('active-distance').textContent = trip.distanceText;

    // Set Payment info & Pink Ride banner
    const paymentBadge = document.getElementById('driver-payment-badge');
    if (paymentBadge) {
      paymentBadge.textContent = 'Payment Pending';
      paymentBadge.className = 'status-badge status-pending';
    }
    const methodEl = document.getElementById('active-payment-method');
    if (methodEl) {
      methodEl.textContent = (trip.paymentMethod || 'cash').toUpperCase();
    }
    const pinkBanner = document.getElementById('active-pink-banner');
    if (pinkBanner) {
      pinkBanner.style.display = trip.womenOnly ? 'flex' : 'none';
    }

    // Start polling active trip to watch for Payment Received
    startActiveTripPaymentPolling(trip.tripId);

    // Render interactive Leaflet Map for Driver
    const pLat = parseFloat(trip.pickupLat) || 12.9716;
    const pLng = parseFloat(trip.pickupLng) || 77.5946;
    const dLat = parseFloat(trip.dropLat) || 13.0000;
    const dLng = parseFloat(trip.dropLng) || 77.6000;
    renderDriverMap(pLat, pLng, dLat, dLng, trip.pickupText, trip.dropoffText);

    showAlert(`Ride #${trip.tripId} accepted successfully! Navigate to pickup location.`, 'info');

  } catch (err) {
    showAlert(err.message, 'error');
  }
};

// Polling active trip status for Payment Received
let activeTripPollInterval = null;
function startActiveTripPaymentPolling(tripId) {
  if (activeTripPollInterval) {
    clearInterval(activeTripPollInterval);
  }

  activeTripPollInterval = setInterval(async () => {
    if (!activeTrip || activeTrip.tripId !== tripId) {
      clearInterval(activeTripPollInterval);
      activeTripPollInterval = null;
      return;
    }

    try {
      const res = await fetch(`/api/trip-status/${tripId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success) return;

      if (data.payment_status === 'completed') {
        const paymentBadge = document.getElementById('driver-payment-badge');
        if (paymentBadge) {
          paymentBadge.textContent = '✅ Payment Received';
          paymentBadge.className = 'status-badge status-accepted';
        }
        clearInterval(activeTripPollInterval);
        activeTripPollInterval = null;
      }
    } catch (e) {
      console.warn('Active trip polling error:', e);
    }
  }, 3000);
}

// 4. PIN Verification UI Interaction
const verifyBtn = document.getElementById('btn-verify-pin');
const pinInput = document.getElementById('verify-pin-input');
const pinMsg = document.getElementById('pin-verify-msg');
const pinVerificationBox = document.getElementById('pin-verification-box');
const completeBtn = document.getElementById('btn-complete-trip');

verifyBtn.addEventListener('click', async () => {
  clearAlert();
  const enteredPin = pinInput.value.trim();
  if (enteredPin.length !== 4) {
    pinMsg.style.display = 'block';
    pinMsg.style.color = '#ef4444';
    pinMsg.textContent = '❌ Please enter a 4-digit PIN.';
    return;
  }

  if (!activeTrip) return;

  verifyBtn.disabled = true;
  verifyBtn.textContent = '⏳ Verifying...';

  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip_id: activeTrip.tripId,
        pin: enteredPin
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Invalid PIN');
    }

    // Success UI updates
    pinMsg.style.display = 'block';
    pinMsg.style.color = '#22c55e';
    pinMsg.textContent = '✅ ' + (data.message || 'PIN verified! Ride started.');

    document.getElementById('active-status').textContent = 'In Progress';
    document.getElementById('active-status').className = 'status-badge status-accepted';

    // Replace verify section with Complete Ride button
    setTimeout(() => {
      pinVerificationBox.style.display = 'none';
      completeBtn.style.display = 'block';
    }, 800);

    showAlert('PIN verified! Ride is now in progress.', 'info');

  } catch (err) {
    pinMsg.style.display = 'block';
    pinMsg.style.color = '#ef4444';
    pinMsg.textContent = '❌ ' + err.message;
    showAlert(err.message, 'error');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify & Start Ride';
  }
});

// 5. Complete Trip Button (Calls /api/complete-ride and restores available trips view)
completeBtn.addEventListener('click', async () => {
  if (!activeTrip) return;

  completeBtn.disabled = true;
  completeBtn.textContent = '⏳ Completing Ride...';

  try {
    const res = await fetch('/api/complete-ride', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip_id: activeTrip.tripId
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to complete ride');
    }

    // Reset UI back to searching for available trips
    activeTrip = null;
    document.getElementById('active-ride-section').style.display = 'none';
    document.getElementById('available-trips-section').style.display = 'block';

    // Reset verification inputs for future trips
    pinInput.disabled = false;
    pinInput.value = '';
    pinMsg.style.display = 'none';
    pinVerificationBox.style.display = 'block';
    completeBtn.style.display = 'none';
    completeBtn.disabled = false;
    completeBtn.textContent = '🏁 Complete Ride';

    showAlert(data.message || 'Trip completed successfully! Looking for next passenger...', 'info');
    fetchAvailableTrips();

  } catch (err) {
    showAlert(err.message, 'error');
    completeBtn.disabled = false;
    completeBtn.textContent = '🏁 Complete Ride';
  }
});

// Refresh button listener
document.getElementById('btn-refresh-trips').addEventListener('click', () => {
  fetchAvailableTrips();
});

// Initial load & Polling
fetchAvailableTrips();
setInterval(() => {
  if (isOnline && !activeTrip) {
    fetchAvailableTrips();
  }
}, 5000);