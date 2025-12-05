# Special Places Feature

## Overview

The Special Places feature allows Matalk to recognize when the user is at one of their predefined special locations (Home, School, or Therapy) and provide contextually appropriate responses based on the environment.

## How It Works

### 1. Setup During Onboarding

During the onboarding process, users can set up their special places:

- **Home**: The user's home address
- **School**: The user's school address
- **Therapy**: The user's therapy center address

Each place can be set either by:

- Manually entering an address
- Using the current location (if location services are enabled)

### 2. Location Detection

When the app gets the user's current location, it:

1. Gets the current GPS coordinates
2. Reverse geocodes to get a readable address
3. Compares the current location against saved special places
4. Uses both coordinate-based and address-based matching

### 3. Matching Algorithm

The system uses a two-tier matching approach:

#### Coordinate-Based Matching (Primary)

- For places saved using "current location"
- Geocodes the saved address to get coordinates
- Calculates distance using Haversine formula
- Considers locations within 100 meters as matches

#### Address-Based Matching (Fallback)

- Cleans and normalizes addresses (removes common words, punctuation)
- Splits addresses into components
- Uses exact matching and fuzzy string matching
- Requires a minimum match ratio based on address complexity

### 4. Context Integration

When a special place is detected:

- The location data includes special place information
- The AI context includes environment-specific details:
  - **Home**: "comfortable, familiar setting"
  - **School**: "learning, social interaction"
  - **Therapy**: "supportive, therapeutic setting"
- The UI displays the special place with appropriate icons

## Implementation Details

### Key Files Modified

1. **`src/contexts/ChatContextProvider.tsx`**

   - Added `checkSpecialPlaces()` function
   - Enhanced `LocationData` interface
   - Updated `getContextualInfo()` function
   - Added coordinate distance calculation
   - Added fuzzy string matching

2. **`src/Components/ContextInfo.tsx`**

   - Updated UI to display special place information
   - Added special styling for special places

3. **`src/Components/SpecialPlaces.tsx`** (existing)
   - Handles special places setup during onboarding

### Data Storage

Special places are stored in the app's persistent storage:

- Key: `'specialPlaces'`
- Format: JSON array of `SpecialPlace` objects
- Each place includes: `type`, `address`, `isCurrentLocation`

### Location Data Structure

```typescript
interface LocationData {
  // ... existing fields
  specialPlace?: {
    type: 'home' | 'school' | 'therapy';
    name: string;
  } | null;
}
```

## Testing

### Manual Testing

1. Set up special places during onboarding
2. Navigate to one of the special places
3. Check the Context Info modal to see if the special place is detected
4. Verify that the AI responses include appropriate context

### Debug Logging

The feature includes extensive console logging to help debug matching:

- Special places data loading
- Address comparison details
- Match ratios and thresholds
- Final match results

### Test Utilities

Use `src/utils/testSpecialPlaces.ts` for testing:

- Mock special places data
- Test address matching scenarios
- Save/clear test data

## Configuration

### Matching Thresholds

- **Coordinate distance**: 100 meters (0.1 km)
- **Address match ratio**:
  - Short addresses (≤2 components): 80%
  - Longer addresses: 60%
- **Fuzzy string similarity**: 80%

### Customization

To adjust matching sensitivity, modify these values in `ChatContextProvider.tsx`:

- Distance threshold: Change `distance < 0.1`
- Match ratios: Adjust `minMatchRatio` calculation
- Fuzzy threshold: Change `similarity > 0.8`

## Future Enhancements

1. **Multiple Locations**: Support for multiple instances of each place type
2. **Custom Places**: Allow users to define custom place types
3. **Time-Based Context**: Consider time of day for place relevance
4. **Geofencing**: Use more sophisticated geofencing for better accuracy
5. **Machine Learning**: Learn from user behavior to improve matching

## Troubleshooting

### Common Issues

1. **No special places detected**

   - Check if special places are saved in storage
   - Verify location permissions are granted
   - Check console logs for matching details

2. **False positives**

   - Adjust matching thresholds
   - Improve address normalization
   - Use more specific addresses during setup

3. **Performance issues**
   - Limit geocoding API calls
   - Cache geocoding results
   - Optimize string matching algorithms

### Debug Commands

```javascript
// In React Native debugger console:

// Check saved special places
DefaultPreference.get('specialPlaces').then(console.log);

// Test address matching
import {testSpecialPlacesMatching} from './src/utils/testSpecialPlaces';
testSpecialPlacesMatching();
```
