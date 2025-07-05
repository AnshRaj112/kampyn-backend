# KIITBites Backend API Reference

This document provides a comprehensive reference for all backend API endpoints, grouped by route. Each entry includes the HTTP method, endpoint path, required parameters, and a detailed description of its purpose and behavior.

---

## Admin Routes (`/admin`)

### Authentication & Admin Info
- **GET `/admin/auth/me`**
  - **Description:** Get current admin information (ID, email, role, permissions).
  - **Auth:** Admin authentication required.

### Lock Management
- **GET `/admin/locks/stats`**
  - **Description:** Get statistics about current locks and orders.
  - **Auth:** Requires `viewStats` permission.
- **GET `/admin/locks/detailed-stats`**
  - **Description:** Get detailed statistics about locks for debugging.
  - **Auth:** Requires `viewStats` permission.
- **POST `/admin/locks/release/:orderId`**
  - **Description:** Force release locks for a specific order.
  - **Params:** `orderId` (URL param)
  - **Auth:** Requires `releaseLocks` permission.
- **POST `/admin/locks/cleanup`**
  - **Description:** Manually trigger cleanup of expired orders and locks.
  - **Auth:** Requires `releaseLocks` permission.
- **POST `/admin/locks/clear-all`**
  - **Description:** Clear all locks (emergency function, use with caution).
  - **Auth:** Requires `clearAllLocks` permission (super admin only).
- **GET `/admin/locks/items/:itemId`**
  - **Description:** Get lock information for a specific item.
  - **Params:** `itemId` (URL param)
  - **Auth:** Requires `viewLocks` permission.

### System Health
- **GET `/admin/system/health`**
  - **Description:** Get system health information (cache stats, uptime, memory, etc.).
  - **Auth:** Requires `viewStats` permission.

---

## Item Routes (`/item`)

- **GET `/item/getvendors/:vendorId/retail`**
  - **Description:** Get all retail items for a vendor.
- **GET `/item/getvendors/:vendorId/produce`**
  - **Description:** Get all produce items for a vendor.
- **POST `/item/:category`**
  - **Description:** Add a new item in a category (`retail` or `produce`).
  - **Body:** Item data.
- **GET `/item/:category/uni/:uniId`**
  - **Description:** Get paginated items by university ID for a category.
- **GET `/item/:category/:type/:uniId`**
  - **Description:** Get items filtered by type and university ID for a category.
- **PUT `/item/:category/:id`**
  - **Description:** Update an item by ID in a category.
- **DELETE `/item/:category/:id`**
  - **Description:** Delete an item by ID in a category.
- **GET `/item/search/items`**
  - **Description:** Search items with enhanced enum matching.
- **GET `/item/search/vendors`**
  - **Description:** Search vendors by name within a university ID.
- **GET `/item/vendors/by-item/:itemType/:itemId`**
  - **Description:** Fetch all vendors that currently hold a given retail/produce item.
- **GET `/item/getvendors/:vendorId`**
  - **Description:** Fetch all in-stock retail items and all available produce items for one vendor.
- **GET `/item/vendors/:itemId`**
  - **Description:** Get vendors for a specific item.
- **GET `/item/:category/item/:id`**
  - **Description:** Get individual item by ID in a category.
- **GET `/item/types/retail`**
  - **Description:** Get all retail item types.
- **GET `/item/types/produce`**
  - **Description:** Get all produce item types.

---

## Order Routes (`/order`)

- **POST `/order/guest`**
  - **Description:** Create a guest order for vendors.
- **POST `/order/:userId`**
  - **Description:** Place an order (creates order in DB and returns Razorpay options).
- **GET `/order/active/:vendorId/:orderType`**
  - **Description:** Get current active order for a vendor (specify type: dinein, takeaway, delivery).
- **PATCH `/order/:orderId/complete`**
  - **Description:** Change status from inProgress to completed.
- **PATCH `/order/:orderId/deliver`**
  - **Description:** Change status from completed to delivered (moves to user pastOrders).
- **PATCH `/order/:orderId/onTheWay`**
  - **Description:** Mark order as on the way for delivery.
- **GET `/order/past/:userId`**
  - **Description:** Get past orders for a user.
- **GET `/order/user-active/:userId`**
  - **Description:** Get active orders for a user.
- **GET `/order/vendor-past/:vendorId`**
  - **Description:** Get past orders for a vendor.
- **POST `/order/cleanup-delivered/:userId`**
  - **Description:** Cleanup delivered orders that are still in active orders.
- **GET `/order/vendor/:vendorId/active`**
  - **Description:** Get all active orders for a vendor.

---

## Cart Routes (`/cart`)

- **POST `/cart/add/:userId`**
  - **Description:** Add an item to the user's cart.
- **GET `/cart/:userId`**
  - **Description:** Get the user's cart.
- **POST `/cart/add-one/:userId`**
  - **Description:** Increase quantity of an item in the cart by one.
- **POST `/cart/remove-one/:userId`**
  - **Description:** Decrease quantity of an item in the cart by one.
- **POST `/cart/remove-item/:userId`**
  - **Description:** Remove an item from the cart.
