# MicroWorks V2 — PDF Upload + Request Acknowledgements

## Features
- Corporate-style responsive service website
- Request submission saved to `server/data/requests.json`
- Optional PDF attachment (PDF only, maximum 10 MB)
- Admin dashboard at `/admin`, including secure download link for attached PDF
- Email acknowledgement with request ID and subject `MicroWorks: Request Submitted – <request ID>` when SMTP is configured
- Optional custom SMS acknowledgement through Greatr SMS using your Android phone and SIM
- Request status and worker assignment management
- Android Studio WebView starter project

## Run on Windows
1. Install Node.js LTS.
2. Open Command Prompt in the `server` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and configure at least `ADMIN_KEY`. Configure SMTP to send email acknowledgements; configure Greatr SMS for SMS.
5. Run `npm start`.
6. Open `http://localhost:3000` and admin at `http://localhost:3000/admin`.

## Email setup
Copy `server/.env.example` to `server/.env` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `FROM_EMAIL` using credentials from your email provider. For Gmail, use an app password with 2-Step Verification rather than your normal account password. Do not commit `.env` or share secrets.

Email notifications cannot be delivered until valid SMTP credentials are configured. The app records the delivery state for each request.

## SMS setup (optional — Greatr SMS)
1. Create an account at https://sms.greatzern.com/ and install its Android app on a phone with an active SIM.
2. Register/pair the phone in the Greatr dashboard and make sure the device is online.
3. In the dashboard, create/copy your API key and copy the device ID.
4. Add these values to `server/.env` (never share them publicly):
   - `GREATR_API_KEY=your_private_api_key`
   - `GREATR_DEVICE_ID=your_registered_device_id`
5. Restart the Node.js server with `npm start` and submit a test request using a mobile number you control.

MicroWorks sends a custom acknowledgement through the Greatr SMS REST API. The recipient number is converted to international format; 10-digit local numbers are assumed to be Indian (+91). Other countries should be entered with the country code. The Android phone must remain powered on and connected to the internet, and your mobile carrier's SMS plan, coverage, anti-spam rules, and applicable Indian DLT/TRAI requirements still apply. Check Greatr's current plan limits before relying on it for production; “free” does not guarantee unlimited use.

## Admin
Open `/admin` and enter the key configured in `ADMIN_KEY`. The fallback `microworks-admin-2026` is for local development only. Replace it before any public deployment.

## Storage and safety
- Requests are stored in `server/data/requests.json`.
- PDFs are stored in `server/data/uploads/` and downloaded only through the admin-key-protected endpoint.
- Back up request data and uploaded files. JSON-file storage is suitable for local testing only; use a database and authenticated access for production.
- Use HTTPS, robust authentication, retention limits, privacy notices, and malware scanning before accepting public uploads in production.
- Assessment services should support preparation and legitimate coaching, not taking a live employer assessment on a customer's behalf.


## Signup and login with SMS OTP

1. Copy `server/.env.example` to `server/.env` (keep existing SMTP settings).
2. Set `AUTH_SECRET` and `OTP_SECRET` to separate long random secrets.
3. Configure `GREATR_API_KEY` and `GREATR_DEVICE_ID` from your Greatr dashboard. The Android phone must be registered, online, and able to send SMS.
4. In `server`, run `npm install` and `npm start`.
5. Open `http://localhost:3000/auth` to sign up or log in by SMS OTP.

Signup creates an account after successful phone OTP verification. Login sends an OTP to the registered phone. OTPs expire after 5 minutes, resend is limited to one per minute per phone, and verification attempts are limited to five per OTP. Account records are stored in `server/data/users.json`; back up this file. For production use, use a database, HTTPS, persistent rate limiting, and a secure server-side session/cookie strategy. The current demo stores a signed token in browser localStorage.
