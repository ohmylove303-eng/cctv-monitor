/* eslint-disable no-undef */
importScripts('https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js');

let satrecs = [];
let intervalId = null;

self.onmessage = function (e) {
    const { type, tles } = e.data;

    if (type === 'INIT') {
        satrecs = tles.map(tle => {
            try {
                return {
                    name: tle.name,
                    satrec: satellite.twoline2satrec(tle.line1, tle.line2)
                };
            } catch (err) {
                return null;
            }
        }).filter(s => s !== null);

        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(calculatePositions, 1000);
    }
};

function calculatePositions() {
    const now = new Date();
    const positions = [];

    satrecs.forEach(s => {
        try {
            const positionAndVelocity = satellite.propagate(s.satrec, now);
            const positionEci = positionAndVelocity.position;

            if (positionEci) {
                const gmst = satellite.gstime(now);
                const positionGd = satellite.eciToGeodetic(positionEci, gmst);

                const longitude = satellite.degreesLong(positionGd.longitude);
                const latitude = satellite.degreesLat(positionGd.latitude);
                const height = positionGd.height * 1000; // Kilometers to Meters

                positions.push({
                    name: s.name,
                    coordinates: [longitude, latitude, height]
                });
            }
        } catch (err) {
            // Skip failed individual calculations
        }
    });

    self.postMessage({ type: 'UPDATE', positions });
}
