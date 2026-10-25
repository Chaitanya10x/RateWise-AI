# Deployment Guide

## Backend on AWS Elastic Beanstalk

1. Create a Node.js 20+ Elastic Beanstalk environment.
2. Upload `deploy/ratewise-ai-backend-eb.zip`.
3. Set environment properties in Elastic Beanstalk:
   - `NODE_ENV=production`
   - `GEMINI_API_KEY=your_gemini_api_key`
   - `GEMINI_MODEL=gemini-3.5-flash`
   - `APP_ORIGIN=https://YOUR_FRONTEND_HOST`
4. Ensure the environment can make outbound HTTPS requests to Google Gemini.
5. Open `https://YOUR_API_HOST/health` and confirm `missingRequired` is empty.

The backend package includes:

```text
src/
package.json
package-lock.json
Procfile
.ebignore
.env.example
```

Do not upload `.env` or `node_modules`.

## React Native Release

Install the React Native app dependencies:

```bash
cd app
npm install
```

Set `EXPO_PUBLIC_API_BASE_URL=https://YOUR_API_HOST` in the frontend build environment.

Run native builds from the React Native app folder:

```bash
npm run android
npm run ios
```

Camera and gallery permissions are configured in `app/app.json`.
