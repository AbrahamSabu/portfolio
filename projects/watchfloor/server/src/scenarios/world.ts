import { distanceM, type LatLon } from '@watchfloor/shared';
import { englishChannel } from './englishChannel';
import type { Airport, Route, Scenario } from './types';

/**
 * The whole world, simulated: what the static demo shows, so the globe looks
 * the way the live display does, full of traffic, without a feed or a key.
 *
 * Airliners fly great circles between 190 of the world's busiest airports
 * (positions from OurAirports, via client/src/data/airports.json), busy pairs
 * close together most often, the long haul now and then. Ships follow the
 * main ocean lanes, hand-placed to stay at sea: through Suez, Malacca,
 * Panama, Hormuz, the Bosphorus and round the Cape, with a spread that is
 * wide in mid-ocean and tight in a strait. The English Channel keeps all of
 * its own detail (ferries, fishing, patrols, the drone's orbit), so zooming
 * in there still shows a working sea.
 */

// [ICAO, lat, lon, how busy (1-10)]
const HUBS: [string, number, number, number][] = [
  ['KATL', 33.6367, -84.4281, 10],
  ['KORD', 41.9786, -87.9048, 9],
  ['KDFW', 32.8968, -97.038, 9],
  ['KDEN', 39.86, -104.6738, 8],
  ['KLAX', 33.9425, -118.408, 8],
  ['KJFK', 40.6394, -73.7793, 7],
  ['KCLT', 35.214, -80.9431, 7],
  ['KLAS', 36.0834, -115.1518, 6],
  ['KMCO', 28.4294, -81.309, 6],
  ['KMIA', 25.796, -80.2898, 6],
  ['KSEA', 47.4479, -122.3103, 6],
  ['KPHX', 33.4353, -112.0059, 6],
  ['KSFO', 37.6198, -122.3748, 6],
  ['KEWR', 40.6894, -74.1705, 6],
  ['KIAH', 29.9844, -95.3414, 6],
  ['KBOS', 42.362, -71.0079, 5],
  ['KMSP', 44.8801, -93.2217, 5],
  ['KDTW', 42.2138, -83.3538, 5],
  ['KPHL', 39.8719, -75.2411, 4],
  ['KSLC', 40.7889, -111.9799, 4],
  ['KDCA', 38.8521, -77.0377, 4],
  ['KSAN', 32.7336, -117.19, 4],
  ['KIAD', 38.9445, -77.4558, 3],
  ['KBWI', 39.1754, -76.6683, 3],
  ['KTPA', 27.9755, -82.5332, 3],
  ['KBNA', 36.1245, -86.6782, 3],
  ['KAUS', 30.1975, -97.662, 3],
  ['KMDW', 41.786, -87.7524, 3],
  ['KSTL', 38.7487, -90.37, 2],
  ['KMCI', 39.3017, -94.7139, 2],
  ['KPDX', 45.5887, -122.598, 3],
  ['KRDU', 35.8787, -78.7873, 2],
  ['KMSY', 29.9934, -90.2647, 2],
  ['KCLE', 41.4117, -81.8498, 2],
  ['KPIT', 40.4915, -80.2329, 2],
  ['KSAT', 29.5337, -98.4698, 2],
  ['KFLL', 26.0726, -80.1527, 4],
  ['CYYZ', 43.6759, -79.6294, 6],
  ['CYVR', 49.1939, -123.184, 4],
  ['CYUL', 45.4678, -73.7423, 3],
  ['CYYC', 51.1188, -114.0099, 3],
  ['CYEG', 53.3097, -113.58, 2],
  ['CYOW', 45.3225, -75.6692, 1],
  ['MMMX', 19.4358, -99.0703, 6],
  ['MMUN', 21.0408, -86.8735, 3],
  ['MMGL', 20.5233, -103.3101, 2],
  ['MMMY', 25.7785, -100.107, 2],
  ['PANC', 61.179, -149.9926, 2],
  ['PHNL', 21.3184, -157.9257, 3],
  ['MPTO', 9.0714, -79.3835, 2],
  ['MKJP', 17.9357, -76.7875, 1],
  ['TJSJ', 18.4394, -66.0018, 2],
  ['MUHA', 22.9892, -82.4091, 1],
  ['MDPC', 18.5671, -68.3646, 2],
  ['SBGR', -23.4313, -46.47, 5],
  ['SBSP', -23.6277, -46.6546, 3],
  ['SBBR', -15.8692, -47.9208, 2],
  ['SBGL', -22.81, -43.2506, 2],
  ['SBKP', -23.0074, -47.1345, 2],
  ['SAEZ', -34.8222, -58.5358, 2],
  ['SABE', -34.5594, -58.4155, 2],
  ['SCEL', -33.393, -70.7858, 3],
  ['SKBO', 4.7016, -74.1469, 4],
  ['SPJC', -12.0219, -77.1143, 3],
  ['SEQM', -0.1254, -78.3543, 1],
  ['SVMI', 10.6022, -66.9912, 1],
  ['SBPA', -29.994, -51.1675, 1],
  ['SBSV', -12.9086, -38.3225, 1],
  ['EGLL', 51.4707, -0.4599, 8],
  ['EHAM', 52.3086, 4.7639, 7],
  ['LFPG', 49.009, 2.5541, 7],
  ['EDDF', 50.0267, 8.5584, 7],
  ['LEMD', 40.4934, -3.5722, 6],
  ['LEBL', 41.2971, 2.0785, 5],
  ['LIRF', 41.8045, 12.252, 4],
  ['EDDM', 48.3538, 11.7861, 5],
  ['LSZH', 47.4581, 8.5481, 3],
  ['LOWW', 48.1103, 16.5697, 4],
  ['EKCH', 55.6179, 12.656, 4],
  ['ENGM', 60.1939, 11.1004, 3],
  ['ESSA', 59.6485, 17.9288, 3],
  ['EFHK', 60.3184, 24.9633, 2],
  ['EIDW', 53.4287, -6.2621, 4],
  ['EGKK', 51.1487, -0.1857, 5],
  ['EGCC', 53.3494, -2.2795, 3],
  ['EBBR', 50.9014, 4.4844, 3],
  ['LPPT', 38.7813, -9.1359, 4],
  ['LGAV', 37.9364, 23.9445, 3],
  ['LTFM', 41.2749, 28.7321, 7],
  ['LTFJ', 40.8986, 29.3092, 4],
  ['EPWA', 52.1657, 20.9671, 3],
  ['LKPR', 50.1009, 14.2599, 2],
  ['LHBP', 47.4302, 19.2624, 2],
  ['LIMC', 45.6306, 8.7281, 3],
  ['LEPA', 39.5517, 2.7388, 4],
  ['EDDB', 52.3617, 13.5023, 3],
  ['EGPH', 55.9501, -3.3723, 2],
  ['LROP', 44.5718, 26.1033, 2],
  ['LFMN', 43.6584, 7.2159, 2],
  ['LFLL', 45.726, 5.0901, 1],
  ['EDDH', 53.6304, 9.9882, 2],
  ['EDDL', 51.2895, 6.7668, 2],
  ['LSGG', 46.2381, 6.109, 2],
  ['EGSS', 51.885, 0.235, 3],
  ['LEMG', 36.6782, -4.5002, 3],
  ['LIPZ', 45.5053, 12.3519, 1],
  ['LTAI', 36.8987, 30.8005, 3],
  ['UUEE', 55.9775, 37.3867, 3],
  ['UUDD', 55.4088, 37.9063, 2],
  ['ULLI', 59.8003, 30.2625, 2],
  ['UKBB', 50.345, 30.8947, 1],
  ['LCLK', 34.8751, 33.6249, 1],
  ['BIKF', 63.985, -22.6056, 1],
  ['OMDB', 25.2498, 55.371, 8],
  ['OTHH', 25.2731, 51.6081, 5],
  ['OERK', 24.9576, 46.6988, 3],
  ['OEJN', 21.6802, 39.1574, 3],
  ['OMAA', 24.441, 54.6492, 3],
  ['LLBG', 32.0114, 34.8867, 2],
  ['OJAI', 31.7226, 35.9932, 1],
  ['OBBI', 26.2673, 50.6376, 1],
  ['OKKK', 29.2245, 47.9698, 1],
  ['OIIE', 35.4161, 51.1522, 1],
  ['VHHH', 22.3118, 113.9149, 5],
  ['RJTT', 35.5497, 139.787, 7],
  ['RJAA', 35.7686, 140.3887, 4],
  ['RKSI', 37.4691, 126.451, 5],
  ['RKSS', 37.5583, 126.791, 3],
  ['ZBAA', 40.0773, 116.5967, 6],
  ['ZBAD', 39.5013, 116.414, 3],
  ['ZSPD', 31.1434, 121.805, 6],
  ['ZSSS', 31.1981, 121.3343, 4],
  ['ZGGG', 23.3924, 113.299, 6],
  ['ZGSZ', 22.6395, 113.8033, 5],
  ['ZUUU', 30.5583, 103.946, 4],
  ['ZPPP', 25.1103, 102.9367, 3],
  ['ZLXY', 34.4422, 108.7624, 3],
  ['ZUCK', 29.7123, 106.6519, 3],
  ['ZSHC', 30.2361, 120.4289, 3],
  ['ZSNJ', 31.735, 118.8659, 2],
  ['ZHHH', 30.7748, 114.2137, 3],
  ['ZSAM', 24.5439, 118.1275, 2],
  ['ZGHA', 28.1892, 113.22, 2],
  ['ZSQD', 36.362, 120.0882, 2],
  ['ZYTX', 41.6398, 123.4837, 2],
  ['ZWWW', 43.9136, 87.4794, 2],
  ['RCTP', 25.0777, 121.233, 4],
  ['WSSS', 1.3502, 103.994, 6],
  ['VTBS', 13.6811, 100.747, 5],
  ['VTBD', 13.9126, 100.607, 3],
  ['WMKK', 2.7456, 101.71, 4],
  ['WIII', -6.1256, 106.656, 5],
  ['WADD', -8.7484, 115.1671, 3],
  ['RPLL', 14.5086, 121.02, 4],
  ['VVTS', 10.8188, 106.652, 3],
  ['VVNB', 21.2212, 105.807, 3],
  ['VIDP', 28.5556, 77.0952, 6],
  ['VABB', 19.0887, 72.8679, 5],
  ['VOBL', 13.1979, 77.7063, 4],
  ['VOMM', 12.99, 80.1693, 3],
  ['VECC', 22.654, 88.4477, 2],
  ['VOHS', 17.2313, 78.4299, 2],
  ['OPKC', 24.9065, 67.1608, 2],
  ['VCBI', 7.1808, 79.8841, 1],
  ['RJBB', 34.4273, 135.244, 3],
  ['RJFF', 33.5859, 130.451, 2],
  ['RJCC', 42.7748, 141.6904, 3],
  ['RKPC', 33.5121, 126.4925, 3],
  ['VDPP', 11.5472, 104.8447, 1],
  ['VYYY', 16.9073, 96.1332, 1],
  ['FAOR', -26.1401, 28.2468, 3],
  ['HECA', 30.1115, 31.3967, 3],
  ['DNMM', 6.5774, 3.3212, 2],
  ['HAAB', 8.9779, 38.7993, 2],
  ['HKJK', -1.3189, 36.9282, 2],
  ['GMMN', 33.3675, -7.59, 2],
  ['FACT', -33.974, 18.6043, 2],
  ['DTTA', 36.851, 10.2272, 1],
  ['DAAG', 36.6939, 3.2145, 1],
  ['DGAA', 5.6052, -0.1668, 1],
  ['FMMI', -18.7969, 47.4788, 1],
  ['FIMP', -20.4302, 57.6836, 1],
  ['YSSY', -33.9461, 151.177, 4],
  ['YMML', -37.6707, 144.8379, 4],
  ['YBBN', -27.3842, 153.117, 3],
  ['YPPH', -31.9403, 115.967, 2],
  ['NZAA', -37.012, 174.7863, 2],
  ['YPAD', -34.9475, 138.5334, 1],
  ['NZCH', -43.489, 172.5321, 1],
  ['NFFN', -17.7618, 177.4378, 1],
];

