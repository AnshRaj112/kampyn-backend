# Quick Deployment Reference

## 🚀 Automatic Deployment

The backend automatically deploys to Render when:
- ✅ PR is merged to `main` branch
- ✅ Direct commit to `main` branch

## 📋 Manual Setup Checklist

### 1. Render Setup
- [ ] Create web service in Render
- [ ] Get Service ID from URL (`srv-XXXXXXXXXXXXX`)
- [ ] Generate API token in Render account settings
- [ ] Disable auto-deploy in Render service settings

### 2. GitHub Secrets
- [ ] `RENDER_TOKEN` - Your Render API token
- [ ] `RENDER_SERVICE_ID` - Your Render service ID

### 3. Environment Variables (in Render)
- [ ] `NODE_ENV` = `production`
- [ ] `PORT` = `10000`
- [ ] `MONGO_URL` = Your MongoDB connection string
- [ ] `FRONTEND_URL` = Your frontend URL
- [ ] Add other required env vars

## 🔧 Validation

Run the validation script to check your setup:

```bash
npm run validate-cicd
```

## 📊 Monitoring

### Check Deployment Status
1. **GitHub Actions**: Go to Actions tab in repository
2. **Render Dashboard**: Check service logs and status
3. **Health Check**: `GET /api/health` endpoint

### Health Check Response
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

## 🐛 Troubleshooting

### Common Issues
- **Deployment fails**: Check GitHub Actions logs
- **Build fails**: Verify dependencies and scripts
- **Health check fails**: Check server startup logs
- **Environment issues**: Verify all env vars are set

### Debug Commands
```bash
# Test health endpoint locally
curl http://localhost:5001/api/health

# Check package.json scripts
npm run

# Validate CI/CD setup
npm run validate-cicd
```

## 📚 Documentation
- **Full Setup Guide**: `CI_CD_SETUP.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Render Docs**: https://render.com/docs

## 🔒 Security Notes
- Never commit API tokens to code
- Use GitHub secrets for sensitive data
- Limit merge access to main branch
- Monitor deployment logs regularly 