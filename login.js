// ================================================================
// Login & Account Recovery Controller
// ================================================================

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const roleInput = document.getElementById("role");
const showPassword = document.getElementById("showPassword");
const message = document.getElementById("message");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const unconfirmedAlert = document.getElementById("unconfirmedAlert");
const verifyNowBtn = document.getElementById("verifyNowBtn");

// Modal Elements
const recoveryModal = document.getElementById("recoveryModal");
const closeRecoveryModal = document.getElementById("closeRecoveryModal");
const recoveryStep1 = document.getElementById("recoveryStep1");
const recoveryStep2 = document.getElementById("recoveryStep2");
const recoveryStep3 = document.getElementById("recoveryStep3");
const recoveryStepSuccess = document.getElementById("recoveryStepSuccess");

const recoveryRequestForm = document.getElementById("recoveryRequestForm");
const recoveryEmailInput = document.getElementById("recoveryEmail");
const recoveryMessage1 = document.getElementById("recoveryMessage1");
const sendRecoveryCodeBtn = document.getElementById("sendRecoveryCodeBtn");

const recoveryEmailDisplay = document.getElementById("recoveryEmailDisplay");
const recoveryMessage2 = document.getElementById("recoveryMessage2");
const resendRecoveryOtpBtn = document.getElementById("resendRecoveryOtpBtn");
const recoveryResendTimer = document.getElementById("recoveryResendTimer");
const recoveryBackStep1 = document.getElementById("recoveryBackStep1");

const newPasswordForm = document.getElementById("newPasswordForm");
const newPasswordInput = document.getElementById("newPassword");
const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
const recoveryMessage3 = document.getElementById("recoveryMessage3");
const saveNewPasswordBtn = document.getElementById("saveNewPasswordBtn");
const recoveryDoneBtn = document.getElementById("recoveryDoneBtn");
const unconfirmedNotice = document.getElementById("unconfirmedNotice");

// State
let currentRecoveryEmail = "";
let lastAttemptedEmail = "";
let recoveryTimerInterval = null;
let unconfirmedTimerInterval = null;
const COOLDOWN_SECONDS = 60;

// Check URL query parameters and recovery link hashes
(function checkQueryParamsAndRecoveryHash() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("verified") === "true") {
        showMessage("Email verified successfully! You may now log in.", "success");
    }

    // Check if user arrived by clicking a password reset email link
    const hash = window.location.hash || "";
    if (hash.includes("type=recovery") || hash.includes("access_token=")) {
        setTimeout(() => {
            openRecoveryModal();
            hideAllModalSteps();
            recoveryStep3.style.display = "block";
            showModalMessage("Identity verified via recovery link. Please set your new password below.", "info", recoveryMessage3);
            setTimeout(() => newPasswordInput.focus(), 200);
        }, 300);
    }
})();

// Listen for Supabase Auth PASSWORD_RECOVERY event
if (window.refmansyApi?.client?.auth?.onAuthStateChange) {
    window.refmansyApi.client.auth.onAuthStateChange(async (event, session) => {
        if (event === "PASSWORD_RECOVERY") {
            openRecoveryModal();
            hideAllModalSteps();
            recoveryStep3.style.display = "block";
            showModalMessage("Identity verified. Enter your new password below.", "info", recoveryMessage3);
            setTimeout(() => newPasswordInput.focus(), 200);
        }
    });
}

// Show or hide the password
showPassword.addEventListener("change", function () {
    passwordInput.type = this.checked ? "text" : "password";
});

// -------------------------------------------------------------
// Standard Login Action with Unconfirmed User Intercept
// -------------------------------------------------------------
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const usernameOrEmail = usernameInput.value.trim();
    const password = passwordInput.value;
    const selectedRole = roleInput.value;
    const submitBtn = loginForm.querySelector("button[type='submit']");

    if (!usernameOrEmail || !password || !selectedRole) {
        showMessage("Please complete all fields.", "error");
        return;
    }

    lastAttemptedEmail = usernameOrEmail;
    unconfirmedAlert.style.display = "none";
    if (unconfirmedNotice) unconfirmedNotice.style.display = "none";

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Logging in...";
        showMessage("Verifying credentials...", "info");

        const { profile } = await window.refmansyApi.auth.signIn(
            usernameOrEmail,
            password,
            selectedRole
        );

        showMessage("Login successful! Redirecting...", "success");

        setTimeout(function () {
            if (profile.role === "admin") {
                window.location.href = "admin-dashboard.html";
            } else {
                window.location.href = "faculty-dashboard.html";
            }
        }, 800);
    } catch (error) {
        console.error("Login error:", error);
        submitBtn.disabled = false;
        submitBtn.textContent = "Login";

        const errString = (error.message || "").toLowerCase();

        // Check if user is unconfirmed
        if (errString.includes("email not confirmed") || errString.includes("unconfirmed")) {
            showMessage("", "");
            unconfirmedAlert.style.display = "flex";
            return;
        }

        let errorMsg = error.message || "Login failed. Please check your credentials.";
        if (errorMsg.includes("Invalid login credentials")) {
            errorMsg = "Incorrect username/email or password.";
        }
        showMessage(errorMsg, "error");
    }
});

