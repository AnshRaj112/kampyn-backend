# 🚀 Complete Setup Guide - Fix Invoice Generation & Razorpay Integration

This guide will help you fix the "Required entities not found for invoice generation" error and set up the Razorpay integration.

## 🚨 **The Problem**

You're getting this error:
```
❌ Error generating invoices: Error: Required entities not found for invoice generation
```

This happens because the invoice generation system requires:
1. ✅ **Vendor** - with valid `uniID`
2. ✅ **University** - that the vendor belongs to
3. ✅ **Admin** - with role 'super-admin'

## 🔧 **Step-by-Step Solution**

### **Step 1: Set Up Environment Variables**

Run the setup script to create environment files:

```bash
cd bitesbay-backend
node scripts/setup-env.js
```

This will create:
- `bitesbay-backend/.env` (backend environment)
- `bitesbay-frontend/.env.local` (frontend environment)

### **Step 2: Update Razorpay Secret Key**

**IMPORTANT**: You need to get your actual Razorpay secret key:

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings > API Keys**
3. Copy the **Secret Key** (not the Key ID)

Update both environment files:

**Backend (.env):**
```env
RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
RAZORPAY_KEY_SECRET=your_actual_secret_key_here
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
NEXT_PUBLIC_RAZORPAY_KEY_SECRET=your_actual_secret_key_here
```

### **Step 3: Check Current Database State**

Run the diagnostic script to see what's missing:

```bash
cd bitesbay-backend
node scripts/check-invoice-entities.js
```

This will show you:
- How many vendors exist
- How many universities exist
- How many admins exist
- Any orphaned orders

### **Step 4: Create Missing Entities**

If entities are missing, run the creation script:

```bash
cd bitesbay-backend
node scripts/create-missing-entities.js
```

This will create:
- **KIIT University** (if missing)
- **Sample Food Vendor** (if missing)
- **Super Admin** (if missing)

### **Step 5: Restart Your Server**

After creating the entities, restart your backend server:

```bash
# Stop current server (Ctrl+C)
# Then restart
npm start
# or
node index.js
```

## 📊 **What Each Script Does**

### **`setup-env.js`**
- Creates `.env` and `.env.local` files
- Sets up default configuration
- Provides instructions for next steps

### **`check-invoice-entities.js`**
- Connects to database
- Counts existing entities
- Identifies missing relationships
- Shows detailed status report

### **`create-missing-entities.js`**
- Creates missing universities
- Creates missing vendors
- Creates missing admins
- Sets up proper relationships
- Verifies everything works

## 🔍 **Troubleshooting**

### **If you still get the error:**

1. **Check database connection:**
   ```bash
   node -e "require('dotenv').config(); console.log('MONGO_URI_ACCOUNT:', process.env.MONGO_URI_ACCOUNT)"
   ```

2. **Verify entities exist:**
   ```bash
   node scripts/check-invoice-entities.js
   ```

3. **Check entity relationships:**
   - Vendor must have `uniID` field
   - Admin must have `role: 'super-admin'`

### **Common Issues:**

- **"MONGO_URI_ACCOUNT not found"** → Check your `.env` file
- **"No vendors found"** → Run `create-missing-entities.js`
- **"No super-admin found"** → Run `create-missing-entities.js`

## ✅ **Success Indicators**

When everything is working, you should see:

```
✅ All required entities found. Invoice generation should work.
✅ Entity relationships verified:
  Vendor Sample Food Vendor -> University KIIT University
  Admin admin has role super-admin
```

And in your server logs:
```
🔑 Razorpay Configuration: { keyId: 'rzp_test_kR4r4rtzasoKWl', environment: 'development', ... }
✅ Razorpay initialized successfully
```

## 🎯 **Test the Integration**

1. **Backend test:**
   ```bash
   curl http://localhost:3000/razorpay/key
   ```

2. **Frontend test:**
   - Use the `RazorpayInvoiceExample` component
   - Check browser console for initialization logs

## 🚀 **Next Steps After Setup**

1. **Test invoice generation** - Try creating an order
2. **Test Razorpay API** - Use the example component
3. **Monitor logs** - Check for any remaining errors
4. **Customize entities** - Update vendor names, university details, etc.

## 📝 **Environment Variables Reference**

### **Backend (.env)**
```env
# Required for invoice generation
MONGO_URI_ACCOUNT=mongodb://localhost:27017/bitesbay_accounts
RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
RAZORPAY_KEY_SECRET=your_actual_secret_key

# Optional (with defaults)
PORT=3000
NODE_ENV=development
JWT_SECRET=your_jwt_secret
```

### **Frontend (.env.local)**
```env
# Required for Razorpay integration
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_kR4r4rtzasoKWl
NEXT_PUBLIC_RAZORPAY_KEY_SECRET=your_actual_secret_key
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# Optional
NEXT_PUBLIC_APP_NAME=BitesBay
NEXT_PUBLIC_DIRECT_RAZORPAY_API=true
```

## 🎉 **You're Done!**

After following these steps:
- ✅ Invoice generation will work
- ✅ Razorpay integration will be active
- ✅ Direct API calls to `https://api.razorpay.com/v1/invoices` will work
- ✅ Backend proxy fallback will be available

The system will automatically call the exact Razorpay API endpoints you specified! 🚀
