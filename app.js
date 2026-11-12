const PRAYERS = [
  { key: "Fajr", label: "Fajr (فجر)", isPrayer: true },
  { key: "Sunrise", label: "Sunrise (شروق)", isPrayer: false },
  { key: "Dhuhr", label: "Zhuhr (ظهر)", isPrayer: true },
  { key: "Asr", label: "Asr (عصر)", isPrayer: true },
  { key: "Maghrib", label: "Maghrib (مغرب)", isPrayer: true },
  { key: "Isha", label: "Isha (عشاء)", isPrayer: true },
  { key: "Midnight", label: "Midnight", isPrayer: false },
  { key: "Firstthird", label: "First Third", isPrayer: false },
  { key: "Lastthird", label: "Last Third (Tahajjud)", isPrayer: false },
];
const DEFAULT_LOCATION = {
  name: "قرية علم الهدى، ولاية الجزيرة، السودان",
  latitude: 14.3847,
  longitude: 33.4253,
};
const CALCULATION_METHOD = 3;
const LOCATION_UPDATE_THRESHOLD_METERS = 250;

const elements = {
  locationName: document.querySelector("#location-name"),
  dateLine: document.querySelector("#date-line"),
  hijriLine: document.querySelector("#hijri-line"),
  prayerList: document.querySelector("#prayer-list"),
  nextName: document.querySelector("#next-name"),
  countdown: document.querySelector("#countdown"),
  nextTimeLabel: document.querySelector("#next-time-label"),
  searchForm: document.querySelector("#search-form"),
  citySearch: document.querySelector("#city-search"),
  mapHint: document.querySelector("#map-hint"),
  locateButton: document.querySelector("#locate-button"),
  toast: document.querySelector("#toast"),
};

let map;
let marker;
let activeLocation = DEFAULT_LOCATION;
let prayerSchedule = [];
let currentDateInfo;
let prayerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let countdownTimer;
let toastTimer;
let searchRequest = 0;
let prayerRequest = 0;
let locationRequest = 0;
let locationSelection = 0;
let locationWatchId;

function showMessage(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 4200);
}

