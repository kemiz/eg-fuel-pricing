// Site catalogue for the EG fuel pricing MVP.
//
// US sites use real EG America banner brands mapped to the states they operate
// in; UK sites use the EG corporate identity across the 11 GB regions. Many
// cities per region give the map something to zoom into. Coordinates are real
// city centroids (good enough for a forecourt-network demo); prices/costs are
// synthetic and generated in run-seed from these rows.

/** @typedef {{ id:string, name:string, brand:string, country:'US'|'UK', region:string, lat:number, lon:number }} Site */

// US banner -> states it operates in (per EG America), with sample cities.
const US_BANNERS = [
  {
    brand: "Cumberland Farms",
    cities: [
      ["MA", "Boston", 42.3601, -71.0589],
      ["MA", "Worcester", 42.2626, -71.8023],
      ["MA", "Springfield", 42.1015, -72.5898],
      ["FL", "Orlando", 28.5383, -81.3792],
      ["FL", "Tampa", 27.9506, -82.4572],
      ["FL", "Jacksonville", 30.3322, -81.6557],
      ["CT", "Hartford", 41.7658, -72.6734],
      ["ME", "Portland", 43.6591, -70.2568],
      ["NY", "Albany", 42.6526, -73.7562],
      ["NH", "Manchester", 42.9956, -71.4548],
      ["RI", "Providence", 41.824, -71.4128],
      ["VT", "Burlington", 44.4759, -73.2121],
    ],
  },
  {
    brand: "Fastrac",
    cities: [
      ["NY", "Syracuse", 43.0481, -76.1474],
      ["NY", "Rochester", 43.1566, -77.6088],
      ["NY", "Binghamton", 42.0987, -75.918],
    ],
  },
  {
    brand: "Certified Oil",
    cities: [
      ["OH", "Columbus", 39.9612, -82.9988],
      ["OH", "Cincinnati", 39.1031, -84.512],
      ["WV", "Charleston", 38.3498, -81.6326],
    ],
  },
  {
    brand: "Turkey Hill",
    cities: [
      ["PA", "Lancaster", 40.0379, -76.3055],
      ["PA", "Harrisburg", 40.2732, -76.8867],
      ["OH", "Dayton", 39.7589, -84.1916],
      ["IN", "Indianapolis", 39.7684, -86.1581],
    ],
  },
  {
    brand: "Sprint",
    cities: [
      ["SC", "Columbia", 34.0007, -81.0348],
      ["GA", "Atlanta", 33.749, -84.388],
      ["GA", "Savannah", 32.0809, -81.0912],
    ],
  },
  {
    brand: "Quik Stop",
    cities: [
      ["CA", "Sacramento", 38.5816, -121.4944],
      ["CA", "Fresno", 36.7378, -119.7871],
      ["NV", "Reno", 39.5296, -119.8138],
    ],
  },
  {
    brand: "Loaf N Jug",
    cities: [
      ["CO", "Denver", 39.7392, -104.9903],
      ["CO", "Colorado Springs", 38.8339, -104.8214],
      ["NM", "Albuquerque", 35.0844, -106.6504],
      ["WY", "Cheyenne", 41.14, -104.8202],
      ["NE", "Omaha", 41.2565, -95.9345],
    ],
  },
  {
    brand: "Kwik Shop",
    cities: [
      ["KS", "Wichita", 37.6872, -97.3301],
      ["IA", "Des Moines", 41.5868, -93.625],
      ["MO", "Kansas City", 39.0997, -94.5786],
    ],
  },
  {
    brand: "Minit Mart",
    cities: [
      ["KY", "Louisville", 38.2527, -85.7585],
      ["TN", "Nashville", 36.1627, -86.7816],
      ["IL", "Springfield", 39.7817, -89.6501],
    ],
  },
];

// UK region -> sample towns.
const UK_REGIONS = [
  ["North West", [["Bolton", 53.5769, -2.4282], ["Manchester", 53.4808, -2.2426], ["Liverpool", 53.4084, -2.9916], ["Preston", 53.7632, -2.7031]]],
  ["North East", [["Newcastle", 54.9783, -1.6178], ["Sunderland", 54.9069, -1.3838]]],
  ["Yorkshire and The Humber", [["Leeds", 53.8008, -1.5491], ["Sheffield", 53.3811, -1.4701], ["Hull", 53.7676, -0.3274]]],
  ["West Midlands", [["Birmingham", 52.4862, -1.8904], ["Coventry", 52.4068, -1.5197], ["Wolverhampton", 52.5862, -2.1288]]],
  ["East Midlands", [["Nottingham", 52.9548, -1.1581], ["Leicester", 52.6369, -1.1398], ["Derby", 52.9226, -1.4746]]],
  ["London", [["Brentford", 51.4875, -0.309], ["Croydon", 51.3762, -0.0982], ["Ilford", 51.5588, 0.0807]]],
  ["South East", [["Brighton", 50.8225, -0.1372], ["Reading", 51.4543, -0.9781], ["Oxford", 51.752, -1.2577]]],
  ["South West", [["Bristol", 51.4545, -2.5879], ["Plymouth", 50.3755, -4.1427], ["Exeter", 50.7184, -3.5339]]],
  ["Eastern", [["Norwich", 52.6309, 1.2974], ["Cambridge", 52.2053, 0.1218], ["Ipswich", 52.0567, 1.1482]]],
  ["Scotland", [["Glasgow", 55.8642, -4.2518], ["Edinburgh", 55.9533, -3.1883], ["Aberdeen", 57.1497, -2.0943]]],
  ["Wales", [["Cardiff", 51.4816, -3.1791], ["Swansea", 51.6214, -3.9436]]],
];

/** Build the full site list with stable ids. */
export function buildSites() {
  /** @type {Site[]} */
  const sites = [];

  for (const banner of US_BANNERS) {
    let n = 1;
    for (const [state, city, lat, lon] of banner.cities) {
      const slug = banner.brand.toLowerCase().replace(/[^a-z]+/g, "");
      sites.push({
        id: `us-${state.toLowerCase()}-${slug}-${n}`,
        name: `${banner.brand} ${city}`,
        brand: banner.brand,
        country: "US",
        region: state,
        lat: jitter(lat),
        lon: jitter(lon),
      });
      n += 1;
    }
  }

  for (const [region, towns] of UK_REGIONS) {
    let n = 1;
    const regionKey = region === "Yorkshire and The Humber" ? "Yorkshire" : region;
    for (const [town, lat, lon] of towns) {
      const rslug = regionKey.toLowerCase().replace(/[^a-z]+/g, "");
      sites.push({
        id: `uk-${rslug}-${n}`,
        name: `EG ${town}`,
        brand: "EG",
        country: "UK",
        // Store the normalized region key so it matches the map topojson.
        region: regionKey,
        lat: jitter(lat),
        lon: jitter(lon),
      });
      n += 1;
    }
  }

  return sites;
}

// Small deterministic-ish jitter so multiple sites in a city don't overlap.
let _seed = 1;
function jitter(v) {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  const delta = ((_seed % 1000) / 1000 - 0.5) * 0.08;
  return Number((v + delta).toFixed(4));
}
