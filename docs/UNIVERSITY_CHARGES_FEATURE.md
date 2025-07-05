# University Charges Feature

## Overview

The University Charges feature allows each university to set their own packing and delivery charges for orders placed through their vendors. This provides flexibility for different universities to have different pricing strategies based on their location, operational costs, and business model.

## Features

### 1. University-Specific Charges
- **Packing Charge**: Applied per produce item for takeaway and delivery orders
- **Delivery Charge**: Applied per delivery order
- **Dine-in Orders**: No additional charges (base amount only)

### 2. Charge Calculation Logic
- **Takeaway Order**: `Base amount + (Packing charge × Number of produce items)`
- **Delivery Order**: `Base amount + (Packing charge × Number of produce items) + Delivery charge`
- **Dine-in Order**: `Base amount only`

### 3. University Dashboard Management
- Universities can view and update their charges through the university dashboard
- Real-time charge updates
- Validation to ensure charges are non-negative numbers

## Implementation Details

### Backend Changes

#### 1. University Model Updates
- Added `packingCharge` field (default: ₹5)
- Added `deliveryCharge` field (default: ₹50)

#### 2. New API Endpoints
- `GET /api/university/charges/:uniId` - Get university charges
- `PUT /api/university/charges/:uniId` - Update university charges (requires auth)

#### 3. Order Calculation Updates
- Modified `orderUtils.js` to fetch university-specific charges
- Updated order total calculation to use university charges instead of hardcoded values

### Frontend Changes

#### 1. University Dashboard
- Added "Manage Charges" section in the sidebar
- Created `ManageCharges` component for charge management
- Added form validation and success/error handling

#### 2. Order Components
- Updated `BillBox` components (both web and mobile) to fetch university charges
- Dynamic charge calculation based on university settings
- Fallback to default charges if university charges cannot be fetched

## Usage

### For Universities

1. **Access the Dashboard**
   - Log in to the university dashboard
   - Navigate to "Manage Charges" in the sidebar

2. **Set Charges**
   - Enter the desired packing charge per produce item
   - Enter the desired delivery charge per delivery
   - Click "Save Changes" to update

3. **View Charge Summary**
   - The dashboard shows how charges are applied to different order types
   - Real-time preview of charge calculations

### For Users

1. **Automatic Charge Application**
   - Charges are automatically calculated based on the university's settings
   - No user intervention required
   - Charges are clearly displayed in the order summary

2. **Charge Transparency**
   - Packing charges are shown per produce item
   - Delivery charges are shown as a single line item
   - Total calculation is transparent and itemized

## Migration

### Running the Migration Script

To update existing universities with default charges:

```bash
cd kiitbites-backend
node scripts/migrate-university-charges.js
```

This script will:
- Find all universities without charge settings
- Apply default charges (₹5 packing, ₹50 delivery)
- Log the progress and results

### Manual Updates

Universities can also update their charges manually through:
- The university dashboard interface
- Direct API calls (with proper authentication)

## Configuration

### Default Values
- **Packing Charge**: ₹5 per produce item
- **Delivery Charge**: ₹50 per delivery

### Environment Variables
No additional environment variables are required for this feature.

## Security

### Authentication
- University charge updates require university authentication
- Universities can only update their own charges
- API endpoints validate university ownership

### Validation
- Charges must be non-negative numbers
- Input validation prevents invalid charge values
- Database constraints ensure data integrity

## Error Handling

### Frontend
- Graceful fallback to default charges if API calls fail
- User-friendly error messages for validation failures
- Loading states during charge fetching and updates

### Backend
- Comprehensive error handling for database operations
- Input validation with descriptive error messages
- Proper HTTP status codes for different error scenarios

## Testing

### Manual Testing
1. Set different charges for a university
2. Place orders with different types (takeaway, delivery, dine-in)
3. Verify charge calculations are correct
4. Test with various produce item quantities

### API Testing
```bash
# Get university charges
curl -X GET "http://localhost:5001/api/university/charges/UNIVERSITY_ID"

# Update university charges (requires auth)
curl -X PUT "http://localhost:5001/api/university/charges/UNIVERSITY_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"packingCharge": 10, "deliveryCharge": 75}'
```

## Future Enhancements

### Potential Improvements
1. **Time-based Charges**: Different charges for peak/off-peak hours
2. **Distance-based Delivery**: Variable delivery charges based on distance
3. **Minimum Order Charges**: Minimum order amounts with different charge structures
4. **Bulk Discounts**: Reduced charges for large orders
5. **Charge History**: Track charge changes over time
6. **Analytics**: Charge impact on order volume and revenue

### Integration Opportunities
1. **Vendor-specific Charges**: Allow vendors to set their own charges within university limits
2. **Student Discounts**: Special pricing for verified students
3. **Loyalty Programs**: Reduced charges for frequent customers
4. **Seasonal Pricing**: Adjust charges based on academic calendar

## Support

For questions or issues related to the University Charges feature:
1. Check the API documentation for endpoint details
2. Review the migration script for database updates
3. Test with the provided examples
4. Contact the development team for technical support 