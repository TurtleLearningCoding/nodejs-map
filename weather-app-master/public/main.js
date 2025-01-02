'use strict';

import Icons from './leaflet-color-icons.js';
import { sortTypes } from './utils.js';

const serverUrl = 'http://localhost:8080';
const CITY_ZOOM = 10;
const DEFAULT_CITY_MARKER_ICON = Icons.blueIcon;
const WEATHER_CACHE_EXPIRATION_TIME = 60 * 60000; // 60 minutes

const citiesCache = new Map();
const weatherCache = new Map();
const markersCache = new Map();

const map = initMap('map-section');
const citiesListElement = document.querySelector('#cities-list');
const weatherElem = document.querySelector('#weather-section');

let selectedCity;

// Update page history state when navigating back or forward
window.onpopstate = function (e) {
    if (Number.isInteger(e.state) && citiesListElement.selectedIndex !== e.state) {
        citiesListElement.selectedIndex = e.state;
        citiesListElement.dispatchEvent(new Event("change"));
    }
};

// Fetch city data and render in dropdown
getData(`${serverUrl}/cities.json`)
    .then(cities => {
        cities.sort((c1, c2) => sortTypes.caseInsensitive(c1.name, c2.name));
        renderCities(cities);
        if (!handleAddressBarResponse()) {
            window.history.replaceState(-1, '', serverUrl);
        }
    })
    .catch(err => console.error('Error loading cities:', err));

// General data fetch utility
async function getData(url) {
    const response = await fetch(url);
    return response.ok ? response.json() : Promise.reject(`Failed to load: ${url}`);
}

// Render cities in the dropdown and add markers on the map
function renderCities(cities) {
    if (!cities || cities.length === 0) return;

    const citiesFragment = document.createDocumentFragment();
    cities.forEach(city => {
        addCityMarker(city);
        citiesFragment.appendChild(createCityElement(city));
    });

    citiesListElement.replaceChildren(citiesFragment);
    citiesListElement.onchange = cityChanged;
    citiesListElement.selectedIndex = -1;
}

// Add city marker to the map
function addCityMarker(city, icon = DEFAULT_CITY_MARKER_ICON) {
    const marker = new L.marker([city.coord.lat, city.coord.lon], { title: city.name, icon: icon });
    marker.cityId = city.id;
    marker.on('click', markerClicked);
    marker.addTo(map);
    markersCache.set(city, marker);
}

// Handle marker click event to change selected city
function markerClicked(e) {
    if (citiesListElement.value != this.cityId) {
        citiesListElement.value = this.cityId;
        citiesListElement.dispatchEvent(new Event("change"));
    }
}

// Create city element for dropdown
function createCityElement(city) {
    const cityElement = document.createElement('option');
    cityElement.textContent = city.name;
    cityElement.value = city.id;
    citiesCache.set(city.id, city);
    return cityElement;
}

// Handle city selection change
function cityChanged(e) {
    if (selectedCity) {
        markersCache.get(selectedCity).setIcon(Icons.blueIcon);
    }

    const cityId = Number(e.target.value);
    selectedCity = cityId ? citiesCache.get(cityId) : undefined;
    const url = `${serverUrl}${selectedCity ? `/weather?city=${selectedCity.name},${selectedCity.country}` : ''}`;

    if (window.history.state !== e.target.selectedIndex) {
        window.history.pushState(e.target.selectedIndex, '', url);
    }

    if (selectedCity) {
        markersCache.get(selectedCity).setIcon(Icons.redIcon);
        map.flyTo([selectedCity.coord.lat, selectedCity.coord.lon], CITY_ZOOM);
    } else {
        map.fitWorld({ reset: true }).zoomIn();
    }

    updateWeatherInfo();
}

// Fetch and update weather data for selected city
function updateWeatherInfo(city = selectedCity) {
    if (!selectedCity) {
        renderWeatherData();
        return;
    }

    if (weatherCache.has(city.id)) {
        const cachedData = weatherCache.get(city.id);
        if (Date.now() - cachedData.lastModified <= WEATHER_CACHE_EXPIRATION_TIME) {
            renderWeatherData(cachedData);
            return;
        }
    }

    // Fetch data if cache is expired or missing
    getData(`${serverUrl}/weather/${city.id}`)
        .then(weatherObj => {
            weatherObj.lastModified = Date.now();
            weatherCache.set(city.id, weatherObj);
            renderWeatherData(weatherObj);
        })
        .catch(err => console.error('Error fetching weather:', err));
}

// Display the weather data on the page
function renderWeatherData(data) {
    if (data) {
        weatherElem.querySelector('#description').textContent = data.weather[0].description || 'N/A';
        weatherElem.querySelector('#wind').textContent = `speed ${data.wind.speed} m/s, ${data.wind.deg}°` || 'N/A';
        weatherElem.querySelector('#temperature').textContent = `${data.main.temp}°C` || 'N/A';
        weatherElem.querySelector('#humidity').textContent = `${data.main.humidity}%` || 'N/A';
    } else {
        weatherElem.querySelectorAll('.data-field').forEach(elem => elem.textContent = 'N/A');
    }
}

// Initialize map and set view
function initMap(mapElementId) {
    const map = L.map(mapElementId);
    map.setView({ lon: 0, lat: 0 }, 1);
    L.tileLayer('https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=f5LbbrtwrAG63SgNdh3Q', {
        attribution: `<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a>
                      <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>`,
    }).addTo(map);
    map.fitWorld().zoomIn();
    return map;
}

// Handle direct browser access via address bar
function handleAddressBarResponse() {
    const weatherData = document.cookie.replace(/(?:(?:^|.*;\s*)weatherData\s*\=\s*([^;]*).*$)|^.*$/, "$1");
    if (weatherData) {
        const weatherObj = JSON.parse(weatherData);
        weatherObj.lastModified = Date.now();
        weatherCache.set(weatherObj.id, weatherObj);
        citiesListElement.value = weatherObj.id;
        citiesListElement.dispatchEvent(new Event("change"));
        document.cookie = 'weatherData=;';
        return true;
    }
    return false;
}
