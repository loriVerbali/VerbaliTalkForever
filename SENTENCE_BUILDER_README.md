# Sentence Builder Grid Component

A comprehensive AAC (Augmentative and Alternative Communication) feature that allows users to build sentences by tapping word and folder cards in a configurable grid layout.

## Features

### Core Functionality

- **Configurable Grid**: Supports 5x6, 6x6, 7x7, and 8x8 grid sizes
- **Word Cards**: Display text with images, color-coded by word type
- **Folder Cards**: Navigate to sub-grids of related words
- **Sentence Building**: Tap words to add them to a sentence bar
- **TTS Integration**: Automatic text-to-speech for word cards
- **Admin Editing**: Secure editing mode with admin code protection

### Navigation

- **Home Button**: Return to root grid from any folder
- **Back Button**: Navigate up one level in folder hierarchy
- **Breadcrumb**: Shows current location in folder structure

### Editing Mode (Admin Only)

- **Add Cards**: Add new words or folders to the grid
- **Edit Cards**: Modify existing words/folders
- **Delete Cards**: Remove items with confirmation
- **Drag & Drop**: Reorder cards by dragging
- **Search Integration**: Find and add words with images from API
- **Image Download**: Automatically download and cache word images

### Sentence Management

- **Sentence Bar**: Shows current sentence with word tokens
- **Token Removal**: Long-press or tap X to remove words
- **Reset Function**: Clear entire sentence
- **Token Editing**: Long-press tokens in admin mode to edit

## File Structure

```
src/
├── types/
│   └── sentenceBuilder.ts          # TypeScript interfaces and types
├── utils/
│   └── sentenceBuilderDb.ts        # Database operations and persistence
└── Components/
    └── SentenceBuilder/
        ├── index.ts                # Component exports
        ├── SentenceBuilderGrid.tsx # Main grid component
        ├── WordCard.tsx           # Individual word card
        ├── FolderCard.tsx         # Folder navigation card
        ├── AddCard.tsx            # Empty slot for adding new items
        ├── DraggableCard.tsx      # Drag-and-drop wrapper
        ├── SentenceBar.tsx        # Sentence display and management
        ├── NavigationBar.tsx      # Home/Back navigation
        └── EditModal.tsx          # Add/Edit/Delete modal
```

## Database Schema

### Nodes Table

- `id`: Unique identifier
- `parentId`: Parent folder ID (null for root)
- `kind`: 'word' or 'folder'
- `title`: Display text
- `type`: Word type for color coding
- `imageUri`: Local image path
- `imageHash`: Image deduplication
- `ttsText`: Optional TTS override
- `orderIndex`: Grid position
- `isSeed`: Default content flag
- `seedPackVersion`: Version tracking
- `createdAt`/`updatedAt`: Timestamps

### Settings Table

- `gridRows`/`gridCols`: Grid dimensions
- `colorMap`: Word type to color mapping

### Sentence State

- `tokenIds`: Array of node IDs in sentence order

## Usage

### Basic Implementation

```tsx
import {SentenceBuilderGrid} from '../Components/SentenceBuilder';

const Convo = () => {
  return (
    <View style={styles.container}>
      <SentenceBuilderGrid />
    </View>
  );
};
```

### With Tablet Support

```tsx
import {SentenceBuilderGrid} from '../Components/SentenceBuilder';

const Convo = ({isTablet}) => {
  return (
    <View style={styles.container}>
      <SentenceBuilderGrid isTablet={isTablet} />
    </View>
  );
};
```

## Configuration

### Grid Sizes

The grid automatically adapts based on device type:

- **Phone**: 5x6 grid (30 slots)
- **Tablet**: 6x6 grid (36 slots)
- **Custom**: Configurable via settings

### Word Type Colors

Default color mapping:

- **Noun**: Green (#4CAF50)
- **Verb**: Blue (#2196F3)
- **Adjective**: Orange (#FF9800)
- **Adverb**: Purple (#9C27B0)
- **Pronoun**: Red (#F44336)
- **Preposition**: Blue Grey (#607D8B)
- **Conjunction**: Brown (#795548)
- **Interjection**: Pink (#E91E63)
- **Article**: Cyan (#00BCD4)
- **Other**: Grey (#9E9E9E)
- **Folder**: Deep Purple (#673AB7)

## Admin Features

### Access Control

- Requires admin code from app settings
- Edit mode can be toggled on/off
- All editing operations are logged

### Word Management

- **Search**: Find words from API with images
- **Add**: Create new words with custom properties
- **Edit**: Modify existing words
- **Delete**: Remove words with confirmation
- **Reorder**: Drag and drop to change positions

### Image Handling

- Automatic download from search results
- Local caching in device storage
- Deduplication by image hash
- Fallback to default images

## TTS Integration

The component integrates with the existing TTSService:

- Automatic speech on word tap
- Uses `ttsText` override if available
- Falls back to `title` if no override
- Immediate priority for user interactions

## Persistence

All data is persisted using the app's existing preference system:

- **Nodes**: Stored as JSON in preferences
- **Settings**: Grid configuration and colors
- **Sentence State**: Current sentence tokens
- **Images**: Downloaded to device storage

## Error Handling

- Graceful fallbacks for missing data
- User-friendly error messages
- Automatic retry for network operations
- Data validation and sanitization

## Performance

- Lazy loading of images
- Efficient re-rendering with React.memo
- Optimized drag-and-drop animations
- Minimal database queries

## Future Enhancements

- **Remote Packs**: Download word packs from server
- **Cloud Sync**: Backup user configurations
- **Analytics**: Track most used words
- **Pagination**: Handle large word sets
- **Custom Themes**: User-defined color schemes
- **Voice Recording**: Custom TTS for words
- **Multi-language**: Support for different languages

## Testing

The component includes comprehensive error handling and fallbacks:

- Network failure recovery
- Invalid data handling
- Memory management
- Performance optimization

## Dependencies

- `react-native-gesture-handler`: Drag and drop
- `react-native-reanimated`: Smooth animations
- `react-native-fast-image`: Image loading
- `react-native-fs`: File system operations
- Existing app services: TTS, preferences, search API
