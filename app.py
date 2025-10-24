from flask import Flask, render_template, request, redirect, url_for, session, send_from_directory, flash
import os, json
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
    return path

def total_size(folder):
    return sum(os.path.getsize(os.path.join(folder, f)) for f in os.listdir(folder)) if os.path.exists(folder) else 0

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
        if total_size(folder) + len(file_contents) > MAX_STORAGE:
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
