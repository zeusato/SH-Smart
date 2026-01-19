# SHS Smart Trading Shell

[![Latest Release](https://img.shields.io/github/v/release/zeusato/SH-Smart?style=for-the-badge&color=orange)](https://github.com/zeusato/SH-Smart/releases/latest)

**Tải bản cài đặt mới nhất tại đây:** [SH-Smart Releases](https://github.com/zeusato/SH-Smart/releases/latest)

A custom Electron-based shell for the SHS Trading platform.

## Features
- **Smart OTP Manager**: 
    - Auto-detect OTP input fields.
    - Organize OTP cards with secure encryption.
    - **One-click Fill**: Toast notification with code for manual entry or easy viewing.
    - Screenshot reading via OCR space.
- **Optimized for Traders**:
    - **Always on Top**: Pin window to monitor while working.
    - **System Tray**: Minimize to tray to keep connection alive.
    - **Auto-Update**: Background updates via GitHub Releases.
- **Core Security**: 
    - Restricted to `shsmart.shs.com.vn`.
    - Secure storage for credentials.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

## Development

Run the application in development mode:

```bash
npm start
```

## Build / Packaging

Create the Windows Installer (.exe):

```bash
npm run build
```

The output installer will be in the `dist/` directory.

### Customization

1.  **App Icon**: 
    - Replace `assets/icon.png` (Recommended: 512x512px).
    - Replace `assets/icon.ico` (For Windows installer).
    - *Note*: If standard build fails on icons, enable `icon` in `electron-builder.yml`.

2.  **Splash Screen**:
    - Edit `assets/splash.html` to update the loading screen design.

## Troubleshooting

- **Build Fails**: If you encounter "A required privilege is not held by the client" during build, try running your terminal as **Administrator** or enabling **Developer Mode** in Windows Settings to allow symbolic links.
