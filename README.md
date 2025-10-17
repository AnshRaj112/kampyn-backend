# KAMPYN - Backend

*Project under **EXSOLVIA** - Excellence in Software Solutions*

## Introduction
The **KAMPYN Backend** serves as the core infrastructure for our comprehensive food ordering and inventory management ecosystem designed for university campuses.

## Tech Stack
- **Backend Framework:** Node.js with Express.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Token)
- **Real-Time Communication:** Socket.io
- **Caching:** Redis
- **Payment Gateway:** Razorpay
- **Email Service:** Nodemailer

## Features
- Multi-role authentication (Users, Admins, Vendors, Universities)
- Real-time order processing and tracking
- Intelligent inventory management
- Secure payment integration
- Advanced notification system
- Comprehensive analytics and reporting

## Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MongoDB database
- Redis server (optional)

### Installation
```bash
# Clone repository
git clone https://github.com/exsolvia/kampyn-backend.git
cd kampyn-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Start development server
npm run dev
```

Server will start on `http://localhost:5001`

## Quick API Examples

### Authentication
```bash
# User Registration
POST /api/auth/signup
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "1234567890",
  "password": "password123",
  "gender": "male",
  "uniID": "university_id"
}

# User Login
POST /api/auth/login
{
  "identifier": "john@example.com",
  "password": "password123"
}
```

### Orders
```bash
# Place Order
POST /api/orders
{
  "userId": "user_id",
  "items": [...],
  "vendorId": "vendor_id",
  "orderType": "dinein"
}

# Get Order Status
GET /api/orders/:orderId
```

## Environment Variables
```env
PORT=5001
MONGO_URL=your_mongodb_uri
JWT_SECRET=your_secret_key
REDIS_URL=your_redis_url
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
```

## Documentation
- [API Development Guide](./docs/API_DEVELOPMENT_GUIDE.md)
- [API Reference](./docs/API_REFERENCE.md)
- [Authentication Guide](./docs/AUTHENTICATION.md)
- [Database Schema](./docs/DATABASE_SCHEMA.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Development Guide](./docs/DEVELOPMENT_GUIDE.md)
- [Features Overview](./docs/FEATURES_OVERVIEW.md)
- [Architecture Guide](./docs/ARCHITECTURE_GUIDE.md)
- [Git Workflow](./docs/GIT_WORKFLOW.md)

## Development Workflow

### Branch Naming Convention
- **Features:** `feature/feature-description`
- **Bug Fixes:** `fix/bug-description`
- **Hotfixes:** `hotfix/critical-fix-description`

### Commit Message Format
```bash
# Feature development
git commit -m "feat: implement user authentication system"

# Bug fixes
git commit -m "fix: resolve payment validation issue"

# Documentation updates
git commit -m "docs: update API documentation"

# Code refactoring
git commit -m "refactor: improve order processing logic"

# Performance improvements
git commit -m "perf: optimize database queries"
```

## Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: add new feature'`)
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a pull request

## License
This project is licensed under the MIT License.

## Support & Contact
- **Contact:** [contact@kampyn.com](mailto:contact@kampyn.com)

---

**© 2025 EXSOLVIA. All rights reserved.**