- **GET `/cart/extras/:userId`**
  - **Description:** Get extra items in the user's cart.

---

## Billing Info Routes (`/billing-info`)

- **POST `/billing-info/`**
  - **Description:** Save billing information.
- **GET `/billing-info/vendor/:vendorId`**
  - **Description:** Get vendor billing history.
- **GET `/billing-info/customer/:phoneNumber`**
  - **Description:** Get customer billing history.
- **GET `/billing-info/order/:orderNumber`**
  - **Description:** Get specific billing info by order number.
- **PUT `/billing-info/order/:orderNumber/status`**
  - **Description:** Update billing status for an order.

---

## Food Routes (`/food`)

- **GET `/food/`**
  - **Description:** Search for food items by query and university ID. Returns both retail and produce items.
  - **Query Params:** `query`, `uniID`

---

## Auth Routes

### Admin Auth (`/auth/admin`)
- **POST `/auth/admin/login`**
  - **Description:** Admin login.
- **POST `/auth/admin/logout`**
  - **Description:** Admin logout.
- **GET `/auth/admin/profile`**
  - **Description:** Get admin profile (auth required).
- **PUT `/auth/admin/profile`**
  - **Description:** Update admin profile (auth required).
- **PUT `/auth/admin/change-password`**
  - **Description:** Change admin password (auth required).
- **POST `/auth/admin/refresh-token`**
  - **Description:** Refresh admin authentication token (auth required).

### User Auth (`/auth/user`)
- **POST `/auth/user/signup`**
  - **Description:** User signup.
- **POST `/auth/user/otpverification`**
  - **Description:** Verify OTP for user signup/login.
- **POST `/auth/user/login`**
  - **Description:** User login.
- **POST `/auth/user/forgotpassword`**
  - **Description:** User forgot password.
- **POST `/auth/user/resetpassword`**
  - **Description:** User reset password.
- **POST `/auth/user/googleAuth`**
  - **Description:** User Google authentication.
- **POST `/auth/user/googleSignup`**
  - **Description:** User Google signup.
- **POST `/auth/user/logout`**
  - **Description:** User logout.
- **GET `/auth/user/refresh`**
  - **Description:** Refresh user authentication token.
- **GET `/auth/user/check`**
  - **Description:** Check user session (auth required).
- **GET `/auth/user/list`**
  - **Description:** Get list of colleges.
- **GET `/auth/user/user`**
  - **Description:** Get user data (auth required).

### University Auth (`/auth/uni`)
- **POST `/auth/uni/signup`**
  - **Description:** University signup.
- **POST `/auth/uni/otpverification`**
  - **Description:** Verify OTP for university signup/login.
- **POST `/auth/uni/login`**
  - **Description:** University login.
- **POST `/auth/uni/forgotpassword`**
  - **Description:** University forgot password.
- **POST `/auth/uni/resetpassword`**
  - **Description:** University reset password.
- **POST `/auth/uni/googleAuth`**
  - **Description:** University Google authentication.
- **POST `/auth/uni/googleSignup`**
  - **Description:** University Google signup.
- **POST `/auth/uni/logout`**
  - **Description:** University logout.
- **GET `/auth/uni/refresh`**
  - **Description:** Refresh university authentication token.
- **GET `/auth/uni/check`**
  - **Description:** Check university session (auth required).
- **GET `/auth/uni/user`**
  - **Description:** Get university user data (auth required).

---

# Notes
- All endpoints may require authentication unless otherwise specified.
- For detailed request/response formats, refer to the respective controller implementations.
- Some endpoints require specific permissions (see Admin routes).
- University charges are applied as follows:
  - **Takeaway:** Base amount + (Packing charge × Produce items)
  - **Delivery:** Base amount + (Packing charge × Produce items) + Delivery charge
  - **Dine-in:** Base amount only (no additional charges)

## University Routes (`/api/university`)

### University Charges Management
- **GET `/api/university/charges/:uniId`**
  - **Description:** Get packing and delivery charges for a specific university.
  - **Parameters:** `uniId` (path) - University ID
  - **Response:**
    ```json
    {
      "packingCharge": 5,
      "deliveryCharge": 50,
      "universityName": "KIIT University"
    }
    ```

- **PUT `/api/university/charges/:uniId`**
  - **Description:** Update packing and delivery charges for a university (requires university authentication).
  - **Parameters:** `uniId` (path) - University ID
  - **Body:**
    ```json
    {
      "packingCharge": 10,
      "deliveryCharge": 75
    }
    ```
  - **Response:**
    ```json
    {
      "message": "Charges updated successfully",
      "packingCharge": 10,
      "deliveryCharge": 75,
      "universityName": "KIIT University"
    }
    ```

### University Image Management
- **POST `/api/university/upload-image`**
  - **Description:** Upload image for a university.
  - **Body:**
    ```json
    {
      "universityId": "university_id",
      "imageUrl": "https://example.com/image.jpg"
    }
    ```

- **GET `/api/university/api/cloudinary/cloud-name`**
  - **Description:** Get Cloudinary cloud name configuration. 