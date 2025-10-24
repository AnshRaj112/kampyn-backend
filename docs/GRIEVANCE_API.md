# Grievance Management API Documentation

## Overview
The Grievance Management system allows vendors and universities to raise tickets with severity levels, and universities can track and update progress accordingly. This system provides a comprehensive ticketing solution for food ordering platforms.

## Features
- **Severity Levels**: low, medium, high, critical
- **Status Tracking**: open, in_progress, resolved, closed, rejected
- **Progress Updates**: Track all status changes with timestamps
- **Internal Notes**: University-only notes for internal tracking
- **SLA Management**: Automatic deadline setting based on severity
- **Search & Filter**: Advanced search and filtering capabilities
- **Statistics**: Comprehensive reporting and analytics

## API Endpoints

### Base URL
All grievance endpoints are prefixed with `/api/{uniId}/grievances`

### Authentication
All endpoints require authentication. Use the appropriate middleware:
- `authMiddleware`: For vendor and university authentication
- `uniAuthMiddleware`: For university-only operations

---

## 1. Create Grievance
**POST** `/api/{uniId}/grievances`

Creates a new grievance ticket.

**Authentication**: Required (Vendor or University)

**Request Body**:
```json
{
  "title": "Order delivery issue",
  "description": "Order was not delivered on time",
  "severity": "high",
  "category": "delivery_issue",
  "relatedOrderId": "64a1b2c3d4e5f6789abcdef0",
  "tags": ["urgent", "delivery"],
  "attachments": [
    {
      "url": "https://example.com/file.pdf",
      "filename": "evidence.pdf"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Grievance created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef1",
    "title": "Order delivery issue",
    "description": "Order was not delivered on time",
    "severity": "high",
    "status": "open",
    "category": "delivery_issue",
    "raisedBy": {
      "type": "vendor",
      "id": "64a1b2c3d4e5f6789abcdef2"
    },
    "uniId": "64a1b2c3d4e5f6789abcdef3",
    "relatedOrderId": "64a1b2c3d4e5f6789abcdef0",
    "priority": "high",
    "slaDeadline": "2024-01-15T10:00:00.000Z",
    "progress": [
      {
        "status": "open",
        "note": "Grievance created",
        "updatedBy": {
          "type": "vendor",
          "id": "64a1b2c3d4e5f6789abcdef2"
        },
        "updatedAt": "2024-01-15T06:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-15T06:00:00.000Z",
    "updatedAt": "2024-01-15T06:00:00.000Z"
  }
}
```

---

## 2. Get University Grievances
**GET** `/api/{uniId}/grievances`

Retrieves all grievances for a university with filtering and pagination.

**Authentication**: Required (University only)

**Query Parameters**:
- `status`: Filter by status (open, in_progress, resolved, closed, rejected)
- `severity`: Filter by severity (low, medium, high, critical)
- `category`: Filter by category
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort order (asc, desc)

**Example**: `/api/64a1b2c3d4e5f6789abcdef3/grievances?status=open&severity=high&page=1&limit=10`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789abcdef1",
      "title": "Order delivery issue",
      "severity": "high",
      "status": "open",
      "category": "delivery_issue",
      "raisedBy": {
        "id": {
          "fullName": "Vendor Name",
          "email": "vendor@example.com"
        }
      },
      "createdAt": "2024-01-15T06:00:00.000Z"
    }
  ],
  "pagination": {
    "current": 1,
    "pages": 5,
    "total": 50,
    "limit": 10
  }
}
```

---

## 3. Get Vendor Grievances
**GET** `/api/{uniId}/vendor-grievances`

Retrieves grievances raised by the authenticated vendor.

**Authentication**: Required (Vendor only)

**Query Parameters**: Same as university grievances

**Response**: Same format as university grievances

---

## 4. Get Specific Grievance
**GET** `/api/{uniId}/grievances/{grievanceId}`

Retrieves a specific grievance by ID.

**Authentication**: Required (Vendor or University)

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef1",
    "title": "Order delivery issue",
    "description": "Order was not delivered on time",
    "severity": "high",
    "status": "open",
    "category": "delivery_issue",
    "raisedBy": {
      "type": "vendor",
      "id": {
        "fullName": "Vendor Name",
        "email": "vendor@example.com"
      }
    },
    "uniId": {
      "fullName": "University Name",
      "email": "uni@example.com"
    },
    "relatedOrderId": {
      "orderNumber": "ORD-001",
      "status": "delivered"
    },
    "progress": [...],
    "internalNotes": [...],
    "createdAt": "2024-01-15T06:00:00.000Z",
    "updatedAt": "2024-01-15T06:00:00.000Z"
  }
}
```

---

## 5. Update Grievance Status
**PATCH** `/api/{uniId}/grievances/{grievanceId}/status`

Updates the status of a grievance and adds a progress update.

**Authentication**: Required (University only)

**Request Body**:
```json
{
  "status": "in_progress",
  "note": "Investigating the issue"
}
```

**Valid Status Transitions**:
- `open` → `in_progress`, `rejected`
- `in_progress` → `resolved`, `closed`
- `resolved` → `closed`
- `closed` → (no transitions)
- `rejected` → `open`

**Response**:
```json
{
  "success": true,
  "message": "Grievance status updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef1",
    "status": "in_progress",
    "progress": [
      {
        "status": "open",
        "note": "Grievance created",
        "updatedBy": {
          "type": "vendor",
          "id": "64a1b2c3d4e5f6789abcdef2"
        },
        "updatedAt": "2024-01-15T06:00:00.000Z"
      },
      {
        "status": "in_progress",
        "note": "Investigating the issue",
        "updatedBy": {
          "type": "university",
          "id": "64a1b2c3d4e5f6789abcdef3"
        },
        "updatedAt": "2024-01-15T07:00:00.000Z"
      }
    ]
  }
}
```

