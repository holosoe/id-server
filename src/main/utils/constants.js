export const frontendOrigin = process.env.FRONT_END_ORIGIN;

export const dummyUserCreds = {
  firstName: "",
  lastName: "",
  middleInitial: "",
  countryCode: "",
  streetAddr1: "",
  streetAddr2: "",
  city: "",
  subdivision: "",
  postalCode: "",
  completedAt: "",
  birthdate: "",
};

export const stateAbbreviations = {
  ALABAMA: "AL",
  ALASKA: "AK",
  "AMERICAN SAMOA": "AS",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  "FEDERATED STATES OF MICRONESIA": "FM",
  FLORIDA: "FL",
  GEORGIA: "GA",
  GUAM: "GU",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  "MARSHALL ISLANDS": "MH",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  "NORTHERN MARIANA ISLANDS": "MP",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PALAU: "PW",
  PENNSYLVANIA: "PA",
  "PUERTO RICO": "PR",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  "VIRGIN ISLANDS": "VI",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

const primes = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79,
  83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
  173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263,
  269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367,
  373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463,
  467, 479, 487, 491, 499, 503, 509, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587,
  593, 599, 601, 607, 613, 617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683,
  691, 701, 709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809, 811,
  821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 907, 911, 919, 929,
  937, 941, 947, 953, 967, 971, 977, 983, 991, 997, 1009, 1013, 1019, 1021, 1031, 1033,
  1039, 1049, 1051, 1061, 1063, 1069, 1087, 1091, 1093, 1097, 1103, 1109, 1117, 1123,
  1129, 1151, 1153, 1163, 1171, 1181, 1187, 1193, 1201, 1213, 1217, 1223, 1229, 1231,
  1237, 1249, 1259, 1277, 1279, 1283, 1289, 1291, 1297, 1301, 1303, 1307, 1319, 1321,
  1327, 1361, 1367, 1373, 1381, 1399, 1409, 1423, 1427, 1429, 1433, 1439, 1447, 1451,
  1453, 1459, 1471, 1481, 1483, 1487, 1489, 1493, 1499, 1511, 1523, 1531, 1543, 1549,
  1553, 1559, 1567, 1571, 1579,
];

