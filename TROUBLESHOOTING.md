# CI/CD Troubleshooting Guide

## 🚨 Common Deployment Errors

### 400 Bad Request Error

**Symptoms:**
- GitHub Actions fails with status code 400
- Empty response body
- Deployment not triggered on Render

**Common Causes & Solutions:**

#### 1. **Service Type Mismatch**
- **Problem**: Your Render service is not a web service
- **Solution**: 
  - Go to Render dashboard
  - Ensure your service is a "Web Service" (not Background Worker, Static Site, etc.)
  - If it's the wrong type, create a new web service

#### 2. **Service is Paused/Suspended**
- **Problem**: Service is paused due to inactivity or billing issues
- **Solution**:
  - Go to Render dashboard
  - Resume the service if it's paused
  - Check billing status if suspended

#### 3. **Invalid Service ID**
- **Problem**: Wrong service ID in GitHub secrets
- **Solution**:
  - Go to your Render service dashboard
  - Copy the service ID from URL: `https://dashboard.render.com/web/srv-XXXXXXXXXXXXX`
  - Update `RENDER_SERVICE_ID` in GitHub secrets

#### 4. **Auto-Deploy Still Enabled**
- **Problem**: Render's auto-deploy conflicts with GitHub Actions
- **Solution**:
  - Go to Render service settings
  - Set "Auto-Deploy" to "No"
  - Save changes

### 401 Unauthorized Error

**Symptoms:**
- Status code 401
- "Unauthorized" in response

**Solution:**
- Regenerate your Render API token
- Update `RENDER_TOKEN` in GitHub secrets
- Ensure token has proper permissions

### 404 Not Found Error

**Symptoms:**
- Status code 404
- "Service not found" in response

**Solution:**
- Verify `RENDER_SERVICE_ID` is correct
- Check if service exists in your Render account
- Ensure you're using the right account

## 🔧 Debugging Steps

### 1. **Check GitHub Secrets**
```bash
# In GitHub Actions, the workflow will now show:
# - Service ID (first few characters)
# - Token length (to verify it's set)
```

### 2. **Verify Render Service**
- Go to [Render Dashboard](https://dashboard.render.com/)
- Find your service
- Check service type (should be "Web Service")
- Check service status (should be "Live" or "Building")

### 3. **Test API Manually**
```bash
# Test service access
curl -X GET "https://api.render.com/v1/services/YOUR_SERVICE_ID" \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Test deployment trigger
curl -X POST "https://api.render.com/v1/services/YOUR_SERVICE_ID/deploys" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clearCache": "do_not_clear"}'
```

### 4. **Check Render Logs**
- Go to your Render service dashboard
- Check "Logs" tab for any errors
- Look for build or deployment failures

## 🛠️ Quick Fixes

### For 400 Error:
1. **Disable Auto-Deploy** in Render
2. **Verify Service Type** is "Web Service"
3. **Check Service Status** is not paused
4. **Regenerate API Token** if needed

### For Build Failures:
1. **Check package.json** has correct scripts
2. **Verify dependencies** are in package.json
3. **Test locally** with `npm install && npm start`

### For Environment Issues:
1. **Set all required env vars** in Render
2. **Check MONGO_URL** is accessible
3. **Verify FRONTEND_URL** is correct

## 📋 Checklist

Before running the workflow:

- [ ] Render service is "Web Service" type
- [ ] Service is not paused/suspended
- [ ] Auto-deploy is disabled in Render
- [ ] GitHub secrets are set correctly
- [ ] Environment variables are configured
- [ ] Health check endpoint exists (`/api/health`)

## 🆘 Still Having Issues?

1. **Check the enhanced workflow logs** - they now show more details
2. **Test API manually** using the curl commands above
3. **Review Render documentation**: https://render.com/docs
4. **Check service logs** in Render dashboard
5. **Verify GitHub Actions permissions** for the repository

## 📞 Support

If you're still stuck:
1. Share the complete GitHub Actions log
2. Include your Render service configuration (without sensitive data)
3. Check if the issue persists after following all steps above 