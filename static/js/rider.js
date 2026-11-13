// --- Leaflet Map Engine for Rider ---
let riderMap = null;
let pickupMarker = null;
let dropoffMarker = null;
let routePolyline = null;

// Global state variables
let currentVehicleType = 'bike';
let calculatedFare = null;
let calculatedDistance = null;

// Custom Marker Icons
function createCustomIcon(color) {
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

const greenIcon = createCustomIcon('#22c55e');
const redIcon = createCustomIcon('#ef4444');

function initRiderMap(lat = 12.9716, lng = 77.5946) {
  if (riderMap) return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  riderMap = L.map('map').setView([lat, lng], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(riderMap);
}

function updateRiderMapRoute(pLat, pLng, dLat, dLng) {
  if (!riderMap) {
    initRiderMap(pLat, pLng);
  }

  // Remove existing markers & polyline if present
  if (pickupMarker) riderMap.removeLayer(pickupMarker);
  if (dropoffMarker) riderMap.removeLayer(dropoffMarker);
  if (routePolyline) riderMap.removeLayer(routePolyline);

  // Add green pickup marker
  pickupMarker = L.marker([pLat, pLng], { icon: greenIcon })
    .addTo(riderMap)
    .bindPopup(`<b>Pickup Point</b><br>${pLat.toFixed(4)}, ${pLng.toFixed(4)}`)
    .openPopup();

  // Add red dropoff marker
  dropoffMarker = L.marker([dLat, dLng], { icon: redIcon })
    .addTo(riderMap)
    .bindPopup(`<b>Destination</b><br>${dLat.toFixed(4)}, ${dLng.toFixed(4)}`);

  // Draw polyline connecting pickup and dropoff
  const latlngs = [[pLat, pLng], [dLat, dLng]];
  routePolyline = L.polyline(latlngs, {
    color: '#38bdf8',
    weight: 4,
    opacity: 0.85,
    dashArray: '8, 8'
  }).addTo(riderMap);

  // Fit map view to encompass both markers
  const bounds = L.latLngBounds([pLat, pLng], [dLat, dLng]);
  riderMap.fitBounds(bounds, { padding: [40, 40] });
}

// Initial map setup on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Hide summary card until fare is calculated
  document.getElementById('summary-card').style.display = 'none';

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        initRiderMap(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        initRiderMap(12.9716, 77.5946); // Default Bengaluru coords
      }
    );
  } else {
    initRiderMap(12.9716, 77.5946);
  }
});


// Generate or retrieve persistent rider ID from session auth
function getRiderId() {
  if (typeof getCurrentRiderId === 'function') {
    return getCurrentRiderId();
  }
  return localStorage.getItem('rider_id') || localStorage.getItem('smart_ride_rider_id') || 'rider-session-001';
}

// UI Alert Helper
function showAlert(message, type = 'info') {
  const alertEl = document.getElementById('status-alert');
  alertEl.textContent = message;
  alertEl.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-info');
  alertEl.style.display = 'block';
}

function clearAlert() {
  const alertEl = document.getElementById('status-alert');
  alertEl.style.display = 'none';
  alertEl.textContent = '';
}

// 1. Vehicle Selection Interaction
document.querySelectorAll('.vehicle-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const radio = card.querySelector('input[type="radio"]');
    radio.checked = true;
    currentVehicleType = radio.value;

    // Invalidate previously calculated fare on vehicle switch
    if (calculatedFare !== null) {
      document.getElementById('summary-status').textContent = 'Recalculate required';
      document.getElementById('btn-book-ride').disabled = true;
    }
  });
});