/** [lat, lon, spread]: spread is how far ships wander off the point, in degrees. */
type P = [number, number, number?];
/** Mid-ocean, ships spread across a wide band; near land each point says how tight. */
const OCEAN_SPREAD = 0.25;

const pts = (list: P[]): Route['points'] => list.map(([lat, lon, spread]) => ({ lat, lon, spreadDeg: spread ?? OCEAN_SPREAD }));
const rev = (list: P[]): P[] => [...list].reverse();

// Segments, each in one direction; lanes are built from them both ways.

/** Shanghai down the China coast to the open sea east of Singapore. */
const CHINA_SEA: P[] = [
  [31.0, 122.7, 0.1], [29.5, 123.2], [26.0, 120.6, 0.15], [24.4, 119.3, 0.2], [22.6, 117.5, 0.2], [21.9, 114.6, 0.15],
  [18.0, 113.0], [12.0, 110.6], [7.5, 106.8], [4.0, 105.6], [2.0, 104.9, 0.1],
];
/** East to west, past Singapore. */
const SINGAPORE_STRAIT: P[] = [[1.27, 104.35, 0.02], [1.2, 103.95, 0.02], [1.17, 103.65, 0.02]];
const MALACCA_SRI_LANKA: P[] = [
  [1.3, 103.2, 0.04], [1.85, 102.3, 0.05], [2.95, 100.9, 0.08], [4.3, 99.7, 0.1], [5.6, 98.3, 0.15], [6.3, 95.0, 0.1],
  [5.9, 88.0], [5.5, 81.0, 0.15], [5.6, 80.3, 0.1],
];
const SRI_LANKA_ADEN: P[] = [[7.7, 73.5, 0.1], [10.5, 64.0], [13.3, 53.5, 0.2], [12.6, 49.0, 0.2], [12.35, 45.8, 0.1]];
const RED_SEA_SUEZ: P[] = [
  [12.55, 43.3, 0.03], [13.4, 42.8, 0.05], [15.0, 41.7, 0.1], [18.0, 40.0, 0.2], [21.0, 38.4, 0.2], [24.2, 36.4, 0.15],
  [26.6, 34.8, 0.1], [27.65, 34.12, 0.03], [28.4, 33.35, 0.04], [29.2, 32.8, 0.02], [29.85, 32.57, 0.01],
  [30.3, 32.38, 0.004], [30.6, 32.32, 0.003], [31.0, 32.31, 0.003], [31.3, 32.32, 0.003], [31.55, 32.4, 0.03],
];
const MEDITERRANEAN: P[] = [
  [32.5, 29.0], [34.2, 25.0, 0.2], [35.3, 18.0], [35.6, 14.9, 0.15], [37.35, 11.4, 0.08], [37.8, 9.6, 0.1],
  [37.6, 6.0, 0.15], [37.2, 1.5], [36.3, -2.0, 0.1], [36.0, -4.0, 0.08], [35.97, -5.5, 0.02], [35.92, -6.2, 0.04],
];
const IBERIA_USHANT: P[] = [
  [36.6, -9.3, 0.1], [38.7, -9.9, 0.1], [41.5, -9.6, 0.12], [43.3, -9.9, 0.08], [46.0, -7.5], [48.3, -5.8, 0.1],
];
const ROTTERDAM: P[] = [[51.9, 3.6, 0.05], [51.98, 4.02, 0.01]];
const NEW_YORK: P[] = [[40.45, -73.85, 0.01], [40.3, -73.0, 0.05]];
const ATLANTIC: P[] = [[40.3, -69.0, 0.2], [41.6, -55.0, 0.4], [44.5, -40.0, 0.5], [48.0, -20.0, 0.5], [49.4, -7.5, 0.2]];
const LA_APPROACH: P[] = [[32.95, -117.85, 0.03], [33.55, -118.15, 0.02], [33.7, -118.22, 0.005]];
const PACIFIC_SOUTH_OF_JAPAN: P[] = [
  [31.0, 122.7, 0.1], [30.4, 127.0, 0.2], [30.0, 131.5, 0.1], [32.6, 136.0, 0.15], [34.0, 140.6, 0.15],
  [38.0, 150.0, 0.4], [44.0, 165.0, 0.5], [47.0, 179.0, 0.4], [46.5, -165.0, 0.5], [43.0, -147.0, 0.5],
  [37.5, -130.0, 0.4], [33.5, -124.0, 0.3], [32.5, -118.6, 0.08], ...LA_APPROACH,
];
const PACIFIC_NORTH: P[] = [
  [35.0, 129.15, 0.03], [35.6, 130.2, 0.1], [38.5, 134.5, 0.3], [41.0, 139.2, 0.1], [41.33, 140.27, 0.02], [41.66, 140.75, 0.02],
  [41.6, 141.4, 0.03], [41.6, 142.0, 0.1], [45.0, 155.0, 0.5], [50.0, 178.0, 0.5], [50.5, -170.0, 0.5], [50.0, -150.0, 0.5],
  [48.6, -128.0, 0.3], [48.48, -124.8, 0.03], [48.25, -123.8, 0.03], [48.25, -123.35, 0.02],
];
const NEW_YORK_COLON: P[] = [
  ...NEW_YORK, [39.5, -73.0, 0.1], [35.0, -74.6, 0.2], [29.0, -74.8, 0.3], [23.6, -74.0, 0.08], [22.3, -73.6, 0.05],
  [21.0, -73.95, 0.04], [20.0, -73.85, 0.04], [18.2, -75.4, 0.08], [12.5, -78.5, 0.3], [9.5, -79.9, 0.03],
];
const PANAMA_CANAL: P[] = [[9.35, -79.91, 0.003], [9.15, -79.85, 0.005], [9.04, -79.66, 0.003], [8.95, -79.57, 0.003], [8.8, -79.5, 0.02]];
const BALBOA_LA: P[] = [
  [7.9, -79.4, 0.05], [7.2, -79.8, 0.05], [7.0, -82.0, 0.2], [8.0, -86.0, 0.3], [12.0, -91.0, 0.4], [15.5, -98.0, 0.3],
  [18.0, -104.0, 0.3], [21.8, -109.5, 0.2], [24.0, -112.5, 0.2], [27.3, -115.6, 0.2], [31.0, -117.6, 0.15], ...LA_APPROACH,
];
const CALLAO_BALBOA: P[] = [[-12.05, -77.2, 0.03], [-8.0, -80.5, 0.3], [-1.0, -81.7, 0.3], [4.0, -80.2, 0.3], [7.2, -79.8, 0.05], [7.9, -79.4, 0.05]];
const HOUSTON_NEW_YORK: P[] = [
  [29.35, -94.7, 0.02], [28.5, -93.5, 0.2], [25.8, -86.0, 0.3], [24.0, -83.0, 0.1], [23.8, -81.0, 0.08], [24.6, -79.8, 0.06],
  [26.5, -79.75, 0.05], [28.5, -79.7, 0.1], [31.5, -79.5, 0.2], [34.5, -75.3, 0.15], [38.0, -74.2, 0.15], [40.3, -73.6, 0.05], [40.45, -73.85, 0.01],
];
/** From Biscay round Africa to the tip of Sumatra. */
const CAPE_ROUTE: P[] = [
  [32.0, -13.0, 0.3], [28.5, -19.0, 0.3], [20.0, -19.5, 0.4], [12.0, -19.0, 0.4], [3.0, -10.0, 0.5], [-8.0, 2.0, 0.5],
  [-20.0, 9.0, 0.5], [-30.0, 13.5, 0.4], [-35.3, 18.4, 0.15], [-36.2, 21.0, 0.15], [-35.5, 27.0, 0.3], [-28.5, 46.0, 0.4],
  [-20.0, 65.0, 0.5], [-8.0, 82.0, 0.5], [2.5, 93.5, 0.4], [6.3, 95.0, 0.1],
];
const SANTOS_CAPE: P[] = [[-24.05, -46.3, 0.02], [-25.0, -44.0, 0.2], [-30.0, -20.0, 0.6], [-35.3, 18.4, 0.15]];
const GULF_OUT: P[] = [
  [26.65, 50.25, 0.02], [26.9, 52.0, 0.1], [26.1, 54.0, 0.08], [26.05, 55.6, 0.05], [26.62, 56.25, 0.02], [26.45, 56.7, 0.03],
  [25.4, 57.4, 0.08], [23.8, 59.6, 0.15], [21.0, 62.5, 0.4],
];
const MUMBAI: P[] = [[20.5, 66.0, 0.4], [18.85, 72.65, 0.03]];
const PORT_HEDLAND_SHANGHAI: P[] = [
  [-20.15, 118.55, 0.02], [-18.5, 117.5, 0.2], [-10.5, 115.8, 0.2], [-8.85, 115.82, 0.02], [-8.3, 115.85, 0.02], [-7.3, 116.5, 0.05],
  [-4.5, 117.8, 0.15], [-1.5, 118.0, 0.15], [1.5, 119.6, 0.15], [4.0, 121.5, 0.3], [5.2, 126.0, 0.06], [10.0, 127.5, 0.3],
  [18.0, 124.0, 0.3], [21.4, 122.5, 0.15], [21.65, 120.4, 0.06], [22.8, 119.0, 0.15], [24.4, 119.3, 0.2], [26.0, 120.6, 0.15],
  [29.5, 123.2], [31.0, 122.7, 0.1],
];
const PIRAEUS_SICILY: P[] = [
  [37.92, 23.6, 0.01], [37.6, 23.6, 0.04], [36.75, 23.75, 0.06], [35.98, 23.1, 0.02], [36.0, 22.2, 0.15], [35.6, 18.0], [37.35, 11.4, 0.08],
];
const PIRAEUS_NOVOROSSIYSK: P[] = [
  [37.92, 23.6, 0.01], [37.7, 24.15, 0.03], [38.05, 24.65, 0.03], [39.5, 25.6, 0.1], [40.02, 26.2, 0.02], [40.15, 26.4, 0.01],
  [40.42, 26.68, 0.01], [40.75, 28.0, 0.08], [41.0, 28.98, 0.01], [41.1, 29.06, 0.005], [41.22, 29.12, 0.01], [42.5, 31.0, 0.3],
  [44.0, 35.5, 0.2], [44.6, 37.75, 0.02],
];
const ROTTERDAM_ST_PETERSBURG: P[] = [
  [51.98, 4.02, 0.01], [52.3, 3.9, 0.08], [54.0, 4.5, 0.2], [56.5, 6.5, 0.2], [57.8, 9.0, 0.1], [57.9, 10.9, 0.05], [57.0, 11.3, 0.05],
  [56.0, 12.65, 0.01], [55.3, 12.9, 0.03], [55.0, 14.0, 0.08], [55.3, 15.8, 0.1], [57.0, 19.9, 0.2], [59.4, 22.0, 0.1],
  [59.8, 25.0, 0.08], [59.95, 28.5, 0.05], [59.95, 29.3, 0.01],
];

