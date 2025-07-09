# KIITBites Backend API Reference

This document provides a comprehensive reference for all backend API endpoints, grouped by route. Each entry includes the HTTP method, endpoint path, required parameters, and a detailed description of its purpose and behavior.

**Last Updated:** July 2025

---

## Authentication Status

### 🔓 **No Authentication Required:**
- **Vendor Dashboard Routes** - All vendor dashboard functionality is accessible without authentication
- **Item Management** - Adding/updating items
- **Order Management** - Order creation and status updates
- **Inventory Reports** - Vendor inventory reporting
- **Vendor Cart** - Vendor cart operations
- **Delivery Settings** - Vendor delivery configuration

### 🔒 **Authentication Required:**
- **Admin Routes** - All admin functionality requires admin authentication
- **User Auth Routes** - User login/signup operations
- **University Auth Routes** - University management operations
- **Vendor Auth Routes** - Vendor authentication (separate from dashboard)

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

## Vendor Routes (`/api/vendor`)

### Vendor Management
- **GET `/api/vendor/list/uni/:uniId`**
  - **Description:** Get all vendors for a specific university.
  - **Auth:** No authentication required.
- **GET `/api/vendor/availability/uni/:uniId`**
  - **Description:** Get all vendors with their availability status for a specific university.
  - **Auth:** No authentication required.
- **PATCH `/api/vendor/availability/uni/:uniId/vendor/:vendorId`**
  - **Description:** Update vendor availability in university.
  - **Body:** `{ "isAvailable": "Y" | "N" }`
  - **Auth:** No authentication required.
- **DELETE `/api/vendor/delete/uni/:uniId/vendor/:vendorId`**
  - **Description:** Delete a vendor from a university and the Vendor collection.
  - **Auth:** No authentication required.

### Delivery Settings (No Auth Required)
- **GET `/api/vendor/:vendorId/delivery-settings`**
  - **Description:** Get delivery settings for a vendor.
  - **Auth:** No authentication required.
- **PUT `/api/vendor/:vendorId/delivery-settings`**
  - **Description:** Update delivery settings for a vendor.
  - **Body:** `{ "offersDelivery": boolean, "deliveryPreparationTime": number }`
  - **Auth:** No authentication required.

### Inventory Management
- **PATCH `/api/vendor/:vendorId/item/:itemId/:kind/special`**
  - **Description:** Update isSpecial status for a vendor's item.
  - **Params:** `kind` can be "retail" or "produce"
  - **Body:** `{ "isSpecial": "Y" | "N" }`
  - **Auth:** No authentication required.
- **PATCH `/api/vendor/:vendorId/item/:itemId/:kind/available`**
  - **Description:** Update isAvailable status for a vendor's item.
  - **Params:** `kind` can be "retail" or "produce"
  - **Body:** `{ "isAvailable": "Y" | "N" }`
  - **Auth:** No authentication required.

---

## Vendor Cart Routes (`/vendorcart`)

### Cart Operations (No Auth Required)
- **GET `/vendorcart/:vendorId`**
  - **Description:** Get vendor cart.
  - **Auth:** No authentication required.
- **POST `/vendorcart/:vendorId/items`**
  - **Description:** Add item to vendor cart.
  - **Body:** Item data
  - **Auth:** No authentication required.
- **PUT `/vendorcart/:vendorId/items/:itemId`**
  - **Description:** Update item quantity in vendor cart.
  - **Body:** `{ "quantity": number }`
  - **Auth:** No authentication required.
- **DELETE `/vendorcart/:vendorId/items/:itemId`**
  - **Description:** Remove item from vendor cart.
  - **Auth:** No authentication required.
- **DELETE `/vendorcart/:vendorId`**
  - **Description:** Clear vendor cart.
  - **Auth:** No authentication required.
- **PUT `/vendorcart/:vendorId`**
  - **Description:** Update entire vendor cart.
  - **Body:** Cart data
  - **Auth:** No authentication required.

---

## Inventory Report Routes (`/inventoryreport`)

### Report Management (No Auth Required)
- **POST `/inventoryreport/vendor/:vendorId`**
  - **Description:** Create report for a specific vendor.
  - **Auth:** No authentication required.
- **POST `/inventoryreport/uni/:uniId`**
  - **Description:** Create report for all vendors in a university.
  - **Auth:** No authentication required.
- **GET `/inventoryreport/vendor/:vendorId`**
  - **Description:** Get report for a specific vendor on a given day.
  - **Query Params:** `date` (YYYY-MM-DD format)
  - **Auth:** No authentication required.
- **GET `/inventoryreport/vendor/:vendorId/dates`**
  - **Description:** Get all report dates for a specific vendor.
  - **Auth:** No authentication required.

---

## Item Routes (`/api/item`)

