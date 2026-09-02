const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const roleInput = document.getElementById("role");
const showPassword = document.getElementById("showPassword");
const message = document.getElementById("message");

// Show or hide the password
showPassword.addEventListener("change", function () {
    passwordInput.type = this.checked ? "text" : "password";
});

// Login
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const usernameOrEmail = usernameInput.value.trim();
    const password = passwordInput.value;
    const selectedRole = roleInput.value;
    const submitBtn = loginForm.querySelector("button[type='submit']");

    if (
        usernameOrEmail === "" ||
        password === "" ||
        selectedRole === ""
    ) {
        showMessage(
            "Please complete all fields.",
            "error"
        );
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";
        showMessage("Verifying credentials...", "info");

        const { profile } = await window.refmansyApi.auth.signIn(
            usernameOrEmail,
            password,
            selectedRole
        );

        showMessage(
            "Login successful! Redirecting...",
            "success"
        );

        setTimeout(function () {
            if (profile.role === "admin") {
                window.location.href = "admin-dashboard.html";
            } else {
                window.location.href = "faculty-dashboard.html";
            }
        }, 800);
    } catch (error) {
        console.error("Login error:", error);
        let errorMsg = error.message || "Login failed. Please check your credentials.";
        if (errorMsg.includes("Invalid login credentials")) {
            errorMsg = "Incorrect username/email or password.";
        }
        showMessage(errorMsg, "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Login";
    }
});

function showMessage(text, type) {
    message.textContent = text;
    message.className = "message " + type;
}