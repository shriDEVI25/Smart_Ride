import os
import sqlite3
import uuid
import logging
import socket
import urllib.parse
import time
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("smart_ride_db")
logging.basicConfig(level=logging.INFO)

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

# Base directory for the local database
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smart_ride.db")


def init_local_db():
    """Ensure SQLite database and required schema exist with all columns."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            gender TEXT DEFAULT 'other',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS trips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rider_id TEXT NOT NULL,
            customer_name TEXT,
            customer_email TEXT,
            driver_id TEXT,
            vehicle_type TEXT NOT NULL,
            fare REAL NOT NULL,
            pin TEXT NOT NULL,
            status TEXT DEFAULT 'requested',
            women_driver_only INTEGER DEFAULT 0,
            payment_method TEXT DEFAULT 'cash',
            payment_status TEXT DEFAULT 'pending',
            pickup_lat REAL,
            pickup_lng REAL,
            drop_lat REAL,
            drop_lng REAL,
            distance_km REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    # Ensure columns exist if table was previously created with older schema
    try:
        cur.execute("ALTER TABLE profiles ADD COLUMN gender TEXT DEFAULT 'other'")
    except Exception:
        pass

    for col_def in [
        "customer_name TEXT",
        "customer_email TEXT",
        "women_driver_only INTEGER DEFAULT 0",
        "payment_method TEXT DEFAULT 'cash'",
        "payment_status TEXT DEFAULT 'pending'",
        "pickup_lat REAL",
        "pickup_lng REAL",
        "drop_lat REAL",
        "drop_lng REAL",
        "distance_km REAL",
    ]:
        try:
            cur.execute(f"ALTER TABLE trips ADD COLUMN {col_def}")
        except Exception:
            pass

    conn.commit()
    conn.close()


init_local_db()


class APIResponse:
    """Supabase-compatible response object containing data and optional error."""

    def __init__(self, data=None, error=None):
        self.data = data if data is not None else []
        self.error = error


class LocalQueryBuilder:
    """Supabase-compatible query builder backed by SQLite."""

    def __init__(self, table_name: str):
        self.table_name = table_name
        self.op_type = "select"
        self.select_cols = "*"
        self.filters = []  # list of (col, val)
        self.insert_data = None
        self.update_data = None
        self.limit_val = None
        self.order_col = None
        self.order_desc = False

    def select(self, cols="*"):
        self.op_type = "select"
        self.select_cols = cols
        return self

    def eq(self, col: str, val):
        self.filters.append((col, val))
        return self

    def limit(self, n: int):
        self.limit_val = n
        return self

    def order(self, col: str, desc: bool = False):
        self.order_col = col
        self.order_desc = desc
        return self

    def insert(self, data):
        self.op_type = "insert"
        self.insert_data = data
        return self

    def update(self, data):
        self.op_type = "update"
        self.update_data = data
        return self

    def execute(self) -> APIResponse:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        try:
            if self.op_type == "insert":
                records = (
                    self.insert_data
                    if isinstance(self.insert_data, list)
                    else [self.insert_data]
                )
                inserted_rows = []

                for rec in records:
                    row_dict = dict(rec)

                    # Auto-assign UUID for profiles if not provided
                    if self.table_name == "profiles" and not row_dict.get("id"):
                        row_dict["id"] = str(uuid.uuid4())

                    # Map boolean to SQLite integer
                    if "women_driver_only" in row_dict:
                        row_dict["women_driver_only"] = (
                            1 if row_dict["women_driver_only"] else 0
                        )

                    cols = list(row_dict.keys())
                    placeholders = ", ".join(["?"] * len(cols))
                    col_names = ", ".join(cols)
                    values = [row_dict[c] for c in cols]

                    cur.execute(
                        f"INSERT INTO {self.table_name} ({col_names}) VALUES ({placeholders})",
                        values,
                    )
                    last_id = cur.lastrowid

                    if self.table_name == "trips":
                        cur.execute(
                            f"SELECT * FROM {self.table_name} WHERE id = ?",
                            (last_id,),
                        )
                    else:
                        cur.execute(
                            f"SELECT * FROM {self.table_name} WHERE id = ?",
                            (row_dict.get("id"),),
                        )

                    fetched = cur.fetchone()
                    if fetched:
                        d = dict(fetched)
                        if "women_driver_only" in d:
                            d["women_driver_only"] = bool(d["women_driver_only"])
                        inserted_rows.append(d)

                conn.commit()
                return APIResponse(data=inserted_rows)

            elif self.op_type == "update":
                set_clauses = []
                params = []
                for col, val in self.update_data.items():
                    set_clauses.append(f"{col} = ?")
                    if col == "women_driver_only":
                        params.append(1 if val else 0)
                    else:
                        params.append(val)

                where_clauses = []
                for col, val in self.filters:
                    where_clauses.append(f"{col} = ?")
                    params.append(val)

                where_sql = (
                    " AND ".join(where_clauses) if where_clauses else "1=1"
                )
                update_sql = f"UPDATE {self.table_name} SET {', '.join(set_clauses)} WHERE {where_sql}"
                cur.execute(update_sql, params)
                conn.commit()

                # Fetch updated rows
                fetch_params = [val for col, val in self.filters]
                cur.execute(
                    f"SELECT * FROM {self.table_name} WHERE {where_sql}",
                    fetch_params,
                )
                rows = cur.fetchall()
                results = []
                for row in rows:
                    d = dict(row)
                    if "women_driver_only" in d:
                        d["women_driver_only"] = bool(d["women_driver_only"])
                    results.append(d)
                return APIResponse(data=results)

            else:  # select
                where_clauses = []
                params = []
                for col, val in self.filters:
                    where_clauses.append(f"{col} = ?")
                    params.append(val)

                where_sql = (
                    f" WHERE {' AND '.join(where_clauses)}"
                    if where_clauses
                    else ""
                )
                order_sql = (
                    f" ORDER BY {self.order_col} {'DESC' if self.order_desc else 'ASC'}"
                    if self.order_col
                    else ""
                )
                limit_sql = f" LIMIT {self.limit_val}" if self.limit_val else ""

                cols = "*" if self.select_cols == "*" else self.select_cols
                cur.execute(
                    f"SELECT {cols} FROM {self.table_name}{where_sql}{order_sql}{limit_sql}",
                    params,
                )
                rows = cur.fetchall()
                results = []
                for row in rows:
                    d = dict(row)
                    if "women_driver_only" in d:
                        d["women_driver_only"] = bool(d["women_driver_only"])
                    results.append(d)
                return APIResponse(data=results)

        finally:
            conn.close()


class HybridClient:
    """Client that delegates to real Supabase when accessible, with seamless SQLite fallback."""

    def __init__(self, supabase_url: str, supabase_key: str):
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self._real_client = None
        self._last_check_time = 0
        self._remote_reachable = False

        if (
            supabase_url
            and supabase_key
            and not supabase_url.startswith("your_")
        ):
            try:
                from supabase import create_client

                self._real_client = create_client(supabase_url, supabase_key)
            except Exception as e:
                logger.warning(
                    f"Could not initialize Supabase remote client: {e}. Using SQLite fallback."
                )

    def is_remote_reachable(self) -> bool:
        if not self._real_client or not self.supabase_url:
            return False
        now = time.time()
        # Cache reachability check for 60 seconds to avoid repeating DNS lookups
        if now - self._last_check_time < 60:
            return self._remote_reachable

        self._last_check_time = now
        try:
            parsed = urllib.parse.urlparse(self.supabase_url)
            host = parsed.hostname
            if not host:
                self._remote_reachable = False
                return False
            socket.gethostbyname(host)
            self._remote_reachable = True
            return True
        except Exception:
            self._remote_reachable = False
            return False

    def table(self, table_name: str):
        return HybridTableQuery(self, table_name)


class HybridTableQuery:
    def __init__(self, hybrid_client: HybridClient, table_name: str):
        self.client = hybrid_client
        self.table_name = table_name
        self.local_builder = LocalQueryBuilder(table_name)
        self._calls = []

    def select(self, cols="*"):
        self.local_builder.select(cols)
        self._calls.append(("select", (cols,), {}))
        return self

    def eq(self, col: str, val):
        self.local_builder.eq(col, val)
        self._calls.append(("eq", (col, val), {}))
        return self

    def limit(self, n: int):
        self.local_builder.limit(n)
        self._calls.append(("limit", (n,), {}))
        return self

    def order(self, col: str, desc: bool = False):
        self.local_builder.order(col, desc)
        self._calls.append(("order", (col,), {"desc": desc}))
        return self

    def insert(self, data):
        self.local_builder.insert(data)
        self._calls.append(("insert", (data,), {}))
        return self

    def update(self, data):
        self.local_builder.update(data)
        self._calls.append(("update", (data,), {}))
        return self

    def execute(self):
        op = self.local_builder.op_type

        if op in ("insert", "update"):
            # For writes: attempt remote Supabase, then ALWAYS write to local SQLite too
            if self.client.is_remote_reachable():
                try:
                    q = self.client._real_client.table(self.table_name)
                    for method, args, kwargs in self._calls:
                        q = getattr(q, method)(*args, **kwargs)
                    q.execute()  # Fire-and-forget remote write
                    logger.info(f"Remote {op} on {self.table_name} succeeded.")
                except Exception as err:
                    logger.warning(f"Remote {op} failed ({err}), local SQLite is authoritative.")
            # Always write to local SQLite — this is the source of truth for reads
            return self.local_builder.execute()

        else:  # SELECT — always use local SQLite as source of truth
            return self.local_builder.execute()


# Export the hybrid client instance
supabase = HybridClient(SUPABASE_URL, SUPABASE_KEY)
