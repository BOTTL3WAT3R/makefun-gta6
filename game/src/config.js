// config.js — Costa Vera's fixed geography and tuning tables.
//
// Everything the other modules need to agree on lives here: the road grid,
// the named places, the vehicle catalogue, where the hidden packages sit and
// what every job and service pays. Coordinates are world units (metres,
// roughly); the city runs x -480..300, the sea starts at x 330.

// --- Road grid -------------------------------------------------------------
// Avenues run north–south (constant x), streets run east–west (constant z).
export const ROAD_X = [-360, -240, -120, 0, 120, 240];
export const ROAD_Z = [-360, -240, -120, 0, 120, 240, 360];
export const ROAD_HALF = 12; // half the road width

export const CITY = {
  minX: -480, maxX: 300, // land east edge before the promenade
  minZ: -480, maxZ: 480,
  promenadeX: 292, // the boardwalk avenue along the sea
  sandX: 336, // where the beach starts; cars stop here
  waterX: 372, // open water beyond this line
  pierZ: 58, // the pier runs east at this z
  pierEndX: 462,
};

// --- Named places ----------------------------------------------------------
export const PLACES = {
  pilarCorner: { x: 284, z: 132, label: 'Pilar Duarte' },
  pierEnd: { x: 448, z: 58, label: 'Costa Vera Pier' },
  pierRoot: { x: 322, z: 58, label: 'Pier entrance' },
  comisaria: { x: -356, z: -330, label: 'Comisaría' },
  comisariaDoor: { x: -330, z: -330, label: 'Comisaría' },
  clinica: { x: -126, z: 96, label: 'Clínica Sol' },
  clinicaDoor: { x: -126, z: 116, label: 'Clínica Sol' },
  clubBrisa: { x: 168, z: -318, label: 'Club Brisa' },
  clubCarPark: { x: 168, z: -272, label: 'Club Brisa car park' },
  clubRear: { x: 196, z: -330, label: 'Club Brisa kitchen door' },
  cafeAlba: { x: -246, z: -96, label: 'Café Alba' },
  marina: { x: 330, z: -356, label: 'Marina Alba' },
  marinaParking: { x: 292, z: -318, label: 'Marina car park' },
  lockup: { x: -404, z: 404, label: "Pilar's lockup" },
  plaza: { x: -60, z: -60, label: 'Plaza del Faro' },
  safehouse: { x: 284, z: 330, label: 'Boardwalk safehouse' },
  paintShop: { x: 66, z: 252, label: 'Brillo Pintura' },
  gunShop: { x: -246, z: 264, label: 'Armería Sol' },
  carWash: { x: 270, z: 88, label: 'Lavado Brisa' },
  hotelMarea: { x: 60, z: -180, label: 'Hotel Marea' },
};

export const PLAYER_START = { x: 276, z: 168, heading: -Math.PI / 2 };
export const START_CASH = 85;

// --- Vehicles ---------------------------------------------------------------
// topSpeed in m/s, accel in m/s^2, grip is a steering feel multiplier.
export const VEHICLE_TYPES = {
  compact: { name: 'Brisita Compact', topSpeed: 33, accel: 15, reverse: 9, grip: 1.15 },
  sedan: { name: 'Alba Sedan', topSpeed: 40, accel: 17, reverse: 10, grip: 1.0 },
  sports: { name: 'Vendaval GT', topSpeed: 58, accel: 29, reverse: 12, grip: 1.1 },
  pickup: { name: 'Toro Pickup', topSpeed: 42, accel: 18, reverse: 11, grip: 0.9 },
  van: { name: 'Furgón Van', topSpeed: 36, accel: 14, reverse: 9, grip: 0.85 },
  taxi: { name: 'Taxi Sol', topSpeed: 43, accel: 19, reverse: 10, grip: 1.0 },
};
export const VEHICLE_COLORS = [0xd94f30, 0x2e6fb7, 0xe8b93c, 0x3f9e63, 0xd8d3c8, 0x7a4fa3, 0x30343c, 0xe4e0d6];

// --- Hidden packages ---------------------------------------------------------
export const PACKAGE_POSITIONS = [
  { x: 448, z: 58 }, // pier end
  { x: 292, z: -210 }, // boardwalk north
  { x: 292, z: 420 }, // boardwalk south end
  { x: -46, z: -46 }, // plaza, beside the fountain
  { x: 168, z: -252 }, // Club Brisa lot corner
  { x: -330, z: -306 }, // behind the Comisaría
  { x: -126, z: 132 }, // Clínica garden
  { x: 330, z: -392 }, // marina dock end
  { x: -404, z: 380 }, // lockup yard
  { x: 60, z: -156 }, // Hotel Marea steps
  { x: -246, z: -72 }, // Café Alba terrace
  { x: 12, z: 12 }, // avenue crossing centre-north
  { x: -372, z: 12 }, // west avenue
  { x: 132, z: -132 }, // back street
  { x: -12, z: 372 }, // south street
];
export const PACKAGE_VALUE = 25;

// --- Races -------------------------------------------------------------------
export const RACES = {
  vuelta: {
    name: 'Gran Vuelta',
    start: { x: -60, z: -24 },
    needsVehicle: true,
    parSeconds: 300,
    prize: 250,
    gates: [
      { x: 0, z: -120 }, { x: 120, z: -240 }, { x: 240, z: -360 },
      { x: 120, z: -360 }, { x: 0, z: -240 }, { x: -120, z: -360 },
      { x: -240, z: -240 }, { x: -360, z: -120 }, { x: -240, z: 0 },
      { x: -60, z: -24 },
    ],
  },
  boardwalk: {
    name: 'Boardwalk Run',
    start: { x: 292, z: -200 },
    needsVehicle: false,
    parSeconds: 150,
    prize: 120,
    gates: [
      { x: 292, z: -120 }, { x: 292, z: -40 }, { x: 292, z: 40 },
      { x: 292, z: 120 }, { x: 292, z: 200 }, { x: 292, z: 280 },
      { x: 292, z: 360 }, { x: 292, z: 430 },
    ],
  },
};

// --- Services ------------------------------------------------------------------
export const SERVICES = {
  clinic: { place: 'clinicaDoor', price: 60, label: 'Get treated at Clínica Sol', onFoot: true },
  paint: { place: 'paintShop', price: 150, label: 'Respray at Brillo Pintura (clears wanted)', inVehicle: true },
  armor: { place: 'gunShop', price: 100, label: 'Buy body armour at Armería Sol', onFoot: true },
  wash: { place: 'carWash', price: 20, label: 'Wash at Lavado Brisa (repairs, -1 star)', inVehicle: true },
};

// --- Economy and law -----------------------------------------------------------
export const FARES = { base: 28, tipWindow: 75 };
export const BUST_FINE = { base: 40, perStar: 15 };
export const HOSPITAL_FEE = 50;
