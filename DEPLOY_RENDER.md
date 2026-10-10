# Deploy MicroWorks and share a public link

This project is a Node.js Express web app. It must be deployed to a hosting provider before friends can access it; `localhost` only works on your own computer.

## Render deployment
1. Push the contents of this folder to a GitHub repository (do not commit `.env`).
2. In Render, choose **New → Web Service**, connect the repository, and set Root Directory to `MicroWorks-v2/server` if the repository contains the outer folder. If you upload only the contents of `MicroWorks-v2`, use `server` as the root directory.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render: `ADMIN_KEY`, `AUTH_SECRET`, `OTP_SECRET`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`. Use your real Gmail address and Gmail App Password. Never commit secrets.
6. Deploy. Render will give you an `https://<service-name>.onrender.com` URL that you can share with friends.

## Important data note
This demo stores accounts, requests, and uploads in local JSON/files. Free hosted instances can have ephemeral storage and may lose local file changes on redeploy/restart. Do not use this version for sensitive or production customer data until it is migrated to a managed database and durable file storage.
