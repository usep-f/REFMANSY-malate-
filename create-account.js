// Self-registration is disabled. Redirect to login.
window.location.replace("login.html");

const stepRegistration = document.getElementById("stepRegistration");
const stepOtpVerification = document.getElementById("stepOtpVerification");
const createAccountForm = document.getElementById("createAccountForm");
const message = document.getElementById("message");
const otpMessage = document.getElementById("otpMessage");
const otpEmailDisplay = document.getElementById("otpEmailDisplay");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const resendTimer = document.getElementById("resendTimer");
const otpBackLink = document.getElementById("otpBackLink");

let currentRegistrationEmail = "";
let resendInterval = null;
let pollingInterval = null;
const COOLDOWN_SECONDS = 60;

// -------------------------------------------------------------
// STEP 1: Registration Form Submission
// -------------------------------------------------------------
createAccountForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const fullname = document.getElementById("fullname").value.trim();
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const role = document.getElementById("role").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const submitBtn = createAccountForm.querySelector("button[type='submit']");

    if (!fullname || !username || !email || !role || !password || !confirmPassword) {
        showMessage("Please complete all fields.", "error", message);
        return;
    }

    if (password.length < 6) {
        showMessage("Password must contain at least 6 characters.", "error", message);
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Passwords do not match.", "error", message);
        return;
    }

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating Account...";
        showMessage("Registering your account...", "info", message);

        await window.refmansyApi.auth.signUp(email, password, {
            fullname: fullname,
            username: username,
            role: role
        });

        // Store email for confirmation display
        currentRegistrationEmail = email;
        otpEmailDisplay.textContent = email;

        // Smooth transition to Step 2
        stepRegistration.style.display = "none";
        stepOtpVerification.style.display = "block";
        stepOtpVerification.classList.add("auth-step");

        showMessage("Confirmation link dispatched! Please check your inbox.", "info", otpMessage);
        startResendTimer();
        startConfirmationPolling();
    } catch (error) {
        console.error("Account creation error:", error);
        let errorMsg = error.message || "Failed to create account. Please try again.";
        if (errorMsg.toLowerCase().includes("rate limit")) {
            errorMsg = "Email rate limit exceeded: Supabase default email allows only ~3-4 emails per hour. Please wait for the cooldown or connect a Custom SMTP in Supabase.";
        }
        showMessage(errorMsg, "error", message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
    }
});

// -------------------------------------------------------------
// Resend Confirmation Link & Cooldown Timer
// -------------------------------------------------------------
resendOtpBtn.addEventListener("click", async function () {
    if (!currentRegistrationEmail || resendOtpBtn.disabled) return;

    try {
        resendOtpBtn.disabled = true;
        showMessage("Sending a new confirmation link...", "info", otpMessage);

        await window.refmansyApi.auth.resendSignUpOtp(currentRegistrationEmail);

        showMessage("A fresh confirmation link has been sent to your email.", "success", otpMessage);
        startResendTimer();
    } catch (error) {
        console.error("Resend confirmation error:", error);
        let errorMsg = error.message || "Unable to resend link right now.";
        if (errorMsg.includes("rate limit") || errorMsg.includes("security purposes")) {
            errorMsg = "Too many requests. Please wait a moment before trying again.";
        }
        showMessage(errorMsg, "error", otpMessage);
        resendOtpBtn.disabled = false;
    }
});

function startResendTimer() {
    clearInterval(resendInterval);
    let secondsLeft = COOLDOWN_SECONDS;
    resendOtpBtn.disabled = true;
    resendTimer.textContent = secondsLeft;

    resendInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(resendInterval);
            resendOtpBtn.disabled = false;
            resendOtpBtn.innerHTML = "Resend Link";
        } else {
            resendTimer.textContent = secondsLeft;
            resendOtpBtn.innerHTML = `Resend Link (<span id="resendTimer">${secondsLeft}</span>s)`;
        }
    }, 1000);
}

// -------------------------------------------------------------
// Real-time Detection of Email Confirmation
// -------------------------------------------------------------
if (window.refmansyApi?.client?.auth?.onAuthStateChange) {
    window.refmansyApi.client.auth.onAuthStateChange(async (event, session) => {
        if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user?.email_confirmed_at) {
            handleConfirmationSuccess();
        }
    });
}

function startConfirmationPolling() {
    clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
        try {
            const session = await window.refmansyApi.auth.getSession();
            if (session?.user?.email_confirmed_at) {
                handleConfirmationSuccess();
            }
        } catch (e) {
            // Ignore background polling errors
        }
    }, 3500);
}

function handleConfirmationSuccess() {
    clearInterval(resendInterval);
    clearInterval(pollingInterval);
    showMessage("Email confirmed successfully! Redirecting to login...", "success", otpMessage);
    setTimeout(() => {
        window.location.href = "login.html?verified=true";
    }, 1200);
}

// -------------------------------------------------------------
// Back to Registration (Edit details)
// -------------------------------------------------------------
otpBackLink.addEventListener("click", function (e) {
    e.preventDefault();
    clearInterval(resendInterval);
    clearInterval(pollingInterval);
    stepOtpVerification.style.display = "none";
    stepRegistration.style.display = "block";

    const submitBtn = createAccountForm.querySelector("button[type='submit']");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Account";
    }
    showMessage("", "", message);
});

// -------------------------------------------------------------
// Helper: Show Message
// -------------------------------------------------------------
function showMessage(text, type, targetElement = message) {
    if (!text) {
        targetElement.style.display = "none";
        targetElement.textContent = "";
        return;
    }
    targetElement.textContent = text;
    targetElement.className = "message " + type;
    targetElement.style.display = "block";
}