// Unconfirmed banner "Resend Confirmation Link" action
verifyNowBtn.addEventListener("click", async function () {
    let emailToVerify = lastAttemptedEmail;

    // If username was entered, attempt profile lookup
    if (!emailToVerify.includes("@")) {
        try {
            const { data } = await window.refmansyApi.client
                .from("profiles")
                .select("email")
                .ilike("username", emailToVerify)
                .maybeSingle();
            if (data?.email) emailToVerify = data.email;
        } catch (e) {
            console.warn("Profile email lookup failed:", e);
        }
    }

    if (!emailToVerify || !emailToVerify.includes("@")) {
        showMessage("Please enter your registered email address above first.", "error");
        return;
    }

    try {
        verifyNowBtn.disabled = true;
        verifyNowBtn.textContent = "Sending...";

        await window.refmansyApi.auth.resendSignUpOtp(emailToVerify);

        if (unconfirmedNotice) {
            unconfirmedNotice.textContent = "Confirmation link sent! Please check your inbox (and spam).";
            unconfirmedNotice.style.display = "block";
        }

        let countdown = COOLDOWN_SECONDS;
        clearInterval(unconfirmedTimerInterval);
        unconfirmedTimerInterval = setInterval(() => {
            countdown--;
            if (countdown <= 0) {
                clearInterval(unconfirmedTimerInterval);
                verifyNowBtn.disabled = false;
                verifyNowBtn.textContent = "Resend Confirmation Link";
            } else {
                verifyNowBtn.textContent = `Resend Link (${countdown}s)`;
            }
        }, 1000);
    } catch (err) {
        console.error("Resend confirmation error:", err);
        verifyNowBtn.disabled = false;
        verifyNowBtn.textContent = "Resend Confirmation Link";
        if (unconfirmedNotice) {
            unconfirmedNotice.textContent = err.message || "Could not resend link. Please wait a moment.";
            unconfirmedNotice.style.display = "block";
        }
    }
});

// -------------------------------------------------------------
// Recovery Modal Navigation & State
// -------------------------------------------------------------
forgotPasswordLink.addEventListener("click", function (e) {
    e.preventDefault();
    openRecoveryModal();
});

closeRecoveryModal.addEventListener("click", closeModal);

recoveryModal.addEventListener("click", function (e) {
    if (e.target === recoveryModal) closeModal();
});

recoveryDoneBtn.addEventListener("click", function () {
    closeModal();
    showMessage("Password updated successfully. Please log in with your new password.", "success");
});

function openRecoveryModal(initialEmail = "") {
    currentRecoveryEmail = initialEmail;
    clearInterval(recoveryTimerInterval);

    // Reset views
    hideAllModalSteps();
    clearModalMessages();

    recoveryStep1.style.display = "block";
    if (initialEmail) {
        recoveryEmailInput.value = initialEmail;
    } else if (usernameInput.value.includes("@")) {
        recoveryEmailInput.value = usernameInput.value.trim();
    }
    setTimeout(() => recoveryEmailInput.focus(), 100);

    recoveryModal.style.display = "flex";
}

function closeModal() {
    recoveryModal.style.display = "none";
    clearInterval(recoveryTimerInterval);
    hideAllModalSteps();
    recoveryStep1.style.display = "block";
}

function hideAllModalSteps() {
    recoveryStep1.style.display = "none";
    recoveryStep2.style.display = "none";
    recoveryStep3.style.display = "none";
    recoveryStepSuccess.style.display = "none";
}

function clearModalMessages() {
    showModalMessage("", "", recoveryMessage1);
    showModalMessage("", "", recoveryMessage2);
    showModalMessage("", "", recoveryMessage3);
}