function initMap() {
  if (!window.L) {
    elements.mapHint.textContent = "The map could not be loaded. Check your internet connection and refresh.";
    throw new Error("Leaflet did not load");
  }

  map = L.map("map", { scrollWheelZoom: false }).setView(
    [DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude],
    11,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  marker = L.marker([DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude]).addTo(map);
  map.on("click", (event) => {
    const { lat, lng } = event.latlng;
    void chooseLocation({
      name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      latitude: lat,
      longitude: lng,
    }, true);
  });
}

function setMapLocation(location) {
  const point = [location.latitude, location.longitude];
  marker.setLatLng(point);
  map.setView(point, Math.max(map.getZoom(), 11));
}

function distanceInMeters(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const latitude1 = radians(first.latitude);
  const latitude2 = radians(second.latitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function getLocationErrorMessage(error) {
  if (error.code === 1) {
    return "Location permission was denied. Allow location access in your browser settings, then try again.";
  }
  if (error.code === 2) {
    return "Your device could not determine your location. Check Location Services and try again.";
  }
  if (error.code === 3) {
    return "Location request timed out. Check Location Services and try again.";
  }
  return error.message || "Could not access your location.";
}

function stopDeviceLocationTracking() {
  locationSelection += 1;
  locationRequest += 1;
  if (locationWatchId !== undefined) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = undefined;
  }
}

function datePartsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function toPrayerDate(time, timeZone, dayOffset = 0) {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const today = datePartsInZone(new Date(), timeZone);
  const calendarDay = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
  const target = {
    year: calendarDay.getUTCFullYear(),
    month: calendarDay.getUTCMonth() + 1,
    day: calendarDay.getUTCDate(),
    hours,
    minutes,
    seconds: 0,
  };
  let timestamp = Date.UTC(target.year, target.month - 1, target.day, target.hours, target.minutes);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const observed = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
    const parts = Object.fromEntries(observed.map(({ type, value }) => [type, Number(value)]));
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const offset = representedAsUtc - timestamp;
    const adjusted = Date.UTC(target.year, target.month - 1, target.day, hours, minutes) - offset;
    if (adjusted === timestamp) break;
    timestamp = adjusted;
  }
  return new Date(timestamp);
}

function formatPrayerTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatGregorianDate(dateInfo) {
  const gregorian = dateInfo?.gregorian;
  if (!gregorian?.day || !gregorian.month?.en || !gregorian.year) {
    return dateInfo?.readable || "";
  }
  return `${Number(gregorian.day)} ${gregorian.month.en}, ${gregorian.year} ${gregorian.designation?.abbreviated || "AD"}`;
}

function formatHijriDate(dateInfo, locationName) {
  const hijri = dateInfo?.hijri;
  if (!hijri?.day || !hijri.month?.en || !hijri.year) return "";
  return `${Number(hijri.day)} ${hijri.month.en}, ${hijri.year} ${hijri.designation?.abbreviated || "AH"} in ${locationName}`;
}

function formatLocationName(result) {
  const address = result.address || {};
  return getLocationName(address, result.display_name.split(",").slice(0, 2).join(","));
}

function getLocationName(address, fallback) {
  const area = address.city
    || address.town
    || address.village
    || address.hamlet
    || address.suburb
    || address.municipality
    || address.county
    || address.state;
  return [area, address.country].filter(Boolean).join(", ") || fallback;
}

function getNextPrayer() {
  const now = new Date();
  const prayers = prayerSchedule.filter((prayer) => prayer.isPrayer);
  for (const prayer of prayers) {
    const prayerDate = toPrayerDate(prayer.time, prayerTimezone);
    if (prayerDate && prayerDate > now) return { ...prayer, date: prayerDate };
  }

  const fajr = prayers.find((prayer) => prayer.key === "Fajr");
  if (!fajr) return null;
  const date = toPrayerDate(fajr.time, prayerTimezone, 1);
  if (!date) return null;
  return { ...fajr, date };
}

function updateCountdown() {
  const next = getNextPrayer();
  if (!next) {
    elements.nextName.textContent = "Unavailable";
    elements.countdown.textContent = "--:--:--";
    elements.nextTimeLabel.textContent = "refresh to try again";
    return;
  }

  const remaining = Math.max(0, next.date.getTime() - Date.now());
  const seconds = Math.floor(remaining / 1000);
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  elements.nextName.textContent = next.label;
  elements.countdown.textContent = `${hours}:${minutes}:${remainder}`;
  elements.nextTimeLabel.textContent = `at ${formatPrayerTime(next.time)}`;
  document.querySelectorAll(".prayer-row").forEach((row) => {
    row.classList.toggle("is-next", row.dataset.prayer === next.key);
  });
}

function renderPrayerTimes(timings, dateInfo, timezone) {
  currentDateInfo = dateInfo;
  prayerTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  prayerSchedule = PRAYERS
    .filter(({ key }) => timings[key])
    .map(({ key, label, isPrayer }) => ({
      key,
      label,
      isPrayer,
      time: timings[key].split(" ")[0],
    }));

  elements.prayerList.replaceChildren();
  for (const prayer of prayerSchedule) {
    const row = document.createElement("div");
    row.className = "prayer-row";
    row.dataset.prayer = prayer.key;
    const name = document.createElement("span");
    name.textContent = prayer.label;
    const time = document.createElement("strong");
    time.textContent = formatPrayerTime(prayer.time);
    row.append(name, time);
    elements.prayerList.append(row);
  }

  elements.dateLine.textContent = formatGregorianDate(dateInfo);
  elements.hijriLine.textContent = formatHijriDate(dateInfo, activeLocation.name);
  updateCountdown();
}

async function loadPrayerTimes(location) {
  const requestId = ++prayerRequest;
  elements.locationName.textContent = location.name;
  elements.dateLine.textContent = "Loading today’s date";
  elements.hijriLine.textContent = "";
  currentDateInfo = undefined;
  elements.prayerList.innerHTML = '<div class="loading-state">Loading prayer times…</div>';
  prayerSchedule = [];
  updateCountdown();

  const url = new URL(`https://api.aladhan.com/v1/timings/${Math.floor(Date.now() / 1000)}`);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("method", String(CALCULATION_METHOD));

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Prayer time service returned ${response.status}`);
    const result = await response.json();
    if (result.code !== 200 || !result.data?.timings) {
      throw new Error(result.status || "Prayer time service returned an invalid response");
    }
    if (requestId !== prayerRequest) return;
    renderPrayerTimes(result.data.timings, result.data.date, result.data.meta?.timezone);
  } catch (error) {
    if (requestId !== prayerRequest) return;
    elements.prayerList.innerHTML = '<div class="loading-state">Prayer times could not be loaded.</div>';
    elements.dateLine.textContent = "Check your connection and try again";
    elements.hijriLine.textContent = "";
    showMessage(error.message || "Could not load prayer times.");
  }
}

async function reverseGeocode(location) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(location.latitude));
  url.searchParams.set("lon", String(location.longitude));
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Location service returned ${response.status}`);
  const result = await response.json();
  return getLocationName(result.address || {}, location.name);
}