/** The Channel's own separation scheme: north-east bound on the French side, south-west bound on the English. */
const [channelEast, channelWest] = englishChannel.shippingLanes.map((l) => l.points.map((p): P => [p.lat, p.lon, 0.03])) as [P[], P[]];

/** Both directions of a lane, weighted by its length and how busy it is. */
function lane(name: string, busy: number, forward: P[], back: P[] = rev(forward)): Route[] {
  return [
    { name, points: pts(forward), weight: busy * lengthKm(forward) },
    { name: `${name} (return)`, points: pts(back), weight: busy * lengthKm(back) },
  ];
}

function lengthKm(list: P[]): number {
  let m = 0;
  for (let i = 1; i < list.length; i++) m += distanceM(toLatLon(list[i - 1]!), toLatLon(list[i]!));
  return m / 1000;
}

const toLatLon = ([lat, lon]: P): LatLon => ({ lat, lon });

const toEurope = (from: P[]): P[] => [...from, ...IBERIA_USHANT, ...channelEast, ...ROTTERDAM];
const fromEurope = (to: P[]): P[] => [...rev(ROTTERDAM), ...channelWest, ...rev(IBERIA_USHANT), ...to];

const ASIA_TO_SUEZ: P[] = [...CHINA_SEA, ...SINGAPORE_STRAIT, ...MALACCA_SRI_LANKA, ...SRI_LANKA_ADEN, ...RED_SEA_SUEZ, ...MEDITERRANEAN];
const GULF_TO_SUEZ: P[] = [...GULF_OUT, ...SRI_LANKA_ADEN.slice(2), ...RED_SEA_SUEZ, ...MEDITERRANEAN];
/** Up the Malacca Strait from the tip of Sumatra (where CAPE_ROUTE ends) to Singapore. */
const MALACCA_NORTHBOUND: P[] = rev(MALACCA_SRI_LANKA).slice(4);
const CAPE_TO_SINGAPORE: P[] = [...CAPE_ROUTE, ...MALACCA_NORTHBOUND, ...rev(SINGAPORE_STRAIT)];
const GULF_TO_ASIA: P[] = [...GULF_OUT, [14.0, 66.0, 0.4], [7.7, 73.5, 0.1], ...rev(MALACCA_SRI_LANKA), ...rev(SINGAPORE_STRAIT), ...rev(CHINA_SEA)];
/** From Santos, joining the Cape route south of Cape Agulhas, on to Shanghai. */
const BRAZIL_TO_CHINA: P[] = [
  ...SANTOS_CAPE,
  ...CAPE_ROUTE.slice(CAPE_ROUTE.findIndex(([lat, lon]) => lat === -35.3 && lon === 18.4) + 1),
  ...MALACCA_NORTHBOUND,
  ...rev(SINGAPORE_STRAIT),
  ...rev(CHINA_SEA),
];