// 2. Geolocation Engine: Detect Current Location (with reverse-geocoding)
const detectBtn = document.getElementById('btn-detect-location');
detectBtn.addEventListener('click', () => {
  clearAlert();
  if (!navigator.geolocation) {
    showAlert('Geolocation is not supported by your browser.', 'error');
    return;
  }

  detectBtn.disabled = true;
  detectBtn.textContent = '⏳ Detecting...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude.toFixed(6);
      const lng = position.coords.longitude.toFixed(6);

      // Store in hidden fields
      document.getElementById('pickup_lat').value = lat;
      document.getElementById('pickup_lng').value = lng;

      // Reverse geocode to get a human-readable name
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const geo = await res.json();
        const displayName = geo.display_name
          ? geo.display_name.split(',').slice(0, 3).join(', ')
          : `${lat}, ${lng}`;
        document.getElementById('pickup_location_name').value = displayName;
        showAlert(`📍 Pickup set to: ${displayName}`, 'info');
      } catch (_) {
        document.getElementById('pickup_location_name').value = `${lat}, ${lng}`;
        showAlert(`Pickup set to current location (${lat}, ${lng})`, 'info');
      }

      detectBtn.disabled = false;
      detectBtn.textContent = '📍 Detect Location';

      if (riderMap) {
        riderMap.setView([parseFloat(lat), parseFloat(lng)], 14);
      }
    },
    (error) => {
      detectBtn.disabled = false;
      detectBtn.textContent = '📍 Detect Location';
      let msg = 'Unable to retrieve location.';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          msg = 'Location permission was denied. Please type your pickup location.';
          break;
        case error.POSITION_UNAVAILABLE:
          msg = 'Location information is unavailable.';
          break;
        case error.TIMEOUT:
          msg = 'Location request timed out.';
          break;
      }
      showAlert(msg, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// 3. Fare Calculation Handler (with forward geocoding)
const calculateBtn = document.getElementById('btn-calculate-fare');
calculateBtn.addEventListener('click', async () => {
  clearAlert();

  const pickupName = document.getElementById('pickup_location_name').value.trim();
  const dropName   = document.getElementById('drop_location_name').value.trim();

  if (!pickupName || !dropName) {
    showAlert('Please enter both a pickup location and a drop location.', 'error');
    return;
  }

  calculateBtn.disabled = true;
  calculateBtn.textContent = '⏳ Finding locations...';

  // Helper: geocode a place name → { lat, lng }
  async function geocodePlace(name) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const results = await res.json();
    if (!results || results.length === 0) throw new Error(`Location not found: "${name}"`);
    return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
  }

  try {
    const [pickup, drop] = await Promise.all([
      geocodePlace(pickupName),
      geocodePlace(dropName)
    ]);

    // Store resolved coordinates in hidden fields
    document.getElementById('pickup_lat').value = pickup.lat;
    document.getElementById('pickup_lng').value = pickup.lng;
    document.getElementById('drop_lat').value   = drop.lat;
    document.getElementById('drop_lng').value   = drop.lng;

    calculateBtn.textContent = '⏳ Calculating fare...';

    const response = await fetch('/api/calculate-fare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_lat:   drop.lat,
        drop_lng:   drop.lng,
        vehicle_type: currentVehicleType
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to calculate fare');
    }

    calculatedFare     = data.estimated_fare;
    calculatedDistance = data.distance_km;

    // Update UI Cards
    document.getElementById('summary-fare').textContent     = `₹${data.estimated_fare.toFixed(2)}`;
    document.getElementById('summary-distance').textContent = `${data.distance_km} km`;
    document.getElementById('summary-vehicle').textContent  = data.vehicle_type;
    document.getElementById('summary-status').textContent   = 'Calculated';
    document.getElementById('summary-status').className     = 'status-badge status-requested';

    // Reset PIN container if previously booked
    document.getElementById('pin-container').style.display = 'none';
    const bookBtn = document.getElementById('btn-book-ride');
    bookBtn.disabled = false;
    bookBtn.textContent = '🚀 Book Ride';

    // Show summary card
    document.getElementById('summary-card').style.display = 'block';

    // Draw route and markers on Leaflet map
    updateRiderMapRoute(pickup.lat, pickup.lng, drop.lat, drop.lng);

  } catch (err) {
    showAlert(err.message, 'error');
  } finally {
    calculateBtn.disabled = false;
    calculateBtn.textContent = '⚡ Calculate Fare';
  }
});

// 4. Booking Handler
const bookBtn = document.getElementById('btn-book-ride');
bookBtn.addEventListener('click', async () => {
  clearAlert();

  if (calculatedFare === null) {
    showAlert('Please calculate the fare before booking.', 'error');
    return;
  }

  bookBtn.disabled = true;
  bookBtn.textContent = '⏳ Requesting Ride...';

  try {
    const riderId = getRiderId();
    const pickup_lat = parseFloat(document.getElementById('pickup_lat').value);
    const pickup_lng = parseFloat(document.getElementById('pickup_lng').value);
    const drop_lat = parseFloat(document.getElementById('drop_lat').value);
    const drop_lng = parseFloat(document.getElementById('drop_lng').value);

    // Read Pink Ride (Women Driver Only) flag
    const womenOnlyEl = document.getElementById('women_driver_only');
    const women_driver_only = womenOnlyEl ? womenOnlyEl.checked : false;

    // Read selected Payment Method
    const paymentMethodEl = document.querySelector('input[name="payment_method"]:checked');
    const payment_method = paymentMethodEl ? paymentMethodEl.value : 'cash';

    const riderName = localStorage.getItem('smart_ride_full_name') || 'Passenger';
    const riderEmail = localStorage.getItem('smart_ride_email') || '';

    const response = await fetch('/api/book-ride', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rider_id: riderId,
        customer_name: riderName,
        customer_email: riderEmail,
        vehicle_type: currentVehicleType,
        fare: calculatedFare,
        pickup_lat: isNaN(pickup_lat) ? null : pickup_lat,
        pickup_lng: isNaN(pickup_lng) ? null : pickup_lng,
        drop_lat: isNaN(drop_lat) ? null : drop_lat,
        drop_lng: isNaN(drop_lng) ? null : drop_lng,
        distance_km: calculatedDistance,
        women_driver_only: women_driver_only,
        payment_method: payment_method
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Booking request failed');
    }

    // Display PIN and Status confirmation
    document.getElementById('summary-pin').textContent = data.pin;
    document.getElementById('summary-trip-id').textContent = data.trip_id;
    document.getElementById('pin-container').style.display = 'block';

    document.getElementById('summary-status').textContent = 'Searching for nearby drivers...';
    document.getElementById('summary-status').className = 'status-badge status-requested';

    bookBtn.textContent = '✅ Ride Requested';
    showAlert(data.message || 'Ride booked successfully!', 'info');

    // Start Live Polling for Trip Status
    startTripStatusPolling(data.trip_id);

  } catch (err) {
    showAlert(err.message, 'error');
    bookBtn.disabled = false;
    bookBtn.textContent = '🚀 Book Ride';
  }
});

