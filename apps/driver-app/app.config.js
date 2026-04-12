module.exports = {
  "expo": {
    "name": "SkoolPath Driver",
    "slug": "skoolpath-driver",
    "scheme": "skoolpath-driver",
    "entryPoint": "./index.js",
    "version": "1.0.0",
    "orientation": "portrait",
    "platforms": [
      "android",
      "ios",
      "web"
    ],
    "plugins": [
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true
        }
      ]
    ],
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "The driver app needs your location to share the bus position with parents.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "The driver app needs background location so parents can track the bus during trips.",
        "UIBackgroundModes": [
          "location"
        ]
      }
    },
    "android": {
      "package": "com.skoolpath.driver",
      "config": {
        "googleMaps": {
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      }
    },
    "extra": {
      "eas": {
        "projectId": "b74df9cb-5289-4632-9814-1ffc682ad5e2"
      }
    }
  }
};
