# CI/CD Pipeline Setup Guide

This guide explains how to set up automatic deployment of the KAMPYN backend to Render using GitHub Actions.

## Overview

The CI/CD pipeline automatically deploys the backend to Render when:
- A pull request is merged to the `main` branch
- A commit is pushed directly to the `main` branch

## Prerequisites

1. **Render Account**: You need a Render account with a web service created
2. **GitHub Repository**: The code must be in a GitHub repository
3. **Render API Token**: You need a Render API token for deployment

## Setup Steps

### 1. Create Render Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `bitesbay-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Choose appropriate plan (Starter recommended for development)

### 2. Get Render Service ID and API Token

#### Get Service ID:
1. Go to your Render service dashboard
2. The Service ID is in the URL: `https://dashboard.render.com/web/srv-XXXXXXXXXXXXX`
3. Copy the `srv-XXXXXXXXXXXXX` part

#### Get API Token:
1. Go to [Render Account Settings](https://dashboard.render.com/account)
2. Scroll to "API Keys" section
3. Click "Create API Key"
4. Give it a name like "GitHub Actions Deploy"
5. Copy the generated token

### 3. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click "New repository secret"
4. Add these secrets:

   **RENDER_TOKEN**
   - Name: `RENDER_TOKEN`
   - Value: Your Render API token

   **RENDER_SERVICE_ID**
   - Name: `RENDER_SERVICE_ID`
   - Value: Your Render service ID (e.g., `srv-XXXXXXXXXXXXX`)

### 4. Configure Environment Variables in Render

In your Render service dashboard, add these environment variables:

- `NODE_ENV`: `production`
- `PORT`: `10000` (or your preferred port)
- `MONGO_URL`: Your MongoDB connection string
- `FRONTEND_URL`: Your frontend URL
- Any other environment variables your app needs

### 5. Disable Auto-Deploy in Render

1. Go to your Render service settings
2. Under "Build & Deploy" section
3. Set "Auto-Deploy" to "No"
4. This ensures deployments only happen through GitHub Actions

## How It Works

### GitHub Actions Workflow

The workflow (`.github/workflows/deploy.yml`) does the following:

1. **Triggers**: Runs on push to main or PR merge to main
2. **Setup**: Checks out code and sets up Node.js 18
3. **Install**: Installs dependencies using `npm ci`
4. **Test**: Runs tests (if available)
5. **Deploy**: Triggers Render deployment via API
6. **Status**: Reports deployment success/failure

### Render Configuration

The `render.yaml` file defines:
- Service type and runtime
- Build and start commands
- Environment variables
- Health check endpoint

### Health Check

The backend includes a health check endpoint at `/api/health` that returns:
```json
{
  "status": "OK",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

## Testing the Pipeline

1. **Test PR Merge**:
   - Create a feature branch
   - Make changes
   - Create a PR to main
   - Merge the PR
   - Check GitHub Actions tab for deployment status

2. **Test Direct Push**:
   - Make changes directly to main branch
   - Push to GitHub
   - Check deployment status

## Troubleshooting

### Common Issues

1. **Deployment Fails**:
   - Check GitHub Actions logs
   - Verify Render API token and service ID
   - Ensure environment variables are set in Render

2. **Build Fails**:
   - Check `package.json` for correct scripts
   - Verify all dependencies are in `package.json`
   - Check for syntax errors in code

3. **Health Check Fails**:
   - Verify the `/api/health` endpoint is accessible
   - Check if the server is starting correctly
   - Review Render logs for errors

### Debugging

1. **GitHub Actions Logs**: Go to Actions tab in GitHub repository
2. **Render Logs**: Check your Render service dashboard
3. **Local Testing**: Test the health endpoint locally: `curl http://localhost:5001/api/health`

## Security Considerations

1. **API Token**: Keep your Render API token secure and never commit it to code
2. **Environment Variables**: Use GitHub secrets for sensitive data
3. **Access Control**: Limit who can merge to main branch
4. **Monitoring**: Set up alerts for failed deployments

## Maintenance

1. **Regular Updates**: Keep Node.js version and dependencies updated
2. **Monitoring**: Monitor deployment success rates
3. **Backup**: Keep backup of configuration files
4. **Documentation**: Update this guide when making changes

## Support

If you encounter issues:
1. Check GitHub Actions logs
2. Review Render service logs
3. Verify all configuration steps
4. Test locally before deploying 

---

## 1. **Fix the `cache-dependency-path` in Workflow**

If your `package-lock.json` is not in the path specified in your workflow, update it to the correct location.

- **If your backend is in the root:**
  ```yaml
  cache-dependency-path: 'package-lock.json'
  ```
- **If your backend is in a subfolder (e.g., `bitesbay-backend/`):**
  ```yaml
  cache-dependency-path: 'bitesbay-backend/package-lock.json'
  ```
- **If your repo is named `bitesbay-backend` and the lock file is in the root:**
  ```yaml
  cache-dependency-path: 'package-lock.json'
  ```

**Edit:**  
`.github/workflows/deploy.yml`  
Update the `cache-dependency-path` to match your actual file structure.

---

## 2. **Add More Robust Error Handling in Workflow**

You can improve the workflow by:
- Adding `continue-on-error: false` to critical steps (like install, test, deploy) to ensure failures are caught.
- Adding more descriptive error messages or notifications.

---

## 3. **Add/Improve Health Check Endpoint**

If you don’t already have a `/api/health` endpoint, or if it’s not robust, you can improve it in your backend code (e.g., `index.js`):

```js
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

---

## 4. **Add/Update Scripts in `package.json`**

Make sure you have the correct scripts for `start`, `test`, etc. For example:

```json
"scripts": {
  "start": "node index.js",
  "test": "echo \"No tests yet 