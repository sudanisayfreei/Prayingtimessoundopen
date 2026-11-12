# Noor Times

A lightweight prayer-times dashboard. It uses the [AlAdhan API](https://aladhan.com/prayer-times-api) for daily prayer times and [OpenStreetMap](https://www.openstreetmap.org/) data through Leaflet and Nominatim to search for and select a location.

## Run locally

The app is static and has no build step. From this directory, start a local web server:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

The browser needs an internet connection to load the map library, map tiles, location search, and prayer times. On launch, the app requests high-accuracy device location and keeps the map and prayer times updated after movement of about 250 m if permission is granted; if permission is denied or location is unavailable, the default remains قرية علم الهدى، ولاية الجزيرة، السودان and the app explains the issue. Selecting a location manually pauses device tracking. Browser location requires permission and a secure context; use `localhost` or HTTPS.

## Usage

- Search for a city or address, or click the map to select a location.
- Device location is requested on launch; use **Location automatically** to request it again.
- View prayer times in 12-hour format, with Gregorian and Hijri dates, sunrise, midnight, and the three night divisions.
- The next-prayer countdown is shown with the prayer schedule.

The map uses OpenStreetMap tiles and the Nominatim geocoding service. Please follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/); avoid automated or bulk searches.
