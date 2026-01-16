# SHS Trading Electron Shell

A custom Electron-based shell for the SHS Trading platform.

## Features
- **Single Domain Mode**: Restricted to `shsmart.shs.com.vn`.
- **Navigation Blocking**: Prevents navigating to external sites (opens them in default browser).
- **Splash Screen**: Fast loading startup screen.
- **Dedicated Shell**: No browser toolbars or menus.

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
