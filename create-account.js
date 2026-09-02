const createAccountForm =
    document.getElementById("createAccountForm");

const message = document.getElementById("message");

createAccountForm.addEventListener(
    "submit",
    async function (event) {
        event.preventDefault();

        const fullname =
            document.getElementById("fullname").value.trim();

        const username =
            document.getElementById("username").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const role =
            document.getElementById("role").value;

        const password =
            document.getElementById("password").value;

        const confirmPassword =
            document.getElementById("confirmPassword").value;

        const submitBtn = createAccountForm.querySelector("button[type='submit']");

        if (
            fullname === "" ||
            username === "" ||
            email === "" ||
            role === "" ||
            password === "" ||
            confirmPassword === ""
        ) {
            showMessage(
                "Please complete all fields.",
                "error"
            );
            return;
        }

        if (password.length < 6) {
            showMessage(
                "Password must contain at least 6 characters.",
                "error"
            );
            return;
        }

        if (password !== confirmPassword) {
            showMessage(
                "Passwords do not match.",
                "error"
            );
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = "Creating Account...";
            showMessage("Registering your account...", "info");

            await window.refmansyApi.auth.signUp(email, password, {
                fullname: fullname,
                username: username,
                role: role
            });

            showMessage(
                "Account created successfully! Redirecting to login...",
                "success"
            );

            createAccountForm.reset();

            setTimeout(function () {
                window.location.href = "login.html";
            }, 1500);
        } catch (error) {
            console.error("Account creation error:", error);
            showMessage(
                error.message || "Failed to create account. Please try again.",
                "error"
            );
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Account";
        }
    }
);

function showMessage(text, type) {
    message.textContent = text;
    message.className = "message " + type;
}