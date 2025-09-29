# Hymns For Android

[![Latest Version](https://img.shields.io/badge/version-v4.19-blue.svg)](https://github.com/lemuelinchrist/hymnsforandroid/releases)
[![Android Version](https://img.shields.io/badge/android-4.0.3%2B-green.svg)](https://developer.android.com/about/versions/android-4.0.3)

## Overview

Hymns For Android is a comprehensive digital hymnal application that provides access to a collection of Hymns and Spiritual Songs with lyrics and sheet music for both piano and guitar. The app is designed to be a convenient replacement for traditional hymn books, offering a user-friendly interface and powerful search capabilities.

## Features

- **Complete Hymnal**: Access to a comprehensive collection of hymns in the Lord's Recover
- **Sheet Music**: View sheet music for piano and guitar
- **Search Functionality**: Easily find hymns by title, lyrics, or number
- **Favorites**: Save your favorite hymns for quick access
- **Material Design UI**: Modern, intuitive user interface
- **Offline Access**: All hymns available without internet connection
- **Compatibility**: Works on Android 4.0.3 (Ice Cream Sandwich) and above

## Build Variants

The app can be built with different sheet music variants:
- Piano sheet music
- Guitar sheet music
- Combined piano and guitar sheet music

## Project Structure

- **app**: Main application module
- **sqlite**: SQLite database module for hymn data storage
- **databaseProvisioner**: Module for generating and provisioning the hymn database

For more details on the database, please see the [Database Specification](docs/database_spec.md).

## Development Setup

### Prerequisites

- Android Studio Arctic Fox (2020.3.1) or newer
- JDK 11 or newer
- Android SDK 34

### Building the Project

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/hymnsforandroid.git
   ```

2. Open the project in Android Studio

3. Build the project:
   ```
   ./gradlew assembleDebug
   ```

   The database will be automatically imported during the build process.

### Release Build

To create a release build:

```
./gradlew assembleRelease
```

The APK will be generated in `app/build/outputs/apk/release/`

## Contributing

Contributions are welcome! If you'd like to contribute to Hymns For Android, please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the terms found in the LICENSE file in the root directory.

## Contact

For questions or support, please open an issue on the GitHub repository.

---

*Hymns For Android - Worship anytime, anywhere.*