// -------------------------------------------------------------
// STEP 1: Request Password Recovery Link
// -------------------------------------------------------------
recoveryRequestForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = recoveryEmailInput.value.trim();

    if (!email) {
        showModalMessage("Please enter your email address.", "error", recoveryMessage1);
        return;
    }

    try {
        sendRecoveryCodeBtn.disabled = true;
        sendRecoveryCodeBtn.textContent = "Sending Link...";
        showModalMessage("Dispatching password reset link...", "info", recoveryMessage1);

        await window.refmansyApi.auth.sendPasswordResetOtp(email);

        currentRecoveryEmail = email;
        recoveryEmailDisplay.textContent = email;

        // Transition to Step 2
        hideAllModalSteps();
        recoveryStep2.style.display = "block";

        showModalMessage("A password reset link has been sent to your email.", "info", recoveryMessage2);
        startRecoveryTimer();
    } catch (error) {
        console.error("Password reset request error:", error);
        showModalMessage(
            error.message || "Failed to send reset link. Please try again.",
            "error",
            recoveryMessage1
        );
    } finally {
        sendRecoveryCodeBtn.disabled = false;
        sendRecoveryCodeBtn.textContent = "Send Reset Link";
    }
});

// -------------------------------------------------------------
// STEP 2: Resend Recovery Link & Timer
// -------------------------------------------------------------
resendRecoveryOtpBtn.addEventListener("click", async function () {
    if (!currentRecoveryEmail || resendRecoveryOtpBtn.disabled) return;

    try {
        resendRecoveryOtpBtn.disabled = true;
        showModalMessage("Sending a fresh reset link...", "info", recoveryMessage2);

        await window.refmansyApi.auth.sendPasswordResetOtp(currentRecoveryEmail);

        showModalMessage("A fresh reset link has been dispatched to your email.", "success", recoveryMessage2);
        startRecoveryTimer();
    } catch (error) {
        console.error("Resend recovery link error:", error);
        let errorMsg = error.message || "Unable to resend link right now.";
        if (errorMsg.includes("rate limit")) {
            errorMsg = "Too many requests. Please wait a moment before trying again.";
        }
        showModalMessage(errorMsg, "error", recoveryMessage2);
        resendRecoveryOtpBtn.disabled = false;
    }
});

function startRecoveryTimer() {
    clearInterval(recoveryTimerInterval);
    let secondsLeft = COOLDOWN_SECONDS;
    resendRecoveryOtpBtn.disabled = true;
    recoveryResendTimer.textContent = secondsLeft;

    recoveryTimerInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(recoveryTimerInterval);
            resendRecoveryOtpBtn.disabled = false;
            resendRecoveryOtpBtn.innerHTML = "Resend Link";
        } else {
            recoveryResendTimer.textContent = secondsLeft;
            resendRecoveryOtpBtn.innerHTML = `Resend Link (<span id="recoveryResendTimer">${secondsLeft}</span>s)`;
        }
    }, 1000);
}

// Back to Step 1 from Step 2
recoveryBackStep1.addEventListener("click", function (e) {
    e.preventDefault();
    clearInterval(recoveryTimerInterval);
    hideAllModalSteps();
    recoveryStep1.style.display = "block";
    clearModalMessages();
});

// -------------------------------------------------------------
// STEP 3: Set New Password Form Submission
// -------------------------------------------------------------
newPasswordForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmNewPasswordInput.value;

    if (!newPassword || !confirmPassword) {
        showModalMessage("Please fill in both password fields.", "error", recoveryMessage3);
        return;
    }

    if (newPassword.length < 6) {
        showModalMessage("Password must contain at least 6 characters.", "error", recoveryMessage3);
        return;
    }

    if (newPassword !== confirmPassword) {
        showModalMessage("Passwords do not match.", "error", recoveryMessage3);
        return;
    }

    try {
        saveNewPasswordBtn.disabled = true;
        saveNewPasswordBtn.textContent = "Updating Password...";
        showModalMessage("Applying new password...", "info", recoveryMessage3);

        await window.refmansyApi.auth.updatePassword(newPassword);

        // Transition to Success Step
        hideAllModalSteps();
        recoveryStepSuccess.style.display = "block";
    } catch (error) {
        console.error("Password update error:", error);
        showModalMessage(
            error.message || "Failed to update password. Please try again.",
            "error",
            recoveryMessage3
        );
        saveNewPasswordBtn.disabled = false;
        saveNewPasswordBtn.textContent = "Update Password";
    }
});

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function showMessage(text, type) {
    if (!text) {
        message.style.display = "none";
        message.textContent = "";
        return;
    }
    message.textContent = text;
    message.className = "message " + type;
    message.style.display = "block";
}

function showModalMessage(text, type, targetElement) {
    if (!text) {
        targetElement.style.display = "none";
        targetElement.textContent = "";
        return;
    }
    targetElement.textContent = text;
    targetElement.className = "message " + type;
    targetElement.style.display = "block";
}