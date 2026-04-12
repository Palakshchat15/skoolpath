module.exports = {
  "expo": {
    "name": "SkoolPath Parent",
    "slug": "skoolpath-parent",
    "scheme": "skoolpath-parent",
    "entryPoint": "./index.js",
    "version": "1.0.0",
    "orientation": "portrait",
    "platforms": [
      "android",
      "ios",
      "web"
    ],
    "android": {
      "package": "com.skoolpath.parent",
      "config": {
        "googleMaps": {
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      }
    },
    "ios": {
      "supportsTablet": true
    },
    "extra": {
      "eas": {
        "projectId": "8c6c8822-e274-45d8-af69-31d55fb695bf"
      }
    },
    "plugins": []
  }
};