---

## 6. Add Internal Note
**POST** `/api/{uniId}/grievances/{grievanceId}/internal-notes`

Adds an internal note to a grievance (university only).

**Authentication**: Required (University only)

**Request Body**:
```json
{
  "note": "Internal investigation notes"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Internal note added successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789abcdef1",
    "internalNotes": [
      {
        "note": "Internal investigation notes",
        "addedBy": {
          "type": "university",
          "id": "64a1b2c3d4e5f6789abcdef3"
        },
        "addedAt": "2024-01-15T07:00:00.000Z"
      }
    ]
  }
}
```

---

## 7. Get Grievance Statistics
**GET** `/api/{uniId}/grievances-stats`

Retrieves comprehensive statistics for grievances.

**Authentication**: Required (University only)

**Query Parameters**:
- `startDate`: Start date for filtering (ISO format)
- `endDate`: End date for filtering (ISO format)

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 100,
    "open": 15,
    "inProgress": 25,
    "resolved": 45,
    "closed": 10,
    "rejected": 5,
    "critical": 5,
    "high": 20,
    "medium": 50,
    "low": 25,
    "overdue": 3
  }
}
```

---

## 8. Search Grievances
**GET** `/api/{uniId}/grievances-search`

Searches grievances by title, description, or tags.

**Authentication**: Required (University only)

**Query Parameters**:
- `q`: Search query (required)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Example**: `/api/64a1b2c3d4e5f6789abcdef3/grievances-search?q=delivery&page=1&limit=10`

**Response**: Same format as university grievances

---

## 9. Delete Grievance
**DELETE** `/api/{uniId}/grievances/{grievanceId}`

Soft deletes a grievance (university only).

**Authentication**: Required (University only)

**Response**:
```json
{
  "success": true,
  "message": "Grievance deleted successfully"
}
```

---

## Data Models

### Grievance Schema
```javascript
{
  title: String (required, max 200 chars),
  description: String (required, max 1000 chars),
  severity: Enum ['low', 'medium', 'high', 'critical'],
  status: Enum ['open', 'in_progress', 'resolved', 'closed', 'rejected'],
  category: Enum ['order_issue', 'payment_issue', 'delivery_issue', 'food_quality', 'service_issue', 'technical_issue', 'billing_issue', 'other'],
  raisedBy: {
    type: Enum ['vendor', 'university'],
    id: ObjectId
  },
  uniId: ObjectId (required),
  relatedOrderId: ObjectId (optional),
  progress: [{
    status: String,
    note: String,
    updatedBy: {
      type: String,
      id: ObjectId
    },
    updatedAt: Date
  }],
  resolution: {
    note: String,
    resolvedBy: {
      type: String,
      id: ObjectId
    },
    resolvedAt: Date
  },
  priority: Enum ['low', 'medium', 'high', 'urgent'],
  tags: [String],
  attachments: [{
    url: String,
    filename: String,
    uploadedAt: Date
  }],
  internalNotes: [{
    note: String,
    addedBy: {
      type: String,
      id: ObjectId
    },
    addedAt: Date
  }],
  slaDeadline: Date,
  lastResponseAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### SLA Deadlines
- **Critical**: 4 hours
- **High**: 24 hours (1 day)
- **Medium**: 48 hours (2 days)
- **Low**: 72 hours (3 days)

### Priority Mapping
- **Critical** → Urgent
- **High** → High
- **Medium** → Medium
- **Low** → Low

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Title, description, and category are required"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Only university and admin can add internal notes"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Grievance not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "Error details"
}
```

---

## Usage Examples

### 1. Vendor Creating a Grievance
```javascript
const response = await fetch('/api/64a1b2c3d4e5f6789abcdef3/grievances', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <vendor_token>'
  },
  body: JSON.stringify({
    title: 'Payment not received',
    description: 'Payment for order ORD-001 has not been credited to my account',
    severity: 'high',
    category: 'payment_issue',
    relatedOrderId: '64a1b2c3d4e5f6789abcdef0',
    tags: ['payment', 'urgent']
  })
});
```

### 2. University Updating Status
```javascript
const response = await fetch('/api/64a1b2c3d4e5f6789abcdef3/grievances/64a1b2c3d4e5f6789abcdef1/status', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <university_token>'
  },
  body: JSON.stringify({
    status: 'resolved',
    note: 'Payment has been processed and credited to vendor account'
  })
});
```

### 3. Getting Statistics
```javascript
const response = await fetch('/api/64a1b2c3d4e5f6789abcdef3/grievances-stats?startDate=2024-01-01&endDate=2024-01-31', {
  headers: {
    'Authorization': 'Bearer <university_token>'
  }
});
```

---

## Best Practices

1. **Severity Selection**: Choose appropriate severity levels based on business impact
2. **Status Updates**: Provide meaningful notes when updating status
3. **Internal Notes**: Use internal notes for sensitive information not visible to vendors
4. **SLA Management**: Monitor SLA deadlines to ensure timely resolution
5. **Search Optimization**: Use specific keywords in titles and descriptions for better search results
6. **Attachment Management**: Keep file sizes reasonable and use appropriate file types

---

## Integration Notes

- All endpoints require proper authentication
- University endpoints require `uniAuthMiddleware`
- Vendor endpoints work with standard `authMiddleware`
- The system automatically sets SLA deadlines based on severity
- Progress tracking is automatic and cannot be bypassed
- Soft delete is implemented for data integrity
