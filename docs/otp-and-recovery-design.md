# Refmansy: Email OTP Registration Verification & Password Recovery Specification

## 1. Executive Summary & Context

This specification outlines the architecture, data flow, user interface, and implementation plan for adding **Email-based One-Time Password (OTP) verification for new user registrations** and an **Account / Password Recovery modal flow** in the Refmansy research management system using existing Supabase infrastructure.

---

## 2. Shared Understanding & Scope

* **Purpose:** Ensure genuine faculty and administrator registrations through verified email addresses, eliminate bot/spam accounts, and empower users with a reliable self-service password recovery flow.
* **Target Users:** School administrators and faculty researchers of Leyte National High School (LCNHS).
* **Delivery Channel:** 6-digit numeric OTP delivered via Email using Supabase Auth's built-in email service (and custom SMTP when configured).
* **Target Interface:**
  * In-place card step transition on `create-account.html`.
  * Interactive modal on `login.html` with full 3-step password reset capabilities.
  * Inline unconfirmed account intercept on `login.html` allowing unverified users to verify without re-registering.
* **Non-Goals:**
  * No SMS/telecom carrier integrations (Twilio, MessageBird, etc.).
  * No magic-link-only workflows (numeric 6-digit OTP codes are the primary interaction).
  * No third-party authenticator app MFA (TOTP) in this phase.

---

## 3. Assumptions

1. **Supabase Auth Configuration:** The Supabase project has *"Confirm email"* enabled under Authentication > Providers > Email.
2. **Email Template Tokens:** The email templates for *"Confirm signup"* and *"Reset password"* in the Supabase Dashboard include the `{{ .Token }}` tag to supply the 6-digit numeric code.
3. **Resend Rate Protection:** Client-side 60-second countdown timers prevent users from spamming the "Resend Code" button and hitting email rate limits.
4. **Role Agnostic Recovery:** Password reset operates uniformly on the registered email address regardless of whether the user role is `faculty` or `admin`.
5. **Session Hygiene:** Completing a password reset clears the temporary recovery session and directs the user to perform a fresh login with their new password.

---

## 4. Complete Decision Log

| ID | Decision | Alternatives Considered | Rationale |
|:---|:---|:---|:---|
| **D1** | **Email Delivery Channel** | SMS OTP, Dual Email + SMS | Leverages existing user emails and native Supabase Auth without incurring telecom costs or requiring third-party SMS API credentials. |
| **D2** | **Registration Flow UX** | Dedicated `verify-otp.html`, deferred verification on login | In-place card step switch on `create-account.html` keeps the user in flow without jarring page transitions. |
| **D3** | **Password Recovery UX** | Standalone `forgot-password.html` page | An accessible modal on `login.html` keeps the user anchored to the login portal and matches modern SPA patterns. |
| **D4** | **Unconfirmed User Handling** | Static error message only | Intercepting `Email not confirmed` and opening the verification modal with prefilled email allows users to easily recover if they closed the browser after registration. |
| **D5** | **Architecture Choice** | Global injected script (`otp.js`), minimal basic prompts | Native modular design (Approach 1) ensures lightweight, predictable Vanilla JS/CSS without script injection race conditions. |

---

## 5. Architectural & Technical Design

### 5.1 API Service Layer (`supabase-client.js`)
Extend `refmansyApi.auth` with five core helper methods:

```javascript
// Verify registration 6-digit OTP
async verifySignUpOtp(email, token) {
    const { data, error } = await supabaseClient.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'signup'
    });
    if (error) throw error;
    return data;
},

// Resend signup OTP email
async resendSignUpOtp(email) {
    const { data, error } = await supabaseClient.auth.resend({
        type: 'signup',
        email: email.trim()
    });
    if (error) throw error;
    return data;
},

// Request password recovery OTP
async sendPasswordResetOtp(email) {
    const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
    return data;
},

// Verify password recovery OTP
async verifyPasswordResetOtp(email, token) {
    const { data, error } = await supabaseClient.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'recovery'
    });
    if (error) throw error;
    return data;
},

// Set new password and sign out of temporary recovery session
async updatePassword(newPassword) {
    const { data, error } = await supabaseClient.auth.updateUser({
        password: newPassword
    });
    if (error) throw error;
    await supabaseClient.auth.signOut();
    return data;
}
```

### 5.2 Registration View (`create-account.html` & `create-account.js`)
* **Step 1:** Current account creation form (Full Name, Username, Email, Account Type, Password, Confirm Password).
* **Step 2:**
  * Triggered upon successful `refmansyApi.auth.signUp()` call.
  * Form cards switch smoothly via CSS `.step-hidden` and `.step-active`.
  * Displays user's email address and a button to *"Edit email / Go back"*.
  * Segmented 6-digit OTP entry field with auto-focus advance, backspace navigation, and clipboard paste support.
  * 60-second cooldown timer for the *"Resend Code"* action.
  * Submitting calls `verifySignUpOtp(email, token)`. Upon success, displays green confirmation and redirects to `login.html`.

### 5.3 Login View & Password Recovery Modal (`login.html` & `login.js`)
* **Login Form Updates:**
  * Added **"Forgot password?"** link beneath the password field.
* **Modal Structure (`#recoveryModal`):**
  * Step 1 (Request): User enters email &rarr; calls `sendPasswordResetOtp(email)`.
  * Step 2 (Verify): User inputs 6-digit OTP &rarr; calls `verifyPasswordResetOtp(email, token)`.
  * Step 3 (Reset): User inputs new password and confirmation &rarr; calls `updatePassword(newPassword)`.
  * Success View: Confirms password change &rarr; closes modal &rarr; prompts user to log in.
* **Unconfirmed Email Intercept:**
  * In `login.js`, catch errors containing `"Email not confirmed"`.
  * Display a dedicated alert with an action button: *"Your email is not verified yet. [Verify Now]"*.
  * Clicking *"Verify Now"* opens the OTP modal in verification mode with the user's email prefilled, resends the code, and allows immediate completion.

---

## 6. Supabase Project Configuration Checklist

1. **Auth Settings:**
   * Go to **Authentication > Providers > Email**.
   * Turn **ON** `Enable Email provider`.
   * Turn **ON** `Confirm email`.
2. **Email Templates:**
   * **Confirm signup:** Modify template body to display the 6-digit token using `{{ .Token }}`.
   * **Reset password:** Modify template body to display the 6-digit token using `{{ .Token }}`.
3. **Rate Limits & SMTP:**
   * Default Supabase email service is active for testing (max ~3-30 emails/hr).
   * For production rollout, configure custom SMTP (e.g. Gmail SMTP or Resend) under **Authentication > SMTP Settings**.

---

## 7. Quality Assurance & Verification Plan

1. **Registration OTP Verification:**
   * Sign up with a test email &rarr; Verify Step 2 appears.
   * Enter incorrect OTP &rarr; Verify error message appears and inputs remain editable.
   * Wait for 60s cooldown &rarr; Click Resend Code &rarr; Verify new OTP arrives.
   * Enter correct OTP &rarr; Verify email is confirmed in Supabase and redirected to login.
2. **Unconfirmed User Login Intercept:**
   * Create an account without verifying &rarr; Attempt login &rarr; Catch `Email not confirmed` &rarr; Verify prompt opens OTP modal &rarr; Complete verification.
3. **Password Recovery:**
   * Click "Forgot Password" on login page &rarr; Submit registered email &rarr; Verify 6-digit OTP received.
   * Enter OTP &rarr; Submit new password &rarr; Verify password updated.
   * Log in with new password &rarr; Verify successful login and role routing.