async function chooseLocation(location, lookupName = false, trackingUpdate = false) {
  if (!trackingUpdate) {
    stopDeviceLocationTracking();
    searchRequest += 1;
  }
  activeLocation = location;
  setMapLocation(location);
  const coordinates = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  elements.mapHint.textContent = trackingUpdate
    ? `Auto-updating location · ${coordinates}`
    : coordinates;
  void loadPrayerTimes(location);

  if (lookupName) {
    const trackingRequest = locationRequest;
    try {
      const name = await reverseGeocode(location);
      if (activeLocation === location) {
        activeLocation = { ...location, name };
        elements.locationName.textContent = name;
        elements.hijriLine.textContent = formatHijriDate(currentDateInfo, name);
      } else if (trackingUpdate
        && trackingRequest === locationRequest
        && activeLocation.name === "Your location") {
        activeLocation = { ...activeLocation, name };
        elements.locationName.textContent = name;
        elements.hijriLine.textContent = formatHijriDate(currentDateInfo, name);
      }
    } catch (error) {
      elements.mapHint.textContent = `Location selected, but its place name could not be loaded: ${error.message}`;
      showMessage(`Could not look up the place name: ${error.message}`);
    }
  }
}

async function searchLocation(event) {
  event.preventDefault();
  const query = elements.citySearch.value.trim();
  if (!query) {
    showMessage("Enter a city or address to search.");
    return;
  }

  const requestId = ++searchRequest;
  stopDeviceLocationTracking();
  elements.mapHint.textContent = "Searching OpenStreetMap…";
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Location service returned ${response.status}`);
    const results = await response.json();
    if (requestId !== searchRequest) return;
    if (!results.length) {
      elements.mapHint.textContent = "No matching place found.";
      showMessage("No matching place found. Try a nearby city or a more specific address.");
      return;
    }

    const result = results[0];
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error("OpenStreetMap returned invalid coordinates.");
    }
    await chooseLocation({
      name: formatLocationName(result),
      latitude,
      longitude,
    });
    elements.mapHint.textContent = result.display_name;
  } catch (error) {
    if (requestId !== searchRequest) return;
    elements.mapHint.textContent = "Search could not be completed.";
    showMessage(`Could not search OpenStreetMap: ${error.message}`);
  }
}

function useDeviceLocation(automatic = false) {
  if (window.isSecureContext === false) {
    const message = "Browser location requires HTTPS or localhost. Open the app on localhost or a secure HTTPS address.";
    elements.mapHint.textContent = message;
    showMessage(message);
    return;
  }
  if (!navigator.geolocation) {
    const message = "This browser does not support location access. Search for a place or choose one on the map.";
    elements.mapHint.textContent = message;
    showMessage(message);
    return;
  }
  if (locationWatchId !== undefined) navigator.geolocation.clearWatch(locationWatchId);
  const requestId = ++locationRequest;
  const selectionId = locationSelection;
  let firstUpdate = true;
  let hasReportedError = false;
  elements.mapHint.textContent = automatic
    ? "Finding your location… Allow location access when your browser asks."
    : "Requesting your location…";
  try {
    locationWatchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (requestId !== locationRequest || selectionId !== locationSelection) return;
        const location = {
          name: "Your location",
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        if (!Number.isFinite(location.latitude)
          || !Number.isFinite(location.longitude)
          || Math.abs(location.latitude) > 90
          || Math.abs(location.longitude) > 180) {
          elements.mapHint.textContent = "Your browser returned invalid coordinates. Choose a place on the map or search instead.";
          return;
        }
        if (!firstUpdate
          && distanceInMeters(activeLocation, location) < LOCATION_UPDATE_THRESHOLD_METERS) return;
        const lookupName = firstUpdate;
        firstUpdate = false;
        hasReportedError = false;
        void chooseLocation(location, lookupName, true);
      },
      (error) => {
        if (requestId !== locationRequest || selectionId !== locationSelection) return;
        const message = getLocationErrorMessage(error);
        if (firstUpdate) {
          elements.mapHint.textContent = `Location unavailable — showing ${DEFAULT_LOCATION.name}. ${message}`;
        } else {
          elements.mapHint.textContent = `Could not update your location; keeping the last location. ${message}`;
        }
        if (!hasReportedError) showMessage(message);
        hasReportedError = true;
        if (error.code === 1) {
          navigator.geolocation.clearWatch(locationWatchId);
          locationWatchId = undefined;
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  } catch (error) {
    locationWatchId = undefined;
    const message = `Could not start browser location: ${error.message}`;
    elements.mapHint.textContent = message;
    showMessage(message);
  }
}

function start() {
  try {
    initMap();
  } catch (error) {
    showMessage("The map library did not load. Check your connection and refresh.");
    return;
  }

  elements.searchForm.addEventListener("submit", (event) => void searchLocation(event));
  elements.locateButton.addEventListener("click", useDeviceLocation);
  void loadPrayerTimes(activeLocation);
  useDeviceLocation(true);
  countdownTimer = setInterval(updateCountdown, 1000);
}

window.addEventListener("DOMContentLoaded", start);
window.addEventListener("pagehide", () => {
  clearInterval(countdownTimer);
  if (locationWatchId !== undefined) navigator.geolocation.clearWatch(locationWatchId);
}, { once: true });