const shippingLanes: Route[] = [
  // The Channel's own lanes, busy in their own right.
  ...englishChannel.shippingLanes.map((l) => ({ ...l, weight: 12 * lengthKm(l.points.map((p): P => [p.lat, p.lon])) })),
  ...lane('Asia - Europe via Suez', 3, toEurope(ASIA_TO_SUEZ), fromEurope(rev(ASIA_TO_SUEZ))),
  ...lane('Gulf - Europe via Suez', 1.5, toEurope(GULF_TO_SUEZ), fromEurope(rev(GULF_TO_SUEZ))),
  ...lane('Europe - Asia round the Cape', 1, fromEurope(CAPE_TO_SINGAPORE), toEurope(rev(CAPE_TO_SINGAPORE))),
  ...lane('Gulf - East Asia', 2.5, GULF_TO_ASIA),
  ...lane('Gulf - India', 1.5, [...GULF_OUT, ...MUMBAI]),
  ...lane('North Atlantic', 2, [...NEW_YORK, ...ATLANTIC, ...channelEast, ...ROTTERDAM], [...rev(ROTTERDAM), ...channelWest, ...rev(ATLANTIC), ...rev(NEW_YORK)]),
  ...lane('Trans-Pacific', 2.5, PACIFIC_SOUTH_OF_JAPAN),
  ...lane('North Pacific', 1.5, PACIFIC_NORTH),
  ...lane('New York - Panama - Los Angeles', 1.5, [...NEW_YORK_COLON, ...PANAMA_CANAL, ...BALBOA_LA]),
  ...lane('Callao - Panama - New York', 1, [...CALLAO_BALBOA, ...rev(PANAMA_CANAL), ...rev(NEW_YORK_COLON)]),
  ...lane('Gulf of Mexico - New York', 2, HOUSTON_NEW_YORK),
  ...lane('Brazil - China', 1, BRAZIL_TO_CHINA),
  ...lane('Australia - China', 2, PORT_HEDLAND_SHANGHAI),
  ...lane('Mediterranean', 2, [...PIRAEUS_SICILY, ...MEDITERRANEAN.slice(5)]),
  ...lane('Aegean - Black Sea', 2, PIRAEUS_NOVOROSSIYSK),
  ...lane('North Sea - Baltic', 2.5, ROTTERDAM_ST_PETERSBURG),
];