### Item Management
- **GET `/api/item/getvendors/:vendorId/retail`**
  - **Description:** Get all retail items for a vendor.
- **GET `/api/item/getvendors/:vendorId/produce`**
  - **Description:** Get all produce items for a vendor.
- **POST `/api/item/:category`**
  - **Description:** Add a new item in a category (`retail` or `produce`).
  - **Body:** Item data
  - **Note:** New produce items are automatically added to all vendors with `isAvailable: 'N'` (Not Available)
- **GET `/api/item/:category/uni/:uniId`**
  - **Description:** Get paginated items by university ID for a category.
- **GET `/api/item/:category/:type/:uniId`**
  - **Description:** Get items filtered by type and university ID for a category.
- **PUT `/api/item/:category/:id`**
  - **Description:** Update an item by ID in a category.
- **DELETE `/api/item/:category/:id`**
  - **Description:** Delete an item by ID in a category.
- **GET `/api/item/search/items`**
  - **Description:** Search items with enhanced enum matching.
- **GET `/api/item/search/vendors`**
  - **Description:** Search vendors by name within a university ID.
- **GET `/api/item/vendors/by-item/:itemType/:itemId`**
  - **Description:** Fetch all vendors that currently hold a given retail/produce item.
- **GET `/api/item/getvendors/:vendorId`**
  - **Description:** Fetch all in-stock retail items and all available produce items for one vendor.
- **GET `/api/item/vendors/:itemId`**
  - **Description:** Get vendors for a specific item.
- **GET `/api/item/:category/item/:id`**
  - **Description:** Get individual item by ID in a category.
- **GET `/api/item/types/retail`**
  - **Description:** Get all retail item types.
- **GET `/api/item/types/produce`**
  - **Description:** Get all produce item types.

---

## Order Routes (`/order`)

### Order Management (No Auth Required)
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
- **POST `/order/:orderId/cancel`**
  - **Description:** Cancel a pending order and release locks.
- **POST `/order/:orderId/cancel-manual`**
  - **Description:** Manually cancel a pending order (for users).
- **GET `/order/:orderId`**
  - **Description:** Get a specific order by ID.

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

## Billing Info Routes (`/billinginfo`)

- **POST `/billinginfo/`**
  - **Description:** Save billing information.
- **GET `/billinginfo/vendor/:vendorId`**
  - **Description:** Get vendor billing history.
- **GET `/billinginfo/customer/:phoneNumber`**
  - **Description:** Get customer billing history.
- **GET `/billinginfo/order/:orderNumber`**
  - **Description:** Get specific billing info by order number.
- **PUT `/billinginfo/order/:orderNumber/status`**
  - **Description:** Update billing status for an order.

---

## Food Routes (`/food`)

- **GET `/food/`**
  - **Description:** Search for food items by query and university ID. Returns both retail and produce items.
  - **Query Params:** `query`, `uniID`

---

## Razorpay Routes (`/razorpay`)

### Payment Processing
- **GET `/razorpay/key`**
  - **Description:** Get Razorpay public key for frontend integration.
  - **Response:** `{ "success": true, "key": "rzp_test_..." }`
- **POST `/razorpay/create-order`**
  - **Description:** Create a new Razorpay order for payment processing.
  - **Body:** `{ "amount": number, "currency": "INR", "receipt": string }`
  - **Response:** `{ "success": true, "id": "order_id", "amount": number, "currency": "INR", "receipt": string }`

---

## Configuration Routes (`/api`)

### System Configuration
- **GET `/api/cloudinary/cloud-name`**
  - **Description:** Get Cloudinary cloud name configuration.
  - **Response:** `{ "cloudName": "your-cloud-name" }`

---

## Auth Routes

### Admin Auth (`/api/admin/auth`)
- **POST `/api/admin/auth/login`**
  - **Description:** Admin login.
- **POST `/api/admin/auth/logout`**
  - **Description:** Admin logout.
- **GET `/api/admin/auth/profile`**
  - **Description:** Get admin profile (auth required).
- **PUT `/api/admin/auth/profile`**
  - **Description:** Update admin profile (auth required).
- **PUT `/api/admin/auth/change-password`**
  - **Description:** Change admin password (auth required).
- **POST `/api/admin/auth/refresh-token`**
  - **Description:** Refresh admin authentication token (auth required).

### User Auth (`/api/user/auth`)
- **POST `/api/user/auth/signup`**
  - **Description:** User signup.
- **POST `/api/user/auth/otpverification`**
  - **Description:** Verify OTP for user signup/login.
- **POST `/api/user/auth/login`**
  - **Description:** User login.
- **POST `/api/user/auth/forgotpassword`**
  - **Description:** User forgot password.
- **POST `/api/user/auth/resetpassword`**
  - **Description:** User reset password.
