# BitesBay - Backend

## Introduction
The **BitesBay Backend** is the core of the food ordering and inventory management system for universities. It handles user authentication, order processing, inventory tracking, payment processing, and real-time updates. This backend is built using **Node.js with Express.js** and uses **MongoDB** and **Mongoose** as the database.

## Tech Stack
- **Backend Framework:** Node.js with Express.js
- **Database:** MongoDB (Mongoose ODM)
- **Authentication:** JWT (JSON Web Token)
- **Real-Time Communication:** Socket.io
- **Caching:** Redis (for session management and performance optimization)
- **Security:** Helmet, CORS, bcrypt.js
- **Payment Gateway:** Razorpay
- **Email Service:** Nodemailer for OTP delivery

## Features
### User Management
- Multi-role authentication (Users, Admins, Vendors, Universities)
- JWT-based login and registration
- OTP verification system
- Google OAuth authentication
- Password reset functionality

### Order Management
- Place, update, and cancel orders
- Real-time order status updates with WebSockets
- Order tracking for users
- Digital queue management for food pickup
- Guest order support

### Inventory Management
- Food courts can manage stock levels in real-time
- Low-stock alerts and expiry tracking
- Offline mode support with data synchronization
- Inventory reporting system

### Payment Integration
- Razorpay payment gateway integration
- Supports multiple payment methods (UPI, Cards, Wallets)
- Secure transactions with order validation
- Payment failure handling with retry mechanism

### Notifications
- Email and push notifications for order updates
- WebSocket-based real-time alerts
- OTP delivery via email

## Environment Variables
Create a `.env` file in the root directory and configure the following variables:
```
PORT=5001
MONGO_URL=your_mongodb_uri
JWT_SECRET=your_secret_key
REDIS_URL=your_redis_url
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXT_PUBLIC_BACKEND_URL=your_backend_url
BACKEND_URL=your_backend_url
PAYMENT_GATEWAY_KEY=your_payment_gateway_key
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
```

## Installation & Setup
### Prerequisites
- Node.js (v16 or higher) and npm installed
- MongoDB set up and running
- Redis server (optional, for caching)

### Installation Steps
1. **Fork the repository** on GitHub.
2. **Clone the repository**:
   ```bash
   git clone https://github.com/your-repo/BitesBay-Backend.git
   cd BitesBay-Backend
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a new branch** following the naming convention:
   - For new features: `features/feature-name`
   - For bug fixes: `fixes/fix-name/feature-name`
   ```bash
   git checkout -b features/your-feature-name
   ```
5. **Configure environment variables**:
   - Copy `.env.example` to `.env` (if available)
   - Fill in your configuration values
6. **Start the backend server**:
   ```bash
   npm run dev
   ```
7. The backend server will start on `http://localhost:5001`

## API Documentation
For detailed API documentation, see the following files in the `docs/` directory:
- [API Reference](./docs/API_REFERENCE.md) - Complete API endpoint documentation
- [Authentication Guide](./docs/AUTHENTICATION.md) - Authentication system documentation
- [Deployment Guide](./docs/DEPLOYMENT.md) - Deployment instructions
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions

## Quick Start API Examples
### Authentication
```bash
# User Registration
POST /api/user/auth/signup
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "1234567890",
  "password": "password123",
  "gender": "male",
  "uniID": "university_id"
}

# User Login
POST /api/user/auth/login
{
  "identifier": "john@example.com",
  "password": "password123"
}
```

### Orders
```bash
# Place Order
POST /order/:userId
{
  "items": [...],
  "vendorId": "vendor_id",
  "orderType": "dinein"
}

# Get Order Status
GET /order/:orderId
```

## Contributing
1. Fork the repository.
2. Create a new branch (`git checkout -b features/feature-name` or `fixes/fix-name/feature-name`).
3. Commit your changes (`git commit -m 'Added new feature'`).
4. Push to your branch (`git push origin features/feature-name`).
5. Open a pull request.

## License
This project is licensed under the MIT License.

## Contact
For queries or contributions, contact the **BitesBay Backend Team** at [bitesbay@gmail.com](mailto:bitesbay@gmail.com).
