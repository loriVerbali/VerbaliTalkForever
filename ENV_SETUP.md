# Environment Variables Setup

This project uses environment variables to securely store API keys and other sensitive configuration data.

## Initial Setup

1. **Copy the example file**:

   ```bash
   cp .env.example .env
   ```

2. **Add your actual API keys** to the `.env` file:
   ```
   OPENAI_API_KEY=your_actual_openai_key_here
   GEMINI_API_KEY=your_actual_gemini_key_here
   WEATHER_API_KEY=your_actual_weather_api_key_here
   WAKEWORD_LICENSE=your_actual_wakeword_license_here
   ```

## Important Notes

- The `.env` file is already added to `.gitignore` to prevent it from being committed to version control
- Never commit your actual API keys to the repository
- Any changes to the `.env` file require a restart of the React Native Metro bundler
- The project uses `react-native-config` to manage environment variables

## Development

After adding or changing environment variables:

1. **Stop the Metro bundler** (if running)
2. **Clean the project** (optional but recommended):
   ```bash
   yarn start --reset-cache
   ```
3. **For iOS**: Clean build folder in Xcode or run:
   ```bash
   cd ios && xcodebuild clean && cd ..
   ```
4. **For Android**: Clean the project:
   ```bash
   cd android && ./gradlew clean && cd ..
   ```

## Usage in Code

Environment variables are accessed through the `react-native-config` library:

```javascript
import Config from 'react-native-config';

const apiKey = Config.OPENAI_API_KEY;
```

## Security Best Practices

- Never hardcode API keys in your source code
- Use different `.env` files for different environments (development, staging, production)
- Keep your `.env` file secure and never share it publicly
- Regularly rotate your API keys
- Use the minimum required permissions for your API keys

## Troubleshooting

If environment variables are not working:

1. Make sure you've installed the package properly:

   ```bash
   yarn add react-native-config
   cd ios && pod install && cd ..
   ```

2. Restart Metro bundler with cache reset:

   ```bash
   yarn start --reset-cache
   ```

3. For Android, make sure the build.gradle files are properly configured

4. For iOS, make sure the pod installation completed successfully
