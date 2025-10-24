from flask import Flask, render_template, request, redirect, url_for, session, send_from_directory, flash, jsonify, send_file
import os, json, mimetypes
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "supersecretkey123"  # Change this to something secure!
UPLOAD_FOLDER = "uploads"
MAX_STORAGE = 1_073_741_824  # 1GB per user
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

USERS_FILE = "users.json"
if not os.path.exists(USERS_FILE):
    with open(USERS_FILE, "w") as f:
        json.dump({}, f)

# --- Helper functions ---
def load_users():
    with open(USERS_FILE, "r") as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f)

def user_folder(username):
    path = os.path.join(UPLOAD_FOLDER, username)
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)

def get_directory_size(path):
    """Return the total size in bytes for files under path (recursive)."""
    total = 0
    if not os.path.exists(path):
        return 0
    for dirpath, dirnames, filenames in os.walk(path):
        for fname in filenames:
            try:
                fp = os.path.join(dirpath, fname)
                total += os.path.getsize(fp)
            except OSError:
                # ignore unreadable files
                pass
    return total

# Backwards compatible small helper (non-recursive as before)
def total_size(folder):
    folder_abs = os.path.abspath(folder)
    if not os.path.exists(folder_abs):
        return 0
    try:
        return sum(os.path.getsize(os.path.join(folder_abs, f)) for f in os.listdir(folder_abs))
    except OSError:
        return get_directory_size(folder_abs)

# --- Routes ---
@app.route("/", methods=["GET"])
def index():
    if "username" in session:
        return redirect(url_for("dashboard"))
    return '''
    <h2>✅ Raspberry Pi Cloud Storage running!</h2>
    <p><a href="/register">Register</a> or <a href="/login">Login</a></p>
    '''

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        users = load_users()
        if username in users:
            flash("User already exists!")
            return redirect(url_for("register"))
        users[username] = generate_password_hash(password)
        save_users(users)
        os.makedirs(user_folder(username), exist_ok=True)
        flash("User registered! Please log in.")
        return redirect(url_for("login"))
    return render_template("register.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        users = load_users()
        if username in users and check_password_hash(users[username], password):
            session["username"] = username
            return redirect(url_for("dashboard"))
        flash("Invalid credentials")
        return redirect(url_for("login"))
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("username", None)
    return redirect(url_for("login"))

@app.route("/dashboard", methods=["GET", "POST"])
def dashboard():
    if "username" not in session:
        return redirect(url_for("login"))
    user = session["username"]
    folder = user_folder(user)

    # --- File Upload ---
    if request.method == "POST":
        file = request.files.get("file")
        if not file or file.filename == "":
            flash("No file selected!")
            return redirect(url_for("dashboard"))

        filename = secure_filename(file.filename)
        file_path = os.path.join(folder, filename)
        file_contents = file.read()

        # Check storage limit
        if get_directory_size(folder) + len(file_contents) > MAX_STORAGE:
            flash("Storage limit exceeded (1GB max)!")
            return redirect(url_for("dashboard"))

        # Save file
        file.seek(0)
        file.save(file_path)
        flash(f"Uploaded {filename}!")
        return redirect(url_for("dashboard"))

    files = os.listdir(folder)
    return render_template("dashboard.html", files=files, username=user)

@app.route("/download/<filename>")
def download(filename):
    if "username" not in session:
        return redirect(url_for("login"))
    return send_from_directory(user_folder(session["username"]), filename, as_attachment=True)

@app.route("/delete/<filename>")
def delete(filename):
    if "username" not in session:
        return redirect(url_for("login"))
    path = os.path.join(user_folder(session["username"]), filename)
    if os.path.exists(path):
        os.remove(path)
        flash(f"Deleted {filename}")
    return redirect(url_for("dashboard"))

# --- New: file manager page route (so url_for('file_manager') works) ---
@app.route("/files")
def file_manager():
    if "username" not in session:
        return redirect(url_for("login"))
    # This expects templates/file-manager.html to exist and static assets under /static/
    return render_template("file-manager.html")

# --- New: Storage usage API used by the dashboard and file manager UI ---
@app.route("/api/storage/usage")
def storage_usage():
    if "username" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    user = session["username"]
    folder = user_folder(user)
    used = get_directory_size(folder)
    total = MAX_STORAGE
    free = max(0, total - used)
    percent = round((used / total) * 100, 2) if total > 0 else 0
    return jsonify({"total": total, "used": used, "free": free, "percent": percent})

# --- New: Minimal files API for the file manager frontend ---
def _resolve_safe(base, rel_path):
    # Normalize and ensure the target is inside base
    if rel_path is None:
        rel_path = ""
    target = os.path.abspath(os.path.normpath(os.path.join(base, rel_path)))
    if not target.startswith(base):
        raise ValueError("Invalid path")
    return target

@app.route("/api/files")
def api_files():
    if "username" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    rel = request.args.get("path", "")
    base = user_folder(session["username"])
    try:
        target = _resolve_safe(base, rel)
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400

    entries = []
    try:
        for name in sorted(os.listdir(target), key=lambda s: s.lower()):
            full = os.path.join(target, name)
            if os.path.isdir(full):
                entries.append({"name": name, "path": os.path.relpath(full, base).replace("\\", "/"), "type": "directory"})
            else:
                size = os.path.getsize(full)
                mtype, _ = mimetypes.guess_type(full)
                entries.append({"name": name, "path": os.path.relpath(full, base).replace("\\", "/"), "type": "file", "size": size, "mime": mtype or "application/octet-stream"})
    except OSError:
        return jsonify({"error": "Could not read directory"}), 500

    return jsonify({"path": rel, "list": entries})

@app.route("/api/files/preview")
def api_files_preview():
    if "username" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    p = request.args.get("path")
    if not p:
        return jsonify({"error": "Missing path"}), 400
    base = user_folder(session["username"])
    try:
        target = _resolve_safe(base, p)
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400
    if not os.path.isfile(target):
        return jsonify({"error": "File not found"}), 404
    # send inline for preview; Flask will set Content-Type based on filename
    return send_file(target, as_attachment=False)

@app.route("/api/files/download")
def api_files_download():
    if "username" not in session:
        return jsonify({"error": "Unauthorized"}), 401
    p = request.args.get("path")
    if not p:
        return jsonify({"error": "Missing path"}), 400
    base = user_folder(session["username"])
    try:
        target = _resolve_safe(base, p)
    except ValueError:
        return jsonify({"error": "Invalid path"}), 400
    if not os.path.isfile(target):
        return jsonify({"error": "File not found"}), 404
    # send as attachment for download
    directory = os.path.dirname(target)
    filename = os.path.basename(target)
    return send_from_directory(directory, filename, as_attachment=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