export const countryCodeToPrime = {
  AF: 2, // Afghanistan
  AL: 5, // Albania
  DZ: 7, // Algeria
  AD: 13, // Andorra
  AO: 17, // Angola
  AG: 29, // Antigua and Barbuda
  AR: 31, // Argentina
  AM: 37, // Armenia
  AU: 43, // Australia
  AT: 47, // Austria
  AZ: 53, // Azerbaijan
  BS: 59, // Bahamas
  BH: 61, // Bahrain
  BD: 67, // Bangladesh
  BB: 71, // Barbados
  BY: 73, // Belarus
  BE: 79, // Belgium
  BZ: 83, // Belize
  BJ: 89, // Benin
  BT: 101, // Bhutan
  BO: 103, // "Bolivia, Plurinational State of"
  BA: 107, // Bosnia and Herzegovina
  BW: 109, // Botswana
  BR: 127, // Brazil
  BN: 137, // Brunei Darussalam
  BG: 139, // Bulgaria
  BF: 149, // Burkina Faso
  BI: 151, // Burundi
  KH: 157, // Cambodia
  CM: 163, // Cameroon
  CA: 167, // Canada
  CV: 173, // Cape Verde
  CF: 181, // Central African Republic
  TD: 191, // Chad
  CL: 193, // Chile
  CN: 197, // China
  CO: 223, // Colombia
  KM: 227, // Comoros
  CG: 229, // Congo
  CD: 233, // "Congo, the Democratic Republic of the",
  CR: 241, // Costa Rica
  CI: 251, // Côte d'Ivoire
  HR: 257, // Croatia
  CU: 263, // Cuba
  CY: 269, // Cyprus
  CZ: 271, // Czech Republic
  DK: 277, // Denmark
  DJ: 281, // Djibouti
  DM: 283, // Dominica
  DO: 293, // Dominican Republic
  EC: 307, // Ecuador
  EG: 311, // Egypt
  SV: 313, // El Salvador
  GQ: 317, // Equatorial Guinea
  ER: 10000, // Eritrea
  EE: 10000, // Estonia
  SZ: 10000, // Eswatini, Kingdom of // (formerly Swaziland)
  ET: 10000, // Ethiopia
  FJ: 10000, // Fiji
  FI: 10000, // Finland
  FR: 10000, // France
  GA: 10000, // Gabon
  GM: 10000, // Gambia
  GE: 10000, // Georgia
  DE: 10000, // Germany
  GH: 10000, // Ghana
  GR: 10000, // Greece
  GD: 10000, // Grenada
  GT: 10000, // Guatemala
  GN: 10000, // Guinea
  GW: 10000, // Guinea-Bissau
  GY: 10000, // Guyana
  HT: 10000, // Haiti
  HN: 10000, // Honduras
  // HK: 10000, // Hong Kong
  HU: 10000, // Hungary
  IS: 10000, // Iceland
  IN: 10000, // India
  ID: 10000, // Indonesia
  IR: 10000, // "Iran, Islamic Republic of"
  IQ: 10000, // Iraq
  IE: 10000, // Ireland
  IL: 10000, // Israel
  IT: 10000, // Italy
  JM: 10000, // Jamaica
  JP: 10000, // Japan
  JO: 10000, // Jordan
  KZ: 10000, // Kazakhstan
  KE: 10000, // Kenya
  KI: 10000, // Kiribati
  KP: 10000, // "Korea, Democratic People's Republic of"
  KR: 10000, // "Korea, Republic of"
  KW: 10000, // Kuwait
  KG: 10000, // Kyrgyzstan
  LA: 10000, // Lao People's Democratic Republic
  LV: 10000, // Latvia
  LB: 10000, // Lebanon
  LS: 10000, // Lesotho
  LR: 10000, // Liberia
  LY: 10000, // Libya // (formerly Libyan Arab Jamahiriya)
  LI: 10000, // Liechtenstein
  LT: 10000, // Lithuania
  LU: 10000, // Luxembourg
  MK: 10000, // North Macedonia // (formerly "Macedonia, the former Yugoslav Republic of")
  MG: 10000, // Madagascar
  MW: 10000, // Malawi
  MY: 10000, // Malaysia
  MV: 10000, // Maldives
  ML: 10000, // Mali
  MT: 10000, // Malta
  MH: 10000, // Marshall Islands
  MR: 10000, // Mauritania
  MU: 10000, // Mauritius
  MX: 10000, // Mexico
  FM: 10000, // "Micronesia, Federated States of"
  MD: 10000, // "Moldova, Republic of",
  MC: 10000, // Monaco
  MN: 10000, // Mongolia
  ME: 10000, // Montenegro
  MA: 10000, // Morocco
  MZ: 10000, // Mozambique
  MM: 10000, // Myanmar
  NA: 10000, // Namibia
  NR: 10000, // Nauru
  NP: 10000, // Nepal
  NL: 10000, // Netherlands
  NZ: 10000, // New Zealand
  NI: 10000, // Nicaragua
  NE: 10000, // Niger
  NG: 10000, // Nigeria
  NO: 10000, // Norway
  OM: 10000, // Oman
  PK: 10000, // Pakistan
  PW: 10000, // Palau
  PA: 10000, // Panama
  PG: 10000, // Papua New Guinea
  PY: 10000, // Paraguay
  PE: 10000, // Peru
  PH: 10000, // Philippines
  PL: 10000, // Poland
  PT: 10000, // Portugal
  // PR: 10000, // Puerto Rico
  QA: 10000, // Qatar
  RO: 10000, // Romania
  RU: 10000, // Russian Federation
  RW: 10000, // Rwanda
  KN: 10000, // Saint Kitts and Nevis
  LC: 10000, // Saint Lucia
  VC: 10000, // Saint Vincent and the Grenadines
  WS: 10000, // Samoa
  SM: 10000, // San Marino
  ST: 10000, // Sao Tome and Principe
  SA: 10000, // Saudi Arabia
  SN: 10000, // Senegal
  RS: 10000, // Serbia
  SC: 10000, // Seychelles
  SL: 10000, // Sierra Leone
  SG: 10000, // Singapore
  SK: 10000, // Slovakia
  SI: 10000, // Slovenia
  SB: 10000, // Solomon Islands
  SO: 10000, // Somalia
  ZA: 10000, // South Africa
  // TODO: South Sudan?
  ES: 10000, // Spain
  LK: 10000, // Sri Lanka,
  SD: 10000, // Sudan,
  SR: 10000, // Suriname,
  SE: 10000, // Sweden,
  CH: 10000, // Switzerland,
  SY: 10000, // Syrian Arab Republic,
  // TW: 10000, // "Taiwan, Province of China",
  TJ: 10000, // Tajikistan,
  TZ: 10000, // "Tanzania, United Republic of",
  TH: 10000, // Thailand,
  TL: 10000, // Timor-Leste,
  TG: 10000, // Togo,
  TO: 10000, // Tonga,
  TT: 10000, // Trinidad and Tobago,
  TN: 10000, // Tunisia,
  TR: 10000, // Türkiye,
  TM: 10000, // Turkmenistan,
  TV: 10000, // Tuvalu,
  UG: 10000, // Uganda,
  UA: 10000, // Ukraine,
  AE: 10000, // United Arab Emirates,
  GB: 10000, // United Kingdom,
  US: 10000, // United States,
  UY: 10000, // Uruguay,
  UZ: 10000, // Uzbekistan,
  VU: 10000, // Vanuatu,
  VE: 10000, // "Venezuela, Bolivarian Republic of",
  VN: 10000, // Viet Nam,
  YE: 10000, // Yemen,
  ZM: 10000, // Zambia,
  ZW: 10000, // Zimbabwe
};