/** Fishing grounds, each wholly at sea. */
const fishingAreas = [
  { south: 54.5, west: 2.0, north: 57.0, east: 6.0 }, // North Sea
  { south: 43.5, west: -52.0, north: 46.5, east: -48.5 }, // Grand Banks
  { south: -14.0, west: -82.0, north: -8.0, east: -80.0 }, // off Peru
  { south: -47.0, west: -62.0, north: -42.0, east: -59.0 }, // Patagonian shelf
  { south: 28.0, west: 123.0, north: 32.0, east: 126.0 }, // East China Sea
  { south: 34.0, west: 122.5, north: 36.5, east: 124.5 }, // Yellow Sea
  { south: 17.0, west: -19.0, north: 21.0, east: -17.3 }, // off Mauritania
  { south: 66.8, west: 9.5, north: 68.0, east: 12.0 }, // off Lofoten
  { south: 56.0, west: -175.0, north: 59.0, east: -168.0 }, // Bering Sea
  { south: 15.0, west: 70.0, north: 20.0, east: 72.0 }, // off western India
  { south: 8.5, west: 100.5, north: 11.0, east: 102.5 }, // Gulf of Thailand
  { south: 9.0, west: 109.5, north: 12.0, east: 111.0 }, // off Vietnam
  { south: 37.0, west: 142.5, north: 40.0, east: 144.0 }, // off north-east Japan
  { south: 63.0, west: -27.0, north: 65.5, east: -24.5 }, // off Iceland
];

export const world: Scenario = {
  id: 'world',
  name: 'World',
  center: { lat: 30, lon: -15 },
  zoom: 1.6,
  bounds: { south: -85, west: -180, north: 85, east: 180 },
  airports: HUBS.map(([code, lat, lon, weight]): Airport => ({ code, lat, lon, weight })),

  shippingLanes,
  ferryRoutes: englishChannel.ferryRoutes,
  fishingAreas: [...englishChannel.fishingAreas, ...fishingAreas],
  leisureAreas: englishChannel.leisureAreas,
  navalPatrolAreas: englishChannel.navalPatrolAreas,
  helicopterAreas: englishChannel.helicopterAreas,
  lightAircraftAreas: englishChannel.lightAircraftAreas,
  patrolRacetracks: englishChannel.patrolRacetracks,
  uavOrbits: englishChannel.uavOrbits,

  population: {
    airliner: 2400,
    'light-aircraft': 4,
    helicopter: 2,
    'military-helicopter': 1,
    'maritime-patrol': 1,
    uav: 1,
    cargo: 1000,
    tanker: 450,
    ferry: 6,
    fishing: 250,
    leisure: 8,
    warship: 2,
  },
};