- **POST `/api/user/auth/googleAuth`**
  - **Description:** User Google authentication.
- **POST `/api/user/auth/googleSignup`**
  - **Description:** User Google signup.
- **POST `/api/user/auth/logout`**
  - **Description:** User logout.
- **GET `/api/user/auth/refresh`**
  - **Description:** Refresh user authentication token.
- **GET `/api/user/auth/check`**
  - **Description:** Check user session (auth required).
- **GET `/api/user/auth/list`**
  - **Description:** Get list of colleges.
- **GET `/api/user/auth/user`**
  - **Description:** Get user data (auth required).

### University Auth (`/api/uni/auth`)
- **POST `/api/uni/auth/signup`**
  - **Description:** University signup.
- **POST `/api/uni/auth/otpverification`**
  - **Description:** Verify OTP for university signup/login.
- **POST `/api/uni/auth/login`**
  - **Description:** University login.
- **POST `/api/uni/auth/forgotpassword`**
  - **Description:** University forgot password.
- **POST `/api/uni/auth/resetpassword`**
  - **Description:** University reset password.
- **POST `/api/uni/auth/googleAuth`**
  - **Description:** University Google authentication.
- **POST `/api/uni/auth/googleSignup`**
  - **Description:** University Google signup.
- **POST `/api/uni/auth/logout`**
  - **Description:** University logout.
- **GET `/api/uni/auth/refresh`**
  - **Description:** Refresh university authentication token.
- **GET `/api/uni/auth/check`**
  - **Description:** Check university session (auth required).
- **GET `/api/uni/auth/user`**
  - **Description:** Get university user data (auth required).

### Vendor Auth (`/api/vendor/auth`)
- **POST `/api/vendor/auth/signup`**
  - **Description:** Vendor signup.
- **POST `/api/vendor/auth/otpverification`**
  - **Description:** Verify OTP for vendor signup/login.
- **POST `/api/vendor/auth/login`**
  - **Description:** Vendor login.
- **POST `/api/vendor/auth/forgotpassword`**
  - **Description:** Vendor forgot password.
- **POST `/api/vendor/auth/resetpassword`**
  - **Description:** Vendor reset password.
- **POST `/api/vendor/auth/googleAuth`**
  - **Description:** Vendor Google authentication.
- **POST `/api/vendor/auth/googleSignup`**
  - **Description:** Vendor Google signup.
- **POST `/api/vendor/auth/logout`**
  - **Description:** Vendor logout.
- **GET `/api/vendor/auth/refresh`**
  - **Description:** Refresh vendor authentication token.
- **GET `/api/vendor/auth/check`**
  - **Description:** Check vendor session (auth required).
- **GET `/api/vendor/auth/user`**
  - **Description:** Get vendor user data (auth required).

---

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

---

## Other Routes

### Contact Routes (`/contact`)
- **POST `/contact`**
  - **Description:** Submit contact form.

### Team Routes (`/team`)
- **GET `/team`**
  - **Description:** Get team information.

### Favourite Routes (`/fav`)
- **POST `/fav/add/:userId`**
  - **Description:** Add item to favorites.
- **GET `/fav/:userId`**
  - **Description:** Get user favorites.
- **DELETE `/fav/remove/:userId`**
  - **Description:** Remove item from favorites.

### Food Court Routes (`/foodcourts`)
- **GET `/foodcourts`**
  - **Description:** Get food court information.

### Inventory Routes (`/inventory`)
- **POST `/inventory/retail/availability`**
  - **Description:** Update retail item availability.

### Payment Routes (`/payment`)
- **POST `/payment/verify`**
  - **Description:** Verify payment.

---

## Important Notes

### 🔓 **Vendor Dashboard Authentication:**
- **No authentication required** for vendor dashboard functionality
- All vendor dashboard routes are publicly accessible
- This includes delivery settings, inventory management, and order processing

### 🍎 **Produce Item Availability:**
- **New produce items** are automatically added to all vendors with `isAvailable: 'N'` (Not Available)
- Vendors must manually change availability to 'Y' to make items available to customers
- This gives vendors control over their inventory

### 💰 **University Charges:**
University charges are applied as follows:
- **Takeaway:** Base amount + (Packing charge × Produce items)
- **Delivery:** Base amount + (Packing charge × Produce items) + Delivery charge
- **Dine-in:** Base amount only (no additional charges)

### 🔒 **Authentication Requirements:**
- All endpoints may require authentication unless explicitly marked as "No authentication required"
- For detailed request/response formats, refer to the respective controller implementations
- Some endpoints require specific permissions (see Admin routes)

### 📊 **Response Formats:**
Most successful responses follow this format:
```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully"
}
```

Error responses typically include:
```json
{
  "success": false,
  "message": "Error description"
}
``` 