// 5. Rider Live Polling (every 3 seconds)
let tripPollInterval = null;
let currentActiveTripId = null;

function showPaymentModal(tripId, fare, method) {
  currentActiveTripId = tripId;
  const modal = document.getElementById('payment-modal');
  const modalTripId = document.getElementById('modal-trip-id');
  const modalMethod = document.getElementById('modal-payment-method');
  const modalFare = document.getElementById('modal-fare-amount');
  const payBtn = document.getElementById('btn-pay-now');
  const alertEl = document.getElementById('payment-alert');

  if (alertEl) alertEl.style.display = 'none';
  if (payBtn) {
    payBtn.disabled = false;
    payBtn.textContent = `💳 Pay Now (₹${parseFloat(fare || 0).toFixed(2)})`;
  }

  if (modalTripId) modalTripId.textContent = `#${tripId}`;
  if (modalMethod) modalMethod.textContent = (method || 'cash').toUpperCase();
  if (modalFare) modalFare.textContent = `₹${parseFloat(fare || 0).toFixed(2)}`;
  if (modal) modal.style.display = 'flex';
}

let acceptedAlertShown = false;

function startTripStatusPolling(tripId) {
  if (tripPollInterval) {
    clearInterval(tripPollInterval);
  }

  // Reset the one-time flag for each new booking
  acceptedAlertShown = false;

  const statusBadge = document.getElementById('summary-status');

  tripPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/trip-status/${tripId}`);
      if (!res.ok) return;

      const data = await res.json();
      if (!data.success) return;

      switch (data.status) {
        case 'requested':
          statusBadge.textContent = 'Searching for nearby drivers...';
          statusBadge.className = 'status-badge status-requested';
          break;

        case 'accepted':
          statusBadge.textContent = 'Driver accepted! Share your PIN with the driver.';
          statusBadge.className = 'status-badge status-accepted';
          // Only show the alert once, not on every poll cycle
          if (!acceptedAlertShown) {
            showAlert('A driver has accepted your ride! Share your PIN with them.', 'info');
            acceptedAlertShown = true;
          }
          break;

        case 'in_progress':
          statusBadge.textContent = 'Trip started. On the way to your destination!';
          statusBadge.className = 'status-badge status-accepted';
          break;

        case 'completed':
          statusBadge.textContent = 'Trip completed! Please proceed to payment.';
          statusBadge.className = 'status-badge status-accepted';
          showAlert('Trip completed! Thank you for riding with SmartRide.', 'info');

          // Clear polling once completed
          clearInterval(tripPollInterval);
          tripPollInterval = null;

          // Re-enable Book Ride for the next trip
          const bBtn = document.getElementById('btn-book-ride');
          if (bBtn) {
            bBtn.disabled = false;
            bBtn.textContent = '🚀 Book Ride';
          }

          // If payment is pending, trigger payment modal
          if (data.payment_status !== 'completed') {
            showPaymentModal(tripId, data.fare, data.payment_method);
          } else {
            statusBadge.textContent = 'Trip completed & Paid!';
          }
          break;
      }
    } catch (err) {
      console.warn('Polling error:', err);
    }
  }, 3000);
}

// 6. Post-Ride Payment Handler
const payNowBtn = document.getElementById('btn-pay-now');
if (payNowBtn) {
  payNowBtn.addEventListener('click', async () => {
    if (!currentActiveTripId) return;

    const alertEl = document.getElementById('payment-alert');
    const paymentMethodEl = document.querySelector('input[name="payment_method"]:checked');
    const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'upi';

    payNowBtn.disabled = true;
    payNowBtn.textContent = '⏳ Processing Payment...';

    try {
      const res = await fetch('/api/process-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: currentActiveTripId,
          payment_method: paymentMethod,
          amount: calculatedFare || 0
        })
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Payment failed');
      }

      if (alertEl) {
        alertEl.textContent = result.message || 'Payment completed successfully!';
        alertEl.className = 'alert alert-success';
        alertEl.style.display = 'block';
      }

      payNowBtn.textContent = '✅ Payment Received';
      document.getElementById('summary-status').textContent = 'Trip completed & Paid! 🎉';

      setTimeout(() => {
        const modal = document.getElementById('payment-modal');
        if (modal) modal.style.display = 'none';
      }, 2500);

    } catch (err) {
      if (alertEl) {
        alertEl.textContent = '❌ ' + err.message;
        alertEl.className = 'alert alert-error';
        alertEl.style.display = 'block';
      }
      payNowBtn.disabled = false;
      payNowBtn.textContent = '💳 Pay Now';
    }
  });
}