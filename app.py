import math
import random
from flask import Flask, jsonify, render_template, request

from supabase_client import supabase

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    """Allow browser fetch() calls from the same origin without CORS issues."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    return response


@app.errorhandler(404)
def not_found(e):
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"success": False, "error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"success": False, "error": "Internal server error"}), 500


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/login", methods=["GET"])
def login_page():
    return render_template("login.html")


@app.route("/register", methods=["GET"])
@app.route("/registor", methods=["GET"])
def register_page():
    return render_template("register.html")


@app.route("/rider", methods=["GET"])
def rider_dashboard():
    return render_template("rider.html")


@app.route("/driver", methods=["GET"])
def driver_dashboard():
    return render_template("driver.html")


@app.route("/api/register", methods=["POST"])
def api_register():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    required = ["full_name", "email", "password", "role"]
    missing = [f for f in required if not payload.get(f)]
    if missing:
        return jsonify({"success": False, "error": f"Missing fields: {', '.join(missing)}"}), 400

    role = payload["role"].lower()
    if role not in ("rider", "driver"):
        return jsonify({"success": False, "error": "Role must be 'rider' or 'driver'"}), 400

    gender = (payload.get("gender") or "other").strip().lower()
    if gender not in ("female", "male", "other"):
        gender = "other"

    email = payload["email"].strip().lower()

    try:
        # Check if email already exists
        existing = supabase.table("profiles").select("id").eq("email", email).execute()
        if existing.data:
            return jsonify({"success": False, "error": "An account with this email already exists"}), 400

        # Insert new user record
        new_user = {
            "full_name": payload["full_name"].strip(),
            "email": email,
            "password": payload["password"],  # Store as-is (Supabase RLS should handle hashing in production)
            "role": role,
            "gender": gender
        }
        result = supabase.table("profiles").insert(new_user).execute()

        if not result.data:
            return jsonify({"success": False, "error": "Failed to create account"}), 400

        user = result.data[0]
        return jsonify({
            "success": True,
            "user_id": user.get("id"),
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "gender": user.get("gender", gender),
            "message": "Account created successfully!"
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 400


@app.route("/api/login", methods=["POST"])
def api_login():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"}), 400

    try:
        result = (
            supabase.table("profiles")
            .select("*")
            .eq("email", email)
            .eq("password", password)
            .execute()
        )

        if not result.data:
            return jsonify({"success": False, "error": "Invalid email or password"}), 401

        user = result.data[0]
        role = user.get("role")
        redirect_path = "/rider" if role == "rider" else "/driver"

        return jsonify({
            "success": True,
            "user_id": user.get("id"),
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "role": role,
            "gender": user.get("gender", "other"),
            "redirect": redirect_path
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 400


# INR Fare Structure
FARE_RATES = {
    "bike": {"base_fare": 20.0, "per_km_rate": 8.0},
    "auto": {"base_fare": 30.0, "per_km_rate": 12.0},
    "car": {"base_fare": 50.0, "per_km_rate": 18.0},
}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    earth_radius_km = 6371.0

    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)

    r_lat1 = math.radians(lat1)
    r_lat2 = math.radians(lat2)

    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(r_lat1) * math.cos(r_lat2) * math.sin(d_lon / 2) ** 2
    )
    # Clamp to [0, 1] to avoid math domain errors from floating-point precision
    a = max(0.0, min(1.0, a))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "message": "Flask and Supabase connected"
    }), 200


@app.route("/api/calculate-fare", methods=["POST"])
def calculate_fare():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    required_fields = ["pickup_lat", "pickup_lng", "drop_lat", "drop_lng", "vehicle_type"]
    missing_fields = [field for field in required_fields if field not in payload]
    if missing_fields:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing_fields)}"
        }), 400

    vehicle_type = str(payload.get("vehicle_type")).lower()
    if vehicle_type not in FARE_RATES:
        return jsonify({
            "success": False,
            "error": f"Invalid vehicle_type '{vehicle_type}'. Allowed types: {', '.join(FARE_RATES.keys())}"
        }), 400

    try:
        pickup_lat = float(payload["pickup_lat"])
        pickup_lng = float(payload["pickup_lng"])
        drop_lat = float(payload["drop_lat"])
        drop_lng = float(payload["drop_lng"])
    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "error": "Coordinates (pickup_lat, pickup_lng, drop_lat, drop_lng) must be valid numeric values"
        }), 400

    # Calculate distance using Haversine formula
    distance_km = haversine_distance(pickup_lat, pickup_lng, drop_lat, drop_lng)

    rates = FARE_RATES[vehicle_type]
    fare = rates["base_fare"] + (rates["per_km_rate"] * distance_km)

    return jsonify({
        "success": True,
        "distance_km": round(distance_km, 2),
        "vehicle_type": vehicle_type,
        "currency": "INR",
        "estimated_fare": round(fare, 2)
    }), 200


@app.route("/api/book-ride", methods=["POST"])
def book_ride():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    required_fields = ["rider_id", "vehicle_type", "fare"]
    missing_fields = [field for field in required_fields if field not in payload]
    if missing_fields:
        return jsonify({
            "success": False,
            "error": f"Missing required fields: {', '.join(missing_fields)}"
        }), 400

    rider_id = payload.get("rider_id")
    vehicle_type = str(payload.get("vehicle_type")).lower()

    if vehicle_type not in FARE_RATES:
        return jsonify({
            "success": False,
            "error": f"Invalid vehicle_type '{vehicle_type}'. Allowed types: {', '.join(FARE_RATES.keys())}"
        }), 400

    try:
        fare = float(payload["fare"])
    except (ValueError, TypeError):
        return jsonify({
            "success": False,
            "error": "Fare must be a valid numeric value"
        }), 400

    # Generate 4-digit security PIN string
    pin = str(random.randint(1000, 9999))

    women_driver_only = bool(payload.get("women_driver_only", False))
    payment_method = str(payload.get("payment_method") or "cash").lower()
    if payment_method not in ("upi", "card", "cash"):
        payment_method = "cash"

    # Customer Details Extraction
    customer_name = payload.get("customer_name") or payload.get("rider_name")
    customer_email = payload.get("customer_email") or ""

    # Look up in profiles if not provided in payload
    if (not customer_name or customer_name == "Passenger") and rider_id:
        try:
            profile_res = supabase.table("profiles").select("full_name, email").eq("id", str(rider_id)).execute()
            if profile_res.data:
                customer_name = profile_res.data[0].get("full_name") or customer_name
                if not customer_email:
                    customer_email = profile_res.data[0].get("email") or ""
        except Exception:
            pass

    trip_data = {
        "rider_id": str(rider_id),
        "customer_name": customer_name or "Guest Passenger",
        "customer_email": customer_email,
        "vehicle_type": vehicle_type,
        "fare": fare,
        "pin": pin,
        "status": "requested",
        "women_driver_only": women_driver_only,
        "payment_method": payment_method,
        "payment_status": "pending"
    }

    # Include location coordinates and distance if provided
    for field in ["pickup_lat", "pickup_lng", "drop_lat", "drop_lng", "distance_km"]:
        if field in payload and payload[field] is not None:
            try:
                trip_data[field] = float(payload[field])
            except (ValueError, TypeError):
                pass

    try:
        response = supabase.table("trips").insert(trip_data).execute()
        
        # Check if insert returned data
        if not response.data:
            return jsonify({
                "success": False,
                "error": "Failed to create trip in database"
            }), 400

        inserted_row = response.data[0]
        trip_id = inserted_row.get("id") or inserted_row.get("trip_id")

        return jsonify({
            "success": True,
            "trip_id": trip_id,
            "pin": pin,
            "message": "Ride requested successfully"
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Database error: {str(e)}"
        }), 400


@app.route("/api/available-trips", methods=["GET"])
def get_available_trips():
    driver_id = request.args.get("driver_id")
    is_female_driver = False

    # Check driver gender if driver_id is supplied
    if driver_id:
        try:
            profile_res = supabase.table("profiles").select("gender").eq("id", driver_id).execute()
            if profile_res.data:
                driver_gender = str(profile_res.data[0].get("gender", "")).lower()
                is_female_driver = (driver_gender == "female")
        except Exception:
            pass

    # Also check optional driver_gender parameter
    if not is_female_driver:
        g_param = (request.args.get("driver_gender") or "").strip().lower()
        if g_param == "female":
            is_female_driver = True

    try:
        response = supabase.table("trips").select("*").eq("status", "requested").execute()
        trips = response.data if response.data is not None else []

        # If a trip has women_driver_only = TRUE, only display it if requesting driver is female
        filtered_trips = []
        for trip in trips:
            requires_women_only = bool(trip.get("women_driver_only", False))
            if requires_women_only:
                if is_female_driver:
                    filtered_trips.append(trip)
            else:
                filtered_trips.append(trip)

        return jsonify(filtered_trips), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Database error: {str(e)}"
        }), 400


@app.route("/api/accept-ride", methods=["POST"])
def accept_ride():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    trip_id = payload.get("trip_id")
    driver_id = payload.get("driver_id")

    if trip_id is None or driver_id is None:
        return jsonify({
            "success": False,
            "error": "Missing required fields: trip_id and driver_id are required"
        }), 400

    try:
        response = (
            supabase.table("trips")
            .update({"driver_id": str(driver_id), "status": "accepted"})
            .eq("id", trip_id)
            .execute()
        )

        if not response.data:
            return jsonify({
                "success": False,
                "error": f"Trip with id {trip_id} not found or update failed"
            }), 400

        return jsonify({
            "success": True,
            "trip_id": trip_id,
            "status": "accepted",
            "message": "Ride accepted successfully"
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": f"Database error: {str(e)}"
        }), 400


@app.route("/api/verify-pin", methods=["POST"])
def verify_pin():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "message": "Request body must be valid JSON"}), 400

    trip_id = payload.get("trip_id")
    submitted_pin = payload.get("pin")

    if trip_id is None or submitted_pin is None:
        return jsonify({"success": False, "message": "Missing trip_id or pin"}), 400

    try:
        # Fetch trip from Supabase
        response = supabase.table("trips").select("*").eq("id", trip_id).execute()
        if not response.data:
            return jsonify({"success": False, "message": "Trip not found"}), 404

        trip = response.data[0]
        stored_pin = str(trip.get("pin", "")).strip()
        provided_pin = str(submitted_pin).strip()

        # Check if submitted pin matches stored pin
        if provided_pin != stored_pin:
            return jsonify({"success": False, "message": "Invalid PIN"}), 400

        # Update status to in_progress
        update_resp = (
            supabase.table("trips")
            .update({"status": "in_progress"})
            .eq("id", trip_id)
            .execute()
        )

        if not update_resp.data:
            return jsonify({"success": False, "message": "Failed to update trip status"}), 400

        return jsonify({
            "success": True,
            "status": "in_progress",
            "message": "PIN verified! Ride started."
        }), 200

    except Exception as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 400


@app.route("/api/complete-ride", methods=["POST"])
def complete_ride():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "message": "Request body must be valid JSON"}), 400

    trip_id = payload.get("trip_id")
    if trip_id is None:
        return jsonify({"success": False, "message": "Missing trip_id"}), 400

    try:
        # Update status to completed
        response = (
            supabase.table("trips")
            .update({"status": "completed"})
            .eq("id", trip_id)
            .execute()
        )

        if not response.data:
            return jsonify({"success": False, "message": f"Trip #{trip_id} not found or update failed"}), 400

        return jsonify({
            "success": True,
            "status": "completed",
            "message": "Trip completed successfully."
        }), 200

    except Exception as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 400


@app.route("/api/process-payment", methods=["POST"])
def process_payment():
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Request body must be valid JSON"}), 400

    trip_id = payload.get("trip_id")
    payment_method = str(payload.get("payment_method") or "cash").lower()
    amount = payload.get("amount")

    if trip_id is None:
        return jsonify({"success": False, "error": "Missing trip_id"}), 400

    if payment_method not in ("upi", "card", "cash"):
        payment_method = "cash"

    try:
        amount_val = float(amount) if amount is not None else 0.0
    except (ValueError, TypeError):
        amount_val = 0.0

    try:
        response = (
            supabase.table("trips")
            .update({
                "payment_status": "completed",
                "payment_method": payment_method
            })
            .eq("id", trip_id)
            .execute()
        )

        if not response.data:
            return jsonify({"success": False, "error": f"Trip #{trip_id} not found or payment update failed"}), 400

        method_display = {
            "upi": "UPI",
            "card": "Card",
            "cash": "Cash"
        }.get(payment_method, payment_method.upper())

        return jsonify({
            "success": True,
            "trip_id": trip_id,
            "payment_status": "completed",
            "payment_method": payment_method,
            "amount": amount_val,
            "message": f"Payment of ₹{amount_val:.2f} processed successfully via {method_display}!"
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 400


@app.route("/api/trip-status/<int:trip_id>", methods=["GET"])
def get_trip_status(trip_id):
    try:
        response = supabase.table("trips").select("*").eq("id", trip_id).execute()
        if not response.data:
            return jsonify({"success": False, "message": "Trip not found"}), 404

        trip = response.data[0]
        return jsonify({
            "success": True,
            "status": trip.get("status"),
            "driver_id": trip.get("driver_id"),
            "vehicle_type": trip.get("vehicle_type"),
            "fare": trip.get("fare"),
            "pickup_lat": trip.get("pickup_lat"),
            "pickup_lng": trip.get("pickup_lng"),
            "drop_lat": trip.get("drop_lat"),
            "drop_lng": trip.get("drop_lng"),
            "distance_km": trip.get("distance_km"),
            "customer_name": trip.get("customer_name") or "Passenger",
            "customer_email": trip.get("customer_email") or "",
            "women_driver_only": trip.get("women_driver_only", False),
            "payment_method": trip.get("payment_method", "cash"),
            "payment_status": trip.get("payment_status", "pending")
        }), 200

    except Exception as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 400


if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
   



