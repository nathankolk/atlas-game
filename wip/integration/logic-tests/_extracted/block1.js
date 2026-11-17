
(function(){
  'use strict';

  /* =========================================================
   * CONTINENT MAPPING
   * Keys are canonical country names. We also include a set of
   * aliases to match against various naming conventions in
   * world-atlas TopoJSON data.
   * ========================================================= */

  const CONTINENTS = {
    'Africa': [
      'Algeria','Angola','Benin','Botswana','Burkina Faso','Burundi','Cameroon',
      'Cape Verde','Central African Republic','Chad','Comoros',
      'Democratic Republic of the Congo','Republic of the Congo','Djibouti','Egypt',
      'Equatorial Guinea','Eritrea','Eswatini','Ethiopia','Gabon','Gambia','Ghana',
      'Guinea','Guinea-Bissau','Ivory Coast','Kenya','Lesotho','Liberia','Libya',
      'Madagascar','Malawi','Mali','Mauritania','Mauritius','Morocco','Mozambique',
      'Namibia','Niger','Nigeria','Rwanda','Senegal','Sierra Leone','Somalia',
      'South Africa','South Sudan','Sudan','Tanzania','Togo','Tunisia','Uganda',
      'Western Sahara','Zambia','Zimbabwe','Somaliland'
    ],
    'Asia': [
      'Afghanistan','Armenia','Azerbaijan','Bahrain','Bangladesh','Bhutan','Brunei',
      'Cambodia','China','Cyprus','Georgia','India','Indonesia','Iran','Iraq',
      'Israel','Japan','Jordan','Kazakhstan','Kuwait','Kyrgyzstan','Laos','Lebanon',
      'Malaysia','Mongolia','Myanmar','Nepal','North Korea','Oman','Pakistan',
      'Palestine','Philippines','Qatar','Saudi Arabia','South Korea','Sri Lanka',
      'Syria','Taiwan','Tajikistan','Thailand','Timor-Leste','Turkey','Turkmenistan',
      'United Arab Emirates','Uzbekistan','Vietnam','Yemen','Northern Cyprus'
    ],
    'Europe': [
      'Albania','Austria','Belarus','Belgium','Bosnia and Herzegovina','Bulgaria',
      'Croatia','Czech Republic','Denmark','Estonia','Finland','France','Germany',
      'Greece','Hungary','Iceland','Ireland','Italy','Kosovo','Latvia','Lithuania',
      'Luxembourg','Moldova','Montenegro','Netherlands','North Macedonia','Norway',
      'Poland','Portugal','Romania','Russia','Serbia','Slovakia','Slovenia','Spain',
      'Sweden','Switzerland','Ukraine','United Kingdom'
    ],
    'North America': [
      'Antigua and Barbuda','Bahamas','Barbados','Belize','Canada','Costa Rica','Cuba',
      'Dominica','Dominican Republic','El Salvador','Grenada','Guatemala','Haiti',
      'Honduras','Jamaica','Mexico','Nicaragua','Panama','Saint Kitts and Nevis',
      'Saint Lucia','Saint Vincent and the Grenadines','Trinidad and Tobago',
      'United States'
    ],
    'South America': [
      'Argentina','Bolivia','Brazil','Chile','Colombia','Ecuador','Falkland Islands',
      'French Guiana','Guyana','Paraguay','Peru','Suriname','Uruguay','Venezuela'
    ],
    'Oceania': [
      'Australia','Fiji','New Caledonia','New Zealand','Papua New Guinea',
      'Solomon Islands','Vanuatu'
    ]
  };

  // The continents in the order menus and level lists show them
  const CONTINENT_ORDER = ['Africa','Asia','Europe','North America','South America','Oceania'];

  // Aliases: map various TopoJSON names to canonical names used above.
  // Keys are lowercased alternative names.
  const NAME_ALIASES = {
    'united states of america': 'United States',
    'usa': 'United States',
    'us': 'United States',
    'dem. rep. congo': 'Democratic Republic of the Congo',
    'democratic republic of the congo': 'Democratic Republic of the Congo',
    'dr congo': 'Democratic Republic of the Congo',
    'congo': 'Republic of the Congo',
    'republic of the congo': 'Republic of the Congo',
    'central african rep.': 'Central African Republic',
    'central african republic': 'Central African Republic',
    'eq. guinea': 'Equatorial Guinea',
    'equatorial guinea': 'Equatorial Guinea',
    'w. sahara': 'Western Sahara',
    'western sahara': 'Western Sahara',
    's. sudan': 'South Sudan',
    'south sudan': 'South Sudan',
    'côte d\'ivoire': 'Ivory Coast',
    "cote d'ivoire": 'Ivory Coast',
    'ivory coast': 'Ivory Coast',
    'czechia': 'Czech Republic',
    'czech republic': 'Czech Republic',
    'macedonia': 'North Macedonia',
    'north macedonia': 'North Macedonia',
    'republic of macedonia': 'North Macedonia',
    'bosnia and herz.': 'Bosnia and Herzegovina',
    'bosnia and herzegovina': 'Bosnia and Herzegovina',
    'dominican rep.': 'Dominican Republic',
    'dominican republic': 'Dominican Republic',
    'eswatini': 'Eswatini',
    'swaziland': 'Eswatini',
    'east timor': 'Timor-Leste',
    'timor-leste': 'Timor-Leste',
    'myanmar': 'Myanmar',
    'burma': 'Myanmar',
    'solomon is.': 'Solomon Islands',
    'solomon islands': 'Solomon Islands',
    'falkland is.': 'Falkland Islands',
    'falkland islands': 'Falkland Islands',
    'fr. s. antarctic lands': 'French Southern Territories',
    'new caledonia': 'New Caledonia',
    'papua new guinea': 'Papua New Guinea',
    'n. cyprus': 'Northern Cyprus',
    'northern cyprus': 'Northern Cyprus',
    'somaliland': 'Somaliland',
    'russia': 'Russia',
    'russian federation': 'Russia',
    'south korea': 'South Korea',
    'republic of korea': 'South Korea',
    'korea, south': 'South Korea',
    'north korea': 'North Korea',
    "dem. people's rep. korea": 'North Korea',
    "democratic people's republic of korea": 'North Korea',
    'iran': 'Iran',
    'iran (islamic republic of)': 'Iran',
    'syria': 'Syria',
    'syrian arab republic': 'Syria',
    'laos': 'Laos',
    "lao people's democratic republic": 'Laos',
    'vietnam': 'Vietnam',
    'viet nam': 'Vietnam',
    'cape verde': 'Cape Verde',
    'cabo verde': 'Cape Verde',
    'tanzania': 'Tanzania',
    'united republic of tanzania': 'Tanzania',
    'moldova': 'Moldova',
    'republic of moldova': 'Moldova',
    'brunei': 'Brunei',
    'brunei darussalam': 'Brunei',
    'palestine': 'Palestine',
    'palestinian territory': 'Palestine',
    'state of palestine': 'Palestine',
    'venezuela': 'Venezuela',
    'venezuela (bolivarian republic of)': 'Venezuela',
    'bolivia': 'Bolivia',
    'bolivia (plurinational state of)': 'Bolivia',
    'fiji': 'Fiji',
    // Caribbean nations - Natural Earth data often uses abbreviated names
    'antigua and barb.': 'Antigua and Barbuda',
    'antigua and barbuda': 'Antigua and Barbuda',
    'st. kitts and nevis': 'Saint Kitts and Nevis',
    'saint kitts and nevis': 'Saint Kitts and Nevis',
    'st. lucia': 'Saint Lucia',
    'saint lucia': 'Saint Lucia',
    'st. vin. and gren.': 'Saint Vincent and the Grenadines',
    'st. vincent and the grenadines': 'Saint Vincent and the Grenadines',
    'saint vincent and the grenadines': 'Saint Vincent and the Grenadines',
    'trinidad and tobago': 'Trinidad and Tobago',
  };

  // Build name -> continent lookup
  const NAME_TO_CONTINENT = {};
  Object.keys(CONTINENTS).forEach(continent => {
    CONTINENTS[continent].forEach(name => {
      NAME_TO_CONTINENT[name.toLowerCase()] = continent;
    });
  });

  function canonicalize(rawName) {
    if (!rawName) return null;
    const lower = rawName.toLowerCase().trim();
    if (NAME_ALIASES[lower]) return NAME_ALIASES[lower];
    // Capitalize-style match
    for (const continent of Object.keys(CONTINENTS)) {
      for (const canonical of CONTINENTS[continent]) {
        if (canonical.toLowerCase() === lower) return canonical;
      }
    }
    return rawName; // fallback to raw
  }

  function getContinent(canonicalName) {
    if (!canonicalName) return null;
    return NAME_TO_CONTINENT[canonicalName.toLowerCase()] || null;
  }

  /* =========================================================
   * US STATES & CAPITALS DATA
   * ========================================================= */

  // Canonical list of 50 state names + their capitals. Kept in the
  // order: state -> capital. The game can build either direction
  // (state-by-capital or capital-by-state) from this single source.
  const US_CAPITALS = {
    'Alabama': 'Montgomery',
    'Alaska': 'Juneau',
    'Arizona': 'Phoenix',
    'Arkansas': 'Little Rock',
    'California': 'Sacramento',
    'Colorado': 'Denver',
    'Connecticut': 'Hartford',
    'Delaware': 'Dover',
    'Florida': 'Tallahassee',
    'Georgia': 'Atlanta',
    'Hawaii': 'Honolulu',
    'Idaho': 'Boise',
    'Illinois': 'Springfield',
    'Indiana': 'Indianapolis',
    'Iowa': 'Des Moines',
    'Kansas': 'Topeka',
    'Kentucky': 'Frankfort',
    'Louisiana': 'Baton Rouge',
    'Maine': 'Augusta',
    'Maryland': 'Annapolis',
    'Massachusetts': 'Boston',
    'Michigan': 'Lansing',
    'Minnesota': 'Saint Paul',
    'Mississippi': 'Jackson',
    'Missouri': 'Jefferson City',
    'Montana': 'Helena',
    'Nebraska': 'Lincoln',
    'Nevada': 'Carson City',
    'New Hampshire': 'Concord',
    'New Jersey': 'Trenton',
    'New Mexico': 'Santa Fe',
    'New York': 'Albany',
    'North Carolina': 'Raleigh',
    'North Dakota': 'Bismarck',
    'Ohio': 'Columbus',
    'Oklahoma': 'Oklahoma City',
    'Oregon': 'Salem',
    'Pennsylvania': 'Harrisburg',
    'Rhode Island': 'Providence',
    'South Carolina': 'Columbia',
    'South Dakota': 'Pierre',
    'Tennessee': 'Nashville',
    'Texas': 'Austin',
    'Utah': 'Salt Lake City',
    'Vermont': 'Montpelier',
    'Virginia': 'Richmond',
    'Washington': 'Olympia',
    'West Virginia': 'Charleston',
    'Wisconsin': 'Madison',
    'Wyoming': 'Cheyenne'
  };

  const US_STATE_NAMES = Object.keys(US_CAPITALS);
  const US_STATE_SET = new Set(US_STATE_NAMES);

  /* =========================================================
   * US CITIES BY REGION (us-city mode)
   *
   * Census's standard 4-region split. Each region has a curated list of
   * cities (mostly the largest by population, plus state capitals to
   * ensure every state in the region has at least one entry). Coords are
   * [longitude, latitude] — d3.geoAlbersUsa() consumes them in that order.
   *
   * Coords are sourced from training-data knowledge and are accurate to
   * within ~1km, which is far below the rendering tolerance at a regional
   * zoom level. If anything looks off when playing, open this file and
   * adjust — there's no external data source to keep in sync.
   *
   * Stage 1 ships Northeast only as the pilot. Midwest, South, and West
   * will land in a follow-up commit once the framework is verified.
   * ========================================================= */

  const US_REGION_STATES = {
    'Northeast': [
      'Maine', 'New Hampshire', 'Vermont', 'Massachusetts', 'Rhode Island',
      'Connecticut', 'New York', 'New Jersey', 'Pennsylvania'
    ],
    'Midwest': [
      'Ohio', 'Michigan', 'Indiana', 'Illinois', 'Wisconsin', 'Minnesota',
      'Iowa', 'Missouri', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas'
    ],
    'South': [
      'Delaware', 'Maryland', 'Virginia', 'West Virginia', 'North Carolina',
      'South Carolina', 'Georgia', 'Florida', 'Kentucky', 'Tennessee',
      'Alabama', 'Mississippi', 'Arkansas', 'Louisiana', 'Oklahoma', 'Texas'
    ],
    'West': [
      'Montana', 'Wyoming', 'Colorado', 'New Mexico', 'Idaho', 'Utah',
      'Arizona', 'Nevada', 'Washington', 'Oregon', 'California', 'Alaska', 'Hawaii'
    ]
  };

  const US_CITIES_BY_REGION = {
    'Northeast': [
      // New York (6)
      { name: 'New York',     state: 'New York',       coords: [-74.0060, 40.7128] },
      { name: 'Buffalo',      state: 'New York',       coords: [-78.8784, 42.8864] },
      { name: 'Rochester',    state: 'New York',       coords: [-77.6088, 43.1566] },
      { name: 'Syracuse',     state: 'New York',       coords: [-76.1474, 43.0481] },
      { name: 'Albany',       state: 'New York',       coords: [-73.7562, 42.6526] },
      { name: 'Yonkers',      state: 'New York',       coords: [-73.8987, 40.9312] },
      // Pennsylvania (8)
      { name: 'Philadelphia', state: 'Pennsylvania',   coords: [-75.1652, 39.9526] },
      { name: 'Pittsburgh',   state: 'Pennsylvania',   coords: [-79.9959, 40.4406] },
      { name: 'Allentown',    state: 'Pennsylvania',   coords: [-75.4714, 40.6084] },
      { name: 'Erie',         state: 'Pennsylvania',   coords: [-80.0851, 42.1292] },
      { name: 'Reading',      state: 'Pennsylvania',   coords: [-75.9269, 40.3357] },
      { name: 'Scranton',     state: 'Pennsylvania',   coords: [-75.6624, 41.4090] },
      { name: 'Lancaster',    state: 'Pennsylvania',   coords: [-76.3055, 40.0379] },
      { name: 'Harrisburg',   state: 'Pennsylvania',   coords: [-76.8867, 40.2732] },
      // Massachusetts (6)
      { name: 'Boston',       state: 'Massachusetts',  coords: [-71.0589, 42.3601] },
      { name: 'Worcester',    state: 'Massachusetts',  coords: [-71.8023, 42.2626] },
      { name: 'Springfield',  state: 'Massachusetts',  coords: [-72.5898, 42.1015] },
      { name: 'Cambridge',    state: 'Massachusetts',  coords: [-71.1097, 42.3736] },
      { name: 'Lowell',       state: 'Massachusetts',  coords: [-71.3162, 42.6334] },
      { name: 'New Bedford',  state: 'Massachusetts',  coords: [-70.9342, 41.6362] },
      // New Jersey (5)
      { name: 'Newark',       state: 'New Jersey',     coords: [-74.1724, 40.7357] },
      { name: 'Jersey City',  state: 'New Jersey',     coords: [-74.0431, 40.7178] },
      { name: 'Paterson',     state: 'New Jersey',     coords: [-74.1718, 40.9168] },
      { name: 'Elizabeth',    state: 'New Jersey',     coords: [-74.2107, 40.6640] },
      { name: 'Trenton',      state: 'New Jersey',     coords: [-74.7429, 40.2206] },
      // Connecticut (5)
      { name: 'Bridgeport',   state: 'Connecticut',    coords: [-73.1952, 41.1865] },
      { name: 'New Haven',    state: 'Connecticut',    coords: [-72.9279, 41.3083] },
      { name: 'Hartford',     state: 'Connecticut',    coords: [-72.6851, 41.7637] },
      { name: 'Stamford',     state: 'Connecticut',    coords: [-73.5387, 41.0534] },
      { name: 'Waterbury',    state: 'Connecticut',    coords: [-73.0407, 41.5582] },
      // Rhode Island (2)
      { name: 'Providence',   state: 'Rhode Island',   coords: [-71.4128, 41.8240] },
      { name: 'Warwick',      state: 'Rhode Island',   coords: [-71.4162, 41.7001] },
      // New Hampshire (3)
      { name: 'Manchester',   state: 'New Hampshire',  coords: [-71.4548, 42.9956] },
      { name: 'Nashua',       state: 'New Hampshire',  coords: [-71.4673, 42.7654] },
      { name: 'Concord',      state: 'New Hampshire',  coords: [-71.5376, 43.2081] },
      // Maine (3)
      { name: 'Portland',     state: 'Maine',          coords: [-70.2553, 43.6591] },
      { name: 'Bangor',       state: 'Maine',          coords: [-68.7712, 44.8016] },
      { name: 'Augusta',      state: 'Maine',          coords: [-69.7795, 44.3106] },
      // Vermont (2)
      { name: 'Burlington',   state: 'Vermont',        coords: [-73.2121, 44.4759] },
      { name: 'Montpelier',   state: 'Vermont',        coords: [-72.5754, 44.2601] }
    ]
    // Midwest / South / West populated in Stage 2.
  };

  // A name is an item's identity: queues, focus lists and the mastery
  // store all key on it. Returns `name`, or "name, qualifier" if an earlier
  // item of the same kind already took it, and marks the result as taken.
  // The earlier item keeps the bare name, so its saved history stays its
  // own; list a newcomer that repeats a name after the one it repeats.
  function claimName(taken, name, qualifier) {
    const unique = taken.has(name) ? name + ', ' + qualifier : name;
    taken.add(unique);
    return unique;
  }

  // The four regions share one mastery skill, so a city repeating a name
  // from an earlier region (Springfield, Portland) is told apart by state
  (function () {
    const taken = new Set();
    Object.keys(US_CITIES_BY_REGION).forEach(region => {
      US_CITIES_BY_REGION[region].forEach(city => {
        city.name = claimName(taken, city.name, city.state);
      });
    });
  })();

  // Maps the data-region attribute on a menu card to the region label.
  // Lets startGame dispatch us-city mode from a single button click.
  const US_CITY_REGION_KEYS = {
    'northeast-cities': 'Northeast',
    'midwest-cities': 'Midwest',
    'south-cities': 'South',
    'west-cities': 'West'
  };

  /* =========================================================
   * PIN THE CITY (city-pin mode)
   *
   * A blank map (country borders, no names; Hard Mode hides the borders
   * too) and a city name: tap where it is, then Drop Pin. Points fall off
   * with distance (pinPoints). A round is every city of one continent, or
   * 20 drawn from all of them for World. Each city is
   * [name, country, lat, lon], checked against Natural Earth borders.
   *
   * Scores live in their own store ("atlas-pin", see PIN STORE), not in
   * atlas-records: these are points out of 100 per city, not found/missed.
   * ========================================================= */

  const PIN_CITIES = {
    'Africa': [
      ['Cairo', 'Egypt', 30.0444, 31.2357],
      ['Lagos', 'Nigeria', 6.5244, 3.3792],
      ['Kinshasa', 'DR Congo', -4.4419, 15.2663],
      ['Johannesburg', 'South Africa', -26.2041, 28.0473],
      ['Luanda', 'Angola', -8.839, 13.2894],
      ['Dar es Salaam', 'Tanzania', -6.7924, 39.2083],
      ['Khartoum', 'Sudan', 15.5007, 32.5599],
      ['Abidjan', 'Côte d\'Ivoire', 5.36, -4.0083],
      ['Alexandria', 'Egypt', 31.2001, 29.9187],
      ['Nairobi', 'Kenya', -1.2921, 36.8219],
      ['Addis Ababa', 'Ethiopia', 9.03, 38.74],
      ['Casablanca', 'Morocco', 33.5731, -7.5898],
      ['Cape Town', 'South Africa', -33.9249, 18.4241],
      ['Accra', 'Ghana', 5.6037, -0.187],
      ['Algiers', 'Algeria', 36.7538, 3.0588],
      ['Dakar', 'Senegal', 14.7167, -17.4677],
      ['Tripoli', 'Libya', 32.8872, 13.1913],
      ['Tunis', 'Tunisia', 36.8065, 10.1815],
      ['Kampala', 'Uganda', 0.3476, 32.5825],
      ['Antananarivo', 'Madagascar', -18.8792, 47.5079]
    ],
    'Asia': [
      ['Tokyo', 'Japan', 35.6762, 139.6503],
      ['Delhi', 'India', 28.6139, 77.209],
      ['Shanghai', 'China', 31.2304, 121.4737],
      ['Beijing', 'China', 39.9042, 116.4074],
      ['Mumbai', 'India', 19.076, 72.8777],
      ['Dhaka', 'Bangladesh', 23.8103, 90.4125],
      ['Karachi', 'Pakistan', 24.8607, 67.0011],
      ['Istanbul', 'Turkey', 41.0082, 28.9784],
      ['Seoul', 'South Korea', 37.5665, 126.978],
      ['Jakarta', 'Indonesia', -6.2088, 106.8456],
      ['Manila', 'Philippines', 14.5995, 120.9842],
      ['Bangkok', 'Thailand', 13.7563, 100.5018],
      ['Ho Chi Minh City', 'Vietnam', 10.8231, 106.6297],
      ['Tehran', 'Iran', 35.6892, 51.389],
      ['Kolkata', 'India', 22.5726, 88.3639],
      ['Guangzhou', 'China', 23.1291, 113.2644],
      ['Singapore', 'Singapore', 1.3521, 103.8198],
      ['Riyadh', 'Saudi Arabia', 24.7136, 46.6753],
      ['Baghdad', 'Iraq', 33.3152, 44.3661],
      ['Dubai', 'United Arab Emirates', 25.2048, 55.2708]
    ],
    'Europe': [
      ['Moscow', 'Russia', 55.7558, 37.6173],
      ['London', 'United Kingdom', 51.5074, -0.1278],
      ['Paris', 'France', 48.8566, 2.3522],
      ['Madrid', 'Spain', 40.4168, -3.7038],
      ['Berlin', 'Germany', 52.52, 13.405],
      ['Rome', 'Italy', 41.9028, 12.4964],
      ['Saint Petersburg', 'Russia', 59.9311, 30.3609],
      ['Barcelona', 'Spain', 41.3874, 2.1686],
      ['Kyiv', 'Ukraine', 50.4501, 30.5234],
      ['Milan', 'Italy', 45.4642, 9.19],
      ['Vienna', 'Austria', 48.2082, 16.3738],
      ['Warsaw', 'Poland', 52.2297, 21.0122],
      ['Budapest', 'Hungary', 47.4979, 19.0402],
      ['Bucharest', 'Romania', 44.4268, 26.1025],
      ['Munich', 'Germany', 48.1351, 11.582],
      ['Prague', 'Czechia', 50.0755, 14.4378],
      ['Amsterdam', 'Netherlands', 52.3676, 4.9041],
      ['Stockholm', 'Sweden', 59.3293, 18.0686],
      ['Athens', 'Greece', 37.9838, 23.7275],
      ['Lisbon', 'Portugal', 38.7223, -9.1393]
    ],
    'North America': [
      ['Mexico City', 'Mexico', 19.4326, -99.1332],
      ['New York', 'United States', 40.7128, -74.006],
      ['Los Angeles', 'United States', 34.0522, -118.2437],
      ['Toronto', 'Canada', 43.6532, -79.3832],
      ['Chicago', 'United States', 41.8781, -87.6298],
      ['Houston', 'United States', 29.7604, -95.3698],
      ['Havana', 'Cuba', 23.1136, -82.3666],
      ['Montreal', 'Canada', 45.5017, -73.5673],
      ['Guadalajara', 'Mexico', 20.6597, -103.3496],
      ['Monterrey', 'Mexico', 25.6866, -100.3161],
      ['Washington, D.C.', 'United States', 38.9072, -77.0369],
      ['Phoenix', 'United States', 33.4484, -112.074],
      ['Guatemala City', 'Guatemala', 14.6349, -90.5069],
      ['Santo Domingo', 'Dominican Republic', 18.4861, -69.9312],
      ['Vancouver', 'Canada', 49.2827, -123.1207],
      ['Miami', 'United States', 25.7617, -80.1918],
      ['Dallas', 'United States', 32.7767, -96.797],
      ['San Francisco', 'United States', 37.7749, -122.4194],
      ['Panama City', 'Panama', 8.9824, -79.5199],
      ['Seattle', 'United States', 47.6062, -122.3321]
    ],
    'South America': [
      ['São Paulo', 'Brazil', -23.5505, -46.6333],
      ['Buenos Aires', 'Argentina', -34.6037, -58.3816],
      ['Rio de Janeiro', 'Brazil', -22.9068, -43.1729],
      ['Lima', 'Peru', -12.0464, -77.0428],
      ['Bogotá', 'Colombia', 4.711, -74.0721],
      ['Santiago', 'Chile', -33.4489, -70.6693],
      ['Belo Horizonte', 'Brazil', -19.9167, -43.9345],
      ['Caracas', 'Venezuela', 10.4806, -66.9036],
      ['Brasília', 'Brazil', -15.7939, -47.8828],
      ['Salvador', 'Brazil', -12.9777, -38.5016],
      ['Fortaleza', 'Brazil', -3.7319, -38.5267],
      ['Medellín', 'Colombia', 6.2442, -75.5812],
      ['Guayaquil', 'Ecuador', -2.171, -79.9224],
      ['Quito', 'Ecuador', -0.1807, -78.4678],
      ['Recife', 'Brazil', -8.0476, -34.877],
      ['Manaus', 'Brazil', -3.119, -60.0217],
      ['Montevideo', 'Uruguay', -34.9011, -56.1645],
      ['La Paz', 'Bolivia', -16.4897, -68.1193],
      ['Asunción', 'Paraguay', -25.2637, -57.5759],
      ['Córdoba', 'Argentina', -31.4201, -64.1888]
    ],
    'Oceania': [
      ['Sydney', 'Australia', -33.8688, 151.2093],
      ['Melbourne', 'Australia', -37.8136, 144.9631],
      ['Brisbane', 'Australia', -27.4698, 153.0251],
      ['Perth', 'Australia', -31.9505, 115.8605],
      ['Auckland', 'New Zealand', -36.8485, 174.7633],
      ['Adelaide', 'Australia', -34.9285, 138.6007],
      ['Gold Coast', 'Australia', -28.0167, 153.4],
      ['Canberra', 'Australia', -35.2809, 149.13],
      ['Wellington', 'New Zealand', -41.2865, 174.7762],
      ['Christchurch', 'New Zealand', -43.5321, 172.6362],
      ['Hobart', 'Australia', -42.8821, 147.3272],
      ['Darwin', 'Australia', -12.4634, 130.8456],
      ['Port Moresby', 'Papua New Guinea', -9.4438, 147.1803],
      ['Suva', 'Fiji', -18.1248, 178.4501],
      ['Newcastle', 'Australia', -32.9283, 151.7817],
      ['Townsville', 'Australia', -19.259, 146.8169],
      ['Cairns', 'Australia', -16.9186, 145.7781],
      ['Nouméa', 'New Caledonia', -22.2758, 166.458],
      ['Alice Springs', 'Australia', -23.698, 133.8807],
      ['Dunedin', 'New Zealand', -45.8788, 170.5028]
    ]
  };

  // Card key -> region. The key is also the ?play= slug.
  const PIN_ROUNDS = {
    'pin-world': 'World',
    'pin-africa': 'Africa',
    'pin-asia': 'Asia',
    'pin-europe': 'Europe',
    'pin-north-america': 'North America',
    'pin-south-america': 'South America',
    'pin-oceania': 'Oceania'
  };

  const PIN_ROUND_SIZE = 20;
  const PIN_PERFECT_KM = 25;    // within this, full marks
  const PIN_FALLOFF_KM = 400;   // past it, points fall by ~63% every 400 km

  // 100 points within 25 km, then exponential falloff:
  // 100 km -> 83, 250 km -> 57, 500 km -> 30, 1,000 km -> 9
  function pinPoints(km) {
    if (km <= PIN_PERFECT_KM) return 100;
    return Math.round(100 * Math.exp(-(km - PIN_PERFECT_KM) / PIN_FALLOFF_KM));
  }

  // Every city as { name, label, country, lat, lon, region }, keyed by
  // name. label is the name as listed; name has the country added if an
  // earlier city already has that name (see claimName).
  const PIN_CITY_BY_NAME = new Map();
  (function () {
    const taken = new Set();
    Object.keys(PIN_CITIES).forEach(region => {
      PIN_CITIES[region].forEach(c => {
        const label = c[0];
        c[0] = claimName(taken, label, c[1]);
        PIN_CITY_BY_NAME.set(c[0], { name: c[0], label: label, country: c[1], lat: c[2], lon: c[3], region: region });
      });
    });
  })();

  function pinCitiesFor(region) {
    if (region === 'World') return Array.from(PIN_CITY_BY_NAME.values());
    return (PIN_CITIES[region] || []).map(c => PIN_CITY_BY_NAME.get(c[0]));
  }

  /* =========================================================
   * PROVINCES OF NATIONS (province mode)
   *
   * Click-the-province rounds for other countries, same mechanic as The
   * Fifty States. Each country's map lives in public/data/provinces-*.json
   * (TopoJSON), generated from Natural Earth by tools/build-provinces.js —
   * display names and Russia's round groups are baked into those files.
   *
   * Each round gets an equal-area conic projection (standard parallels
   * tuned per country) centered on the round's own land, so high-latitude
   * land (northern Canada, Siberia) isn't ballooned the way Mercator would
   * draw it, and a regional round like Central & Northwest Russia sits
   * upright instead of tilted off the edge of a whole-Russia cone.
   *
   * Border choices, inherited from the data build: Crimea and Sevastopol
   * are left out of Russia; Taiwan is left out of China (world mode already
   * treats it as its own country); Hong Kong and Macau are in as China's
   * two SARs; India follows Natural Earth's de facto lines.
   * ========================================================= */

  const PROVINCE_COUNTRIES = {
    canada: {
      name: 'Canada',
      dataUrl: '/data/provinces-canada.json',
      noun: 'Provinces & Territories',
      parallels: [50, 70]
    },
    china: {
      name: 'China',
      dataUrl: '/data/provinces-china.json',
      noun: 'Provinces & Regions',
      parallels: [25, 47]
    },
    india: {
      name: 'India',
      dataUrl: '/data/provinces-india.json',
      noun: 'States',
      parallels: [12, 28]
    },
    russia: {
      name: 'Russia',
      dataUrl: '/data/provinces-russia.json',
      noun: 'Regions',
      parallels: [50, 70]
    }
  };

  // One entry per playable round. The key doubles as the menu card's
  // data-region and as the records region, so renaming a label never
  // orphans anyone's saved bests. Russia's 83 federal subjects are split
  // into three rounds along federal-district lines (`group` matches the
  // group property baked into provinces-russia.json).
  const PROVINCE_ROUNDS = {
    'canada-provinces': {
      country: 'canada', label: 'Provinces of Canada', count: 13,
      subname: 'ten provinces and three territories'
    },
    'china-provinces': {
      country: 'china', label: 'Provinces & Regions of China', count: 33,
      subname: 'provinces, regions, municipalities & SARs'
    },
    'india-states': {
      country: 'india', label: 'States of India', count: 36,
      subname: 'twenty-eight states and eight territories'
    },
    'russia-west': {
      country: 'russia', group: 'west', label: 'Central & Northwest Russia', count: 29,
      subname: 'Moscow, St. Petersburg, and the Arctic west'
    },
    'russia-south': {
      country: 'russia', group: 'south', label: 'Southern Russia & the Volga', count: 27,
      subname: 'the Caucasus, the Black Sea, and the Volga'
    },
    'russia-east': {
      country: 'russia', group: 'east', label: 'Urals, Siberia & the Far East', count: 27,
      subname: 'from the Urals to the Pacific'
    }
  };

  const EMPTY_PROVINCE_STORE = {
    features: [],
    canonicalByFeature: new Map(),
    featureByCanonical: new Map()
  };

  /* =========================================================
   * DAILY PUZZLE — DIFFICULTY TIERS & DETERMINISTIC GENERATION
   * ========================================================= */

  // Tier 1 (easy): large, famous, distinctively-shaped countries that
  // most casual players will recognize on a map without much hesitation.
  const TIER_1_EASY = new Set([
    'United States','Canada','Mexico','Brazil','Argentina','Chile',
    'United Kingdom','France','Germany','Spain','Italy','Greece','Norway','Sweden','Finland','Poland','Ireland',
    'Russia','Ukraine','Turkey',
    'China','Japan','India','Australia','New Zealand','Indonesia','South Korea','Thailand','Vietnam','Philippines',
    'Egypt','South Africa','Nigeria','Morocco','Kenya','Ethiopia',
    'Saudi Arabia','Iran','Iraq','Israel','Pakistan','Afghanistan',
    'Cuba','Colombia','Peru','Venezuela'
  ]);

  // Tier 3 (hard): small, geographically obscure, or commonly confused
  // with neighbors. Players will need to actually know geography for these.
  const TIER_3_HARD = new Set([
    'Bhutan','Brunei','Timor-Leste','Maldives','Nepal','Tajikistan','Kyrgyzstan','Turkmenistan',
    'Eritrea','Djibouti','Comoros','Burundi','Rwanda','Lesotho','Eswatini','Equatorial Guinea',
    'Guinea-Bissau','Sierra Leone','Liberia','Togo','Benin','Gambia','Cape Verde',
    'Suriname','Guyana','French Guiana','Paraguay','Uruguay','Belize',
    'Moldova','North Macedonia','Montenegro','Kosovo','Andorra','Liechtenstein','San Marino',
    'Solomon Islands','Vanuatu','Fiji','New Caledonia','Papua New Guinea',
    'Falkland Islands','Western Sahara','Somaliland','Northern Cyprus','Palestine'
  ]);

  // Tier 2 (medium) is everything else — computed lazily once the world
  // data has loaded so we know the actual eligible-country list.

  // Seeded RNG for deterministic daily puzzles. Mulberry32 — fast, well-
  // distributed, and identical across all browsers/platforms.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deterministic shuffle so a given seed always produces the same order.
  function seededShuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // YYYY-MM-DD in UTC so everyone in the world is on the same puzzle.
  // The "new puzzle" rollover lands at midnight UTC = 7pm Eastern.
  function todayUtcKey() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // Convert a date key into a 32-bit numeric seed so the same date
  // always produces the same RNG sequence on every device.
  function seedFromDateKey(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Daily puzzle number — humans like seeing "Daily #57" rather than a date.
  // Anchored at a fixed start date so the count is meaningful and stable.
  const DAILY_EPOCH = '2026-04-26'; // Day 1 of the daily puzzle
  function dailyPuzzleNumber(dateKey) {
    const target = Date.parse(dateKey + 'T00:00:00Z');
    const epoch = Date.parse(DAILY_EPOCH + 'T00:00:00Z');
    return Math.floor((target - epoch) / (24 * 60 * 60 * 1000)) + 1;
  }

  // Generates the 5 country names for a given UTC date. The first country
  // is always Tier 1 (easy) and the fifth is always Tier 3 (hard); the
  // middle three ramp in difficulty. Returned in play order.
  function generateDailyPuzzle(dateKey) {
    const seed = seedFromDateKey(dateKey);
    const rng = mulberry32(seed);

    // Build pools from the loaded country list (so we never pick a country
    // that's not actually in the map data)
    const eligible = state.allFeatures
      .filter(f => state.continentByFeature.get(featureKey(f)))
      .map(f => state.canonicalByFeature.get(featureKey(f)))
      .filter(Boolean);
    const eligibleSet = new Set(eligible);

    const tier1 = Array.from(TIER_1_EASY).filter(n => eligibleSet.has(n));
    const tier3 = Array.from(TIER_3_HARD).filter(n => eligibleSet.has(n));
    const tier2 = eligible.filter(n => !TIER_1_EASY.has(n) && !TIER_3_HARD.has(n));

    // Sort each pool deterministically before shuffling so the output is
    // independent of TopoJSON file ordering across releases.
    tier1.sort();
    tier2.sort();
    tier3.sort();

    const t1 = seededShuffle(tier1, rng);
    const t2 = seededShuffle(tier2, rng);
    const t3 = seededShuffle(tier3, rng);

    // Slot 1: easy. Slot 2: easy or medium. Slot 3: medium.
    // Slot 4: medium or hard. Slot 5: hard.
    const picks = [
      t1.shift(),
      rng() < 0.5 ? t1.shift() : t2.shift(),
      t2.shift(),
      rng() < 0.5 ? t2.shift() : t3.shift(),
      t3.shift(),
    ];
    // Fallback: if any slot ended up undefined (shouldn't happen with
    // current pool sizes), top up from the medium pool.
    for (let i = 0; i < picks.length; i++) {
      if (!picks[i]) picks[i] = t2.shift() || t1.shift() || t3.shift();
    }
    return picks;
  }

  /* =========================================================
   * DAILY ATTEMPT TRACKING (localStorage, keyed by UTC date)
   * ========================================================= */

  const DAILY_KEY = 'atlas-daily-attempts';

  function loadDailyAttempts() {
    try {
      const raw = localStorage.getItem(DAILY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  // Stores the attempts, keeping only the newest 30 days so the store
  // can't grow without bound
  function saveDailyAttempts(all) {
    const trimmed = {};
    Object.keys(all).sort().slice(-30).forEach(k => { trimmed[k] = all[k]; });
    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify(trimmed));
    } catch (e) { /* storage blocked - silently ignore */ }
  }

  function saveDailyAttempt(dateKey, result) {
    const all = loadDailyAttempts();
    all[dateKey] = result;
    saveDailyAttempts(all);
  }

  function getDailyAttempt(dateKey) {
    const all = loadDailyAttempts();
    return all[dateKey] || null;
  }

  // Daily streak: consecutive days played (any result) ending today, or
  // ending yesterday while today's puzzle is still to play.
  function calculateDailyStreak() {
    const all = loadDailyAttempts();
    let streak = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let offset = 0; offset < 365; offset++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - offset);
      const k = d.getUTCFullYear() + '-' +
                String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
                String(d.getUTCDate()).padStart(2, '0');
      if (all[k]) streak++;
      else if (offset > 0) break;
    }
    return streak;
  }

  /* =========================================================
   * GAME MODE DEFINITIONS
   *
   * Each mode tells the engine:
   *   - dataset: which map data source to use
   *   - promptType: what the header displays
   *   - eligibility: which features count for this quiz
   *   - getPromptText(feature): what text appears above the map
   * ========================================================= */

  const GAME_MODES = {
    'world-country': {
      dataset: 'world',
      label: (continent) => continent === 'World' ? 'The Entire World' : continent,
      promptLabel: 'Find on the map',
      recordsLabelSuffix: '',
    },
    'daily-five': {
      dataset: 'world',
      label: () => 'Daily Five',
      promptLabel: 'Find on the map',
      recordsLabelSuffix: ' · Daily',
    },
    'us-state': {
      dataset: 'us',
      label: () => 'The United States',
      promptLabel: 'Find the state',
      recordsLabelSuffix: ' · States',
    },
    'us-capital-to-state': {
      dataset: 'us',
      label: () => 'US Capitals → States',
      promptLabel: 'Click the state whose capital is',
      recordsLabelSuffix: ' · Capitals→States',
    },
    'us-state-to-capital': {
      dataset: 'us',
      label: () => 'US States → Capitals',
      promptLabel: 'Which capital belongs to',
      recordsLabelSuffix: ' · States→Capitals',
    },
    'us-city': {
      dataset: 'us',
      // Region (Northeast / Midwest / South / West) is supplied as the
      // continent label at startGame time, so use it directly in records.
      label: (region) => (region || 'US') + ' Cities',
      promptLabel: 'Find the city',
      recordsLabelSuffix: ' · Cities',
    },
    'city-pin': {
      dataset: 'world',
      // currentContinent is the region ('Europe', 'World', ...)
      label: (region) => 'Pin the City · ' + (region || 'World'),
      promptLabel: 'Pin the city',
      recordsLabelSuffix: ' · Pin',
    },
    'province': {
      dataset: 'province',
      // currentContinent holds the PROVINCE_ROUNDS key (e.g. 'russia-west');
      // map it to the round's display title.
      label: (roundKey) => (PROVINCE_ROUNDS[roundKey] || {}).label || 'Provinces',
      promptLabel: 'Find on the map',
      recordsLabelSuffix: ' · Provinces',
    },
  };

  const state = {
    // World dataset
    allFeatures: [],         // All country features from TopoJSON
    worldLoading: null,      // promise for the world map load, set once at startup
    worldFailed: false,      // true once that load has given up
    canonicalByFeature: new Map(), // feature key -> canonical name
    continentByFeature: new Map(), // feature key -> continent
    featureByCanonical: new Map(), // canonical name -> feature

    // US dataset (loaded lazily when a US mode is first selected)
    usFeatures: [],
    usCanonicalByFeature: new Map(),
    usFeatureByCanonical: new Map(),
    usLoaded: false,
    usLoading: null,         // promise while loading
    // Map of city name -> state name, rebuilt per round in us-city mode
    // so the prompt can show "Burlington, Vermont" to disambiguate.
    cityStateByName: null,

    // Province mode: one store per country, lazy-loaded on first play
    // ({ features, canonicalByFeature, featureByCanonical }), plus the
    // PROVINCE_ROUNDS key of the round in progress.
    provinceStores: {},
    provinceLoading: {},
    currentProvinceRound: null,

    // Active game - which dataset + mode is in play
    activeDataset: 'world',  // 'world' or 'us'
    gameMode: 'world-country', // key into GAME_MODES

    currentContinent: null,   // Selected region/scope label
    eligibleFeatures: [],     // Features for current game
    queue: [],                // Remaining canonical names to ask
    current: null,            // Current target canonical name
    currentPromptText: null,  // Text shown above the map (may differ from .current for capital modes)
    attempts: 0,              // Attempts on current country
    correct: 0,
    wrong: 0,
    score: 0,
    missed: [],               // Countries not found
    secondTry: [],            // Countries found only on the second attempt
    sequence: [],             // Per-country points: 2 (first try), 1 (second try), 0 (missed)
    startArg: null,           // What startGame() was called with, so replays restart the same level
    roundId: 0,               // Goes up when a round starts and when one is left (see roundTimeout)
    practice: false,          // True for a focus round (subset of a level; skips records)
    learn: null,              // Learn mode run (province ladder), see LEARN MODE section
    pin: null,                // Pin the City round: { phase, guess, results }
    roundNeedsWork: [],       // missed + secondTry from the round just finished
    startTime: null,
    interactionLocked: false,
    hardMode: false,          // In hard mode, countries are not persistently marked green/red
    difficulty: 'normal',     // 'normal' | 'hard' | 'uncharted' (hardMode is true for both hard and uncharted)
    mapStyle: 'parchment',    // 'parchment' | 'satellite' (Uncharted always shows satellite)
    view: 'home',             // the view showing, or the one to come back to after a round (key into VIEWS)
    review: null,             // Smart Review in progress: { queue: [{ level, names }] } still to play

    svg: null,
    projection: null,
    pathGen: null,
    mapG: null,
    zoomBehavior: null,
    currentTransform: null,
    zoomHintShown: false,
  };

  // Small helpers so the engine can work with any dataset without
  // knowing the specifics of each. Keyed off state.activeDataset.
  function activeFeatures() {
    if (state.activeDataset === 'us') return state.usFeatures;
    if (state.activeDataset === 'province') return currentProvinceStore().features;
    return state.allFeatures;
  }
  function activeCanonicalByFeature() {
    if (state.activeDataset === 'us') return state.usCanonicalByFeature;
    if (state.activeDataset === 'province') return currentProvinceStore().canonicalByFeature;
    return state.canonicalByFeature;
  }
  function activeFeatureByCanonical() {
    if (state.activeDataset === 'us') return state.usFeatureByCanonical;
    if (state.activeDataset === 'province') return currentProvinceStore().featureByCanonical;
    return state.featureByCanonical;
  }

  // The loaded store for the country of the province round in progress
  function currentProvinceStore() {
    const round = PROVINCE_ROUNDS[state.currentProvinceRound];
    return (round && state.provinceStores[round.country]) || EMPTY_PROVINCE_STORE;
  }

  function featureName(f) {
    if (!f.properties) return null;
    return f.properties.name || f.properties.NAME || f.properties.NAME_LONG || null;
  }

  // A feature's key within its dataset. Built from the name, which is
  // unique in every map file; ids are not (world-atlas gives Australia and
  // "Ashmore and Cartier Is." the same one, and leaves a few features without).
  function featureKey(f) {
    const name = featureName(f);
    return name != null ? 'name:' + name : 'id:' + f.id;
  }

  /* =========================================================
   * DATA LOADING
   * ========================================================= */

  const TOPO_URLS = [
    // 50m has roughly 3× the polygon detail of 110m — coastlines
    // and smaller countries look crisp when zoomed in
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json',
    'https://unpkg.com/world-atlas@2/countries-50m.json',
    // 110m fallback in case 50m fails (smaller, less detailed)
    'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
    'https://unpkg.com/world-atlas@2/countries-110m.json'
  ];

  async function loadWorldData() {
    let lastErr = null;
    for (const url of TOPO_URLS) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Could not load world atlas data');
  }

  // US states data, in priority order:
  //   1. Our own filtered copy of Natural Earth 10m admin_1 (51 US features,
  //      ~1MB GeoJSON, ~300KB after Cloudflare gzip). NE's 10m is the
  //      highest-detail commonly available state boundary set — borders are
  //      visibly smoother than us-atlas 10m at the regional zoom used by
  //      cities mode. File lives in this repo at public/data/.
  //   2. us-atlas 10m as graceful-degradation fallback (chunkier borders,
  //      but the game still plays).
  // Format-agnostic loader handles either GeoJSON or TopoJSON below.
  const US_TOPO_URLS = [
    '/data/us-states-detail.json',
    'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
    'https://unpkg.com/us-atlas@3/states-10m.json'
  ];

  async function loadUsStatesData() {
    // Cache: load once per session
    if (state.usLoaded) return;
    if (state.usLoading) { await state.usLoading; return; }

    state.usLoading = (async () => {
      await ensureTopojson();
      let lastErr = null;
      for (const url of US_TOPO_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();

          // Accept either GeoJSON FeatureCollection or TopoJSON. Our local
          // high-detail file is GeoJSON; the us-atlas fallback is TopoJSON.
          let geojson;
          if (data.type === 'FeatureCollection') {
            geojson = data;
          } else if (data.objects) {
            const key = data.objects.states ? 'states' : Object.keys(data.objects)[0];
            geojson = topojson.feature(data, data.objects[key]);
          } else {
            throw new Error('Unrecognized US states data format');
          }

          state.usFeatures = geojson.features.filter(f => featureName(f));
          state.usCanonicalByFeature.clear();
          state.usFeatureByCanonical.clear();
          state.usFeatures.forEach(f => {
            const raw = featureName(f);
            // State names in us-atlas already match our canonical list
            state.usCanonicalByFeature.set(featureKey(f), raw);
            if (!state.usFeatureByCanonical.has(raw)) {
              state.usFeatureByCanonical.set(raw, f);
            }
          });
          state.usLoaded = true;
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Could not load US states data');
    })();

    try {
      await state.usLoading;
    } finally {
      state.usLoading = null;
    }
  }

  // Lazy-load one country's province map (TopoJSON from public/data/).
  // Cached per session in state.provinceStores; concurrent calls share the
  // same in-flight fetch.
  async function loadProvinceData(countryKey) {
    if (state.provinceStores[countryKey]) return;
    if (state.provinceLoading[countryKey]) { await state.provinceLoading[countryKey]; return; }

    state.provinceLoading[countryKey] = (async () => {
      await ensureTopojson();
      const res = await fetch(PROVINCE_COUNTRIES[countryKey].dataUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const topology = await res.json();
      const key = topology.objects.provinces ? 'provinces' : Object.keys(topology.objects)[0];
      const geojson = topojson.feature(topology, topology.objects[key]);

      const store = {
        features: geojson.features.filter(f => featureName(f)),
        canonicalByFeature: new Map(),
        featureByCanonical: new Map()
      };
      // Names are already canonical — the build script bakes them in
      store.features.forEach(f => {
        const name = featureName(f);
        store.canonicalByFeature.set(featureKey(f), name);
        store.featureByCanonical.set(name, f);
      });
      state.provinceStores[countryKey] = store;
    })();

    try {
      await state.provinceLoading[countryKey];
    } finally {
      state.provinceLoading[countryKey] = null;
    }
  }

  async function ensureTopojson() {
    if (typeof topojson !== 'undefined' && topojson.feature) return;
    // Fallback CDNs in case the primary script tag failed
    const fallbackUrls = [
      'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
      'https://unpkg.com/topojson-client@3/dist/topojson-client.min.js'
    ];
    for (const url of fallbackUrls) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = url;
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load ' + url));
          document.head.appendChild(s);
        });
        if (typeof topojson !== 'undefined' && topojson.feature) return;
      } catch (_) { /* try next */ }
    }
    throw new Error('Could not load topojson library from any CDN');
  }

  // Fetch the world map and index its countries by key and canonical name
  async function loadWorldFeatures() {
    await ensureTopojson();
    const topology = await loadWorldData();
    const countriesKey = topology.objects.countries ? 'countries' : Object.keys(topology.objects)[0];
    const geojson = topojson.feature(topology, topology.objects[countriesKey]);

    state.allFeatures = geojson.features.filter(f => featureName(f));

    state.allFeatures.forEach(f => {
      const raw = featureName(f);
      const canonical = canonicalize(raw);
      const continent = getContinent(canonical);
      state.canonicalByFeature.set(featureKey(f), canonical);
      state.continentByFeature.set(featureKey(f), continent);
      if (canonical && !state.featureByCanonical.has(canonical)) {
        state.featureByCanonical.set(canonical, f);
      }
    });
  }

  async function init() {
    try {
      state.worldLoading = loadWorldFeatures();
      await state.worldLoading;

      refreshView();
      openLinkedLevel();

      // Fire-and-forget: pull latest records from server if a sync token is set.
      // syncOnAppLoad re-renders the menu when data arrives.
      syncOnAppLoad().catch(() => {});
    } catch (err) {
      console.error(err);
      state.worldFailed = true;
      refreshView();
    }
  }

  /* =========================================================
   * LEVELS (the one list of everything playable)
   *
   * Every playable level, in library order. Menus, level links, stats and
   * review all read this; nothing else lists levels. The Daily Five is not
   * here: it is one puzzle a day, not a level to pick and replay.
   *
   *   key         the ?play= slug
   *   collection  key into COLLECTIONS
   *   title       display name (free to change: nothing is stored under it)
   *   arg         what startGame() takes
   *   mode        key into GAME_MODES
   *   skill       the mastery skill its answers feed; levels that teach the
   *               same thing share one (every continent feeds 'country')
   *   noun        plural of what the level asks for, lower case
   *   available   false while the level has nothing to play yet
   *   names()     the level's item names, exactly as the game queues them
   *               and the mastery store keys them. Country and province
   *               names come from map files, so this is [] until ready().
   *   ready()     true once names() is complete
   *   load()      fetches whatever names() needs; resolves when ready()
   *   count()     how many items the level has. Unlike names(), a province
   *               level knows this before its map is in; the country levels
   *               still wait for the world map (0 until then).
   * ========================================================= */

  const COLLECTIONS = [
    { key: 'world', icon: 'globe', title: 'World & Continents', desc: 'Find every country on the globe' },
    { key: 'us', icon: 'star', title: 'United States', desc: 'States, capitals and cities' },
    { key: 'provinces', icon: 'layers', title: 'Provinces & States', desc: 'The inner divisions of Canada, China, India and Russia' },
    { key: 'pins', icon: 'pin', title: 'Pin the City', desc: 'A blank map, a city name, and a pin' }
  ];

  // Canonical names of the countries asked for in one continent, or in all
  // of them for 'World'; [] until the world map has loaded
  function countryNames(region) {
    const names = new Set();
    state.allFeatures.forEach(f => {
      const continent = state.continentByFeature.get(featureKey(f));
      if (continent && (region === 'World' || continent === region)) {
        names.add(state.canonicalByFeature.get(featureKey(f)));
      }
    });
    return Array.from(names);
  }

  function usCityNames(region) {
    return (US_CITIES_BY_REGION[region] || []).map(c => c.name);
  }

  // Display names of the provinces a round asks for; [] until that
  // country's map has loaded
  function provinceRoundNames(roundKey) {
    const round = PROVINCE_ROUNDS[roundKey];
    const store = round && state.provinceStores[round.country];
    if (!store) return [];
    return store.features
      .filter(f => !round.group || (f.properties && f.properties.group === round.group))
      .map(f => featureName(f));
  }

  const LEVELS = [].concat(
    ['World'].concat(CONTINENT_ORDER).map(region => ({
      key: region.toLowerCase().replace(/ /g, '-'),
      collection: 'world',
      title: region === 'World' ? 'The World' : region,
      arg: region, mode: 'world-country', skill: 'country', noun: 'countries',
      names: () => countryNames(region),
      ready: () => state.allFeatures.length > 0,
      load: () => state.worldLoading
    })),
    [
      // The fifty state names are known without the map (every map file the
      // game can load has all of them), so these are ready from the start
      { key: 'us-state', title: 'States', skill: 'us-state', noun: 'states' },
      { key: 'us-state-to-capital', title: 'States → Capitals', skill: 'us-capital', noun: 'capitals' },
      { key: 'us-capital-to-state', title: 'Capitals → States', skill: 'us-capital', noun: 'capitals' }
    ].map(def => Object.assign(def, {
      collection: 'us', arg: def.key, mode: def.key,
      names: () => US_STATE_NAMES.slice()
    })),
    Object.keys(US_CITY_REGION_KEYS).map(key => {
      const region = US_CITY_REGION_KEYS[key];
      return {
        key: key, collection: 'us', title: 'Cities: ' + region,
        arg: key, mode: 'us-city', skill: 'us-city', noun: 'cities',
        available: usCityNames(region).length > 0,
        names: () => usCityNames(region)
      };
    }),
    Object.keys(PROVINCE_ROUNDS).map(key => {
      const round = PROVINCE_ROUNDS[key];
      const country = PROVINCE_COUNTRIES[round.country];
      return {
        key: key, collection: 'provinces',
        title: round.group ? round.label : country.name,
        arg: key, mode: 'province', skill: 'province:' + round.country,
        noun: country.noun.toLowerCase(),
        names: () => provinceRoundNames(key),
        ready: () => !!state.provinceStores[round.country],
        load: () => loadProvinceData(round.country),
        count: () => round.count
      };
    }),
    // A World round draws 20 of these; a continent round asks them all
    Object.keys(PIN_ROUNDS).map(key => ({
      key: key, collection: 'pins', title: PIN_ROUNDS[key],
      arg: key, mode: 'city-pin', skill: 'city-pin', noun: 'cities',
      names: () => pinCitiesFor(PIN_ROUNDS[key]).map(c => c.name)
    }))
  ).map(def => {
    const level = Object.assign({ available: true, ready: () => true, load: () => Promise.resolve() }, def);
    if (!level.count) level.count = () => level.names().length;
    return level;
  });

  function levelByKey(key) {
    return LEVELS.find(level => level.key === key) || null;
  }

  function levelForStartArg(startArg) {
    return LEVELS.find(level => level.arg === startArg) || null;
  }

  // The mastery skill the round in play feeds. The Daily Five has no level
  // of its own; its countries count toward 'country' like any other round's.
  function roundSkill() {
    if (state.gameMode === 'daily-five') return 'country';
    const level = levelForStartArg(state.startArg);
    return level ? level.skill : null;
  }

  /* =========================================================
   * LEVEL LINKS (?play=<slug>, shareable per level)
   *
   * A level's slug is its key in LEVELS: continents lowercased and
   * hyphenated ('north-america'), 'world', and every other level's card
   * key ('china-provinces', 'us-state', 'west-cities'). The Daily Five is
   * 'daily'. A link starts a fresh full round of its level straight away;
   * &learn=1 opens a province level in Learn mode instead. The address bar
   * tracks the level in play, so copying it works too.
   * ========================================================= */

  // slug -> startGame() argument, for every link the app answers
  function linkSlugs() {
    const slugs = { daily: 'daily-five' };
    LEVELS.forEach(level => { slugs[level.key] = level.arg; });
    return slugs;
  }

  function slugForStartArg(startArg) {
    if (startArg === 'daily-five') return 'daily';
    const level = levelForStartArg(startArg);
    return level ? level.key : null;
  }

  function baseUrl() {
    return window.location.origin + window.location.pathname;
  }

  // Shareable URL for a level (falls back to the home page)
  function levelLink(startArg, learn) {
    const slug = slugForStartArg(startArg);
    if (!slug) return baseUrl();
    return baseUrl() + '?play=' + slug + (learn ? '&learn=1' : '');
  }

  // Point the address bar at a URL without adding a history entry
  function setAddressBar(url) {
    try {
      if (window.location.href !== url) window.history.replaceState(null, '', url);
    } catch (e) { /* some embedded browsers block this - harmless */ }
  }

  // On load: start the level named in ?play=. A slug that is no playable
  // level stays on the menu and says so.
  function openLinkedLevel() {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    const slug = (params.get('play') || '').toLowerCase();
    if (!slug) return;
    const startArg = linkSlugs()[slug];
    const level = startArg ? levelForStartArg(startArg) : null;
    if (!startArg || (level && !level.available)) {
      setAddressBar(baseUrl());
      showNotice(level
        ? level.title + ' isn’t ready to play yet.'
        : 'That link doesn’t lead to a level.');
      return;
    }
    startGame(startArg, params.get('learn') === '1' && PROVINCE_ROUNDS[startArg] ? { learn: true } : null);
  }

  /* =========================================================
   * HOME (masthead, Today, the Library)
   *
   * Drawn into #menu-content in three parts that can be redrawn on their
   * own: the masthead, Today (Daily Five and Smart Review) and the
   * Library (every collection with all of its level cards, from LEVELS).
   * A level card opens the level sheet; nothing starts from Home directly
   * except the Daily Five and a review.
   * ========================================================= */

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // A count as running text: words up to ninety-nine, digits beyond
  function numberWord(n) {
    if (n < 20) return NUMBER_WORDS[n];
    if (n < 100) return TENS_WORDS[Math.floor(n / 10)] + (n % 10 ? '-' + NUMBER_WORDS[n % 10] : '');
    return n.toLocaleString('en-US');
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Singular of each level noun, for a count of one
  const SINGULAR_NOUNS = {
    'countries': 'country', 'states': 'state', 'capitals': 'capital', 'cities': 'city', 'regions': 'region',
    'provinces & territories': 'province or territory', 'provinces & regions': 'province or region', 'places': 'place'
  };

  // "1 state", "6 states"
  function countNoun(n, noun) {
    return n.toLocaleString('en-US') + ' ' + (n === 1 && SINGULAR_NOUNS[noun] ? SINGULAR_NOUNS[noun] : noun);
  }

  // A line about the level that leads each collection, shown on its wider card
  const LEAD_BLURBS = {
    'world': 'Every continent, every nation. The grand tour.',
    'us-state': 'Find each state on the map, Alaska and Hawaii included.',
    'pin-world': 'A blank map and a city name. The closer the pin, the higher the score.'
  };

  /* ----- What is known about a level ----- */

  function skillSeen(skill) {
    return mastery.skills().indexOf(skill) !== -1;
  }

  // Mastery over a set of levels whose names aren't in yet, from the names
  // the store itself holds for the skill; `total` is the known item count
  function storedSummary(skill, total) {
    const summary = mastery.summary(skill);
    summary.total = total;
    summary.new = Math.max(0, total - summary.seen);
    return summary;
  }

  // A level's mastery summary. Until a province map is in, the store's own
  // names stand in, which is exact for a country taught by one level.
  // Russia's three rounds share a skill, so with history there the answer
  // is null until the map says which name belongs to which round.
  function levelSummary(level) {
    if (level.ready()) return mastery.summary(level.skill, level.names());
    const shared = LEVELS.some(other => other !== level && other.skill === level.skill);
    if (shared && skillSeen(level.skill)) return null;
    return storedSummary(level.skill, level.count());
  }

  // One mastery summary per skill among the given levels. Levels that teach
  // the same names share a skill, so each name counts once.
  function skillSummaries(levels) {
    const bySkill = new Map();
    levels.filter(level => level.available).forEach(level => {
      if (!bySkill.has(level.skill)) bySkill.set(level.skill, []);
      bySkill.get(level.skill).push(level);
    });
    return Array.from(bySkill, ([skill, group]) => {
      if (group.every(level => level.ready())) {
        const names = new Set();
        group.forEach(level => level.names().forEach(name => names.add(name)));
        return mastery.summary(skill, Array.from(names));
      }
      return storedSummary(skill, group.reduce((n, level) => n + level.count(), 0));
    });
  }

  function addSummaries(summaries) {
    const sum = { total: 0, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0 };
    summaries.forEach(s => Object.keys(sum).forEach(k => { sum[k] += s[k]; }));
    return sum;
  }

  // Fetch a level's map in the background and redraw when it lands, so a
  // card that could not show its mastery fills in. One try per level per visit.
  const levelDataAsked = new Set();
  function loadLevelData(level) {
    if (levelDataAsked.has(level.key)) return;
    const loading = level.load();
    if (!loading) return;   // the world map's own load hasn't begun; it redraws when it lands
    levelDataAsked.add(level.key);
    loading.then(() => {
      if (level.ready()) refreshView();
    }, () => { /* offline or missing: the card keeps its plain ring */ });
  }

  // The stored record for a level at one difficulty (not Pin the City, whose
  // history lives in the pin store)
  function levelRecord(level, difficulty) {
    return getRecords(resolveGameTarget(level.arg).region, difficulty, level.mode);
  }

  function levelPinStats(level, difficulty) {
    return pinRegionStats(resolveGameTarget(level.arg).region, difficulty);
  }

  // True once a full round of the level has been finished at any difficulty
  function levelPlayed(level) {
    return Object.keys(DIFFICULTY_INFO).some(d =>
      level.mode === 'city-pin' ? levelPinStats(level, d).games > 0 : !!levelRecord(level, d));
  }

  // A level's best at one difficulty in a few characters ("49 / 54",
  // "1,712 pts"), or '' when it has none
  function levelBestText(level, difficulty) {
    if (level.mode === 'city-pin') {
      const stats = levelPinStats(level, difficulty);
      return stats.games ? stats.best.toLocaleString('en-US') + ' pts' : '';
    }
    const rec = levelRecord(level, difficulty);
    return rec && rec.bestAccuracy ? rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total : '';
  }

  // "54 countries", "20 drawn from 120"
  function levelCountText(level) {
    const count = level.count();
    if (level.mode === 'city-pin' && count > PIN_ROUND_SIZE) return PIN_ROUND_SIZE + ' drawn from ' + count;
    return countNoun(count, level.noun);
  }

  // The focus list saved by the level's last full round, or null
  function levelFocusList(level) {
    const focus = getFocusList(level.mode, resolveGameTarget(level.arg).region);
    return focus && focus.names.length > 0 ? focus : null;
  }

  /* ----- Mastery marks ----- */

  // Ring for a summary: the mastered share as a number, the three tiers as arcs
  function renderRing(summary) {
    if (!summary || !summary.seen || !summary.total) return '<span class="ring"></span>';
    const share = n => Math.round(n / summary.total * 1000) / 10;
    const pct = Math.round(summary.mastered / summary.total * 100);
    return '<span class="ring' + (pct === 100 ? ' is-full' : '') + '" style="--a:' + share(summary.mastered) +
      ';--b:' + share(summary.mastered + summary.familiar) +
      ';--c:' + share(summary.mastered + summary.familiar + summary.learning) + '"><b>' + pct + '</b></span>';
  }

  // Bar for a summary: mastered, familiar, learning, new, each as wide as its count
  function renderMasteryBar(summary, extraClass) {
    const part = (n, cls) => n > 0 ? '<i' + (cls ? ' class="' + cls + '"' : '') + ' style="--n:' + n + '"></i>' : '';
    return '<span class="mbar' + (extraClass ? ' ' + extraClass : '') + '" role="img" aria-label="' +
      summary.mastered + ' mastered, ' + summary.familiar + ' familiar, ' + summary.learning + ' learning, ' + summary.new + ' new">' +
      part(summary.mastered, 'm3') + part(summary.familiar, 'm2') + part(summary.learning, 'm1') + part(summary.new, '') +
      '</span>';
  }

  /* ----- Home ----- */

  function renderHome() {
    // The country levels have nothing to show until the world map is in;
    // the loading line in the markup stands until then
    const container = document.getElementById('menu-content');
    if (!state.allFeatures.length) {
      if (state.worldFailed) {
        container.innerHTML = '<div class="error-state">' +
          '<strong>The map could not be unfurled.</strong><br/>' +
          'The atlas data failed to load. This may be a network issue — please check your connection and refresh the page.' +
          '</div>';
      }
      return;
    }
    if (!document.getElementById('home-masthead')) {
      container.innerHTML =
        '<header class="masthead" id="home-masthead"></header>' +
        '<section class="today" aria-labelledby="today-label">' +
          '<h2 class="eyebrow section-label" id="today-label">Today</h2>' +
          '<div class="today-grid" id="home-today"></div>' +
        '</section>' +
        '<section class="library" aria-labelledby="library-title" id="home-library"></section>';
      renderLibraryFrame();
    }
    renderMasthead();
    renderToday();
    syncPlayControls();
    renderCollections();
  }

  // True until this device holds any progress at all
  function isNewPlayer() {
    const totals = mastery.totals();
    return !totals.games && !totals.itemsSeen && !Object.keys(loadAllRecords()).length &&
      !Object.keys(loadDailyAttempts()).length && !loadPinStore().games.length;
  }

  function renderMasthead() {
    const now = new Date();
    const dateLine = now.toLocaleDateString('en-US', { weekday: 'long' }) + ', ' + now.getDate() + ' ' +
      now.toLocaleDateString('en-US', { month: 'long' }) + ' ' + now.getFullYear();
    const hour = now.getHours();
    const fresh = isNewPlayer();
    const greeting = fresh ? 'Welcome.'
      : hour >= 5 && hour < 12 ? 'Good morning.' : hour >= 12 && hour < 18 ? 'Good afternoon.' : 'Good evening.';

    const due = reviewDueCount();
    const dailyDone = !!getDailyAttempt(todayUtcKey());
    let lede;
    if (fresh) {
      lede = 'Find places on the map and the atlas keeps track of the ones you know. Start with today’s Daily Five, or pick a level from the library.';
    } else if (due > 0) {
      lede = '<b>' + capitalize(numberWord(due)) + ' ' + (due === 1 ? 'place</b> is' : 'places</b> are') + ' due for review' +
        (dailyDone ? '. Today’s Daily Five is done.' : ', and today’s Daily Five is waiting.');
    } else {
      lede = dailyDone ? 'Nothing is due for review, and today’s Daily Five is done. Pick any level to keep going.'
        : 'Nothing is due for review. Today’s Daily Five is waiting.';
    }

    const totals = mastery.totals();
    const all = addSummaries(skillSummaries(LEVELS));
    const month = mastery.activity(30).reduce((sum, day) => {
      sum.questions += day.questions;
      sum.firstTry += day.firstTry;
      return sum;
    }, { questions: 0, firstTry: 0 });
    const streak = mastery.streak();
    const figure = (value, unit, label, sub) =>
      '<div><dd class="num' + (value === null ? ' is-empty' : '') + '">' + (value === null ? '—' : value + (unit ? '<small>' + unit + '</small>' : '')) +
      '</dd><dt class="eyebrow">' + label + '</dt><span class="summary-sub">' + sub + '</span></div>';

    document.getElementById('home-masthead').innerHTML =
      '<div class="masthead-copy">' +
        '<p class="eyebrow">' + dateLine + '</p>' +
        '<h1 class="display-xl">' + greeting + '</h1>' +
        '<p class="lede">' + lede + '</p>' +
      '</div>' +
      '<dl class="summary" aria-label="Your progress">' +
        figure(totals.itemsSeen ? all.mastered.toLocaleString('en-US') : null, '', 'Places mastered', 'of ' + all.total.toLocaleString('en-US')) +
        figure(month.questions ? Math.round(month.firstTry / month.questions * 100) : null, '%', 'First-try accuracy', 'last 30 days') +
        figure(totals.games ? streak.current : null, '', 'Day streak', totals.games ? 'longest ' + streak.longest : 'starts with a round') +
      '</dl>';
  }

  /* ----- Today: the Daily Five ----- */

  // The last `count` UTC days, oldest first, each with its attempt (or null)
  function dailyDays(count) {
    const all = loadDailyAttempts();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const days = [];
    for (let back = count - 1; back >= 0; back--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - back);
      const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      days.push({
        key: key,
        name: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        attempt: all[key] || null
      });
    }
    return days;
  }

  // How many of an attempt's five were found on the first try
  function dailyFirstTries(attempt) {
    if (Array.isArray(attempt.sequence)) return attempt.sequence.filter(points => points === 2).length;
    return attempt.correct || 0;
  }

  function renderDailyWeek(streak) {
    const todayKey = todayUtcKey();
    const cells = dailyDays(7).map(day => {
      const first = day.attempt ? dailyFirstTries(day.attempt) : null;
      const cls = (first === 5 ? ' is-perfect' : '') + (day.key === todayKey ? ' is-today' : '') + (day.attempt ? ' is-played' : '');
      const said = day.name + ': ' + (day.attempt ? first + ' of 5 on the first try' : day.key === todayKey ? 'not played yet' : 'not played');
      return '<li' + (cls ? ' class="' + cls.trim() + '"' : '') + ' aria-label="' + said + '"><span aria-hidden="true">' + day.name.charAt(0) +
        '</span><i aria-hidden="true">' + (first === null ? '' : first) + '</i></li>';
    }).join('');
    return '<div class="daily-week">' +
      '<ol class="week" aria-label="Your last seven days">' + cells + '</ol>' +
      (streak > 0 ? '<span class="week-label"><b>' + streak + (streak === 1 ? ' day' : ' days') + '</b> running</span>' : '') +
    '</div>';
  }

  function renderDailyCard() {
    const dateKey = todayUtcKey();
    const attempt = getDailyAttempt(dateKey);
    const streak = calculateDailyStreak();
    const art = '<svg class="daily-art" viewBox="0 0 200 200" aria-hidden="true"><use href="#art-globe"/></svg>';
    const eyebrow = '<span class="eyebrow">Puzzle <b>No. ' + dailyPuzzleNumber(dateKey) + '</b></span>';

    if (!attempt) {
      return '<article class="daily" data-daily="unplayed" data-action="play-daily">' + art +
        '<div class="daily-top">' + eyebrow +
          '<span class="daily-count">' + icon('clock', 'icon--sm') + 'Resets in <span data-countdown="words"></span></span>' +
        '</div>' +
        '<div class="daily-body">' +
          '<h3 class="daily-title">The Daily Five</h3>' +
          '<p class="daily-desc">Five countries, easy to hard. The same puzzle for everyone, once a day.</p>' +
        '</div>' +
        '<div class="daily-foot">' + renderDailyWeek(streak) +
          '<button type="button" class="btn btn--inverse" data-action="play-daily">Play today’s five ' + icon('arrow') + '</button>' +
        '</div>' +
      '</article>';
    }

    const pct = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0;
    const said = { 2: 'first try', 1: 'second try', 0: 'missed' };
    const marks = (attempt.sequence || []).map(points =>
      '<li class="mark mark--' + (points === 2 ? 'first' : points === 1 ? 'second' : 'missed') + '" aria-label="' + said[points] + '">' +
        (points === 2 ? icon('check') : points === 1 ? '2' : icon('close')) + '</li>').join('');
    return '<article class="daily is-done" data-daily="played">' + art +
      '<div class="daily-top">' + eyebrow +
        '<span class="daily-count">' + icon('clock', 'icon--sm') + 'Next puzzle in <span data-countdown="clock"></span></span>' +
      '</div>' +
      '<div class="daily-body">' +
        '<h3 class="daily-title">Today’s puzzle complete</h3>' +
        '<div class="daily-result">' +
          '<ol class="marks" aria-label="Your five answers">' + marks + '</ol>' +
          '<p class="daily-score"><b>' + attempt.correct + '/' + attempt.total + ' found</b> · ' + attempt.score + ' pts · ' + pct + '%</p>' +
        '</div>' +
      '</div>' +
      '<div class="daily-foot">' + renderDailyWeek(streak) +
        '<div class="daily-actions">' +
          '<button type="button" class="btn btn--inverse daily-share-btn" data-action="share-daily">Share Result</button>' +
          '<button type="button" class="btn btn--secondary" data-action="replay-daily">Practice Replay</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  // Keeps the Daily Five card's countdown to the next puzzle (UTC midnight)
  // current: "5 h 12 m" on the card still to play, HH:MM:SS once played.
  // Each redraw of Today restarts it; it stops when the card is gone.
  function startDailyCountdown() {
    clearTimeout(startDailyCountdown._t);
    function tick() {
      const el = document.querySelector('[data-countdown]');
      if (!el) return;
      const next = new Date();
      next.setUTCHours(24, 0, 0, 0);
      const ms = next - new Date();
      // The day rolled over while the page sat open: show the new puzzle
      if (ms <= 0) { renderToday(); return; }
      const hrs = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      el.textContent = el.dataset.countdown === 'words'
        ? (hrs ? hrs + ' h ' : '') + mins + ' m'
        : String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      startDailyCountdown._t = setTimeout(tick, 1000);
    }
    tick();
  }

  function renderReviewCard() {
    const names = reviewDueNames();
    if (!names.length) {
      return '<section class="review review--empty" aria-label="Smart Review">' +
        '<span class="eyebrow">Smart Review</span>' +
        '<div class="review-body">' +
          '<span class="review-icon">' + icon('check', 'icon--lg') + '</span>' +
          '<div><strong>Nothing due</strong>' +
          '<p>Places you miss come back here when it is time to see them again.</p></div>' +
        '</div>' +
      '</section>';
    }
    const totals = mastery.totals();
    // A typical answer takes this player this long; eight seconds until there is history
    const perAnswer = totals.questions >= 20 ? Math.min(20, Math.max(4, totals.seconds / totals.questions)) : 8;
    const minutes = Math.max(1, Math.round(names.length * perAnswer / 60));
    const shown = names.slice(0, 2);
    return '<section class="review" aria-label="Smart Review">' +
      '<span class="eyebrow">Smart Review</span>' +
      '<div class="review-body">' +
        '<span class="num review-num">' + names.length + '</span>' +
        '<div><strong>' + (names.length === 1 ? 'place' : 'places') + ' due for review</strong>' +
        '<p>The ones you’re closest to forgetting. About ' + numberWord(minutes) + (minutes === 1 ? ' minute.' : ' minutes.') + '</p></div>' +
      '</div>' +
      '<div class="review-foot">' +
        '<div class="chips">' + shown.map(name => '<span class="chip">' + escapeHtml(name) + '</span>').join('') +
          (names.length > shown.length ? '<span class="chip chip--more">+' + (names.length - shown.length) + '</span>' : '') +
        '</div>' +
        '<button type="button" class="btn btn--primary" data-action="start-review">Start review</button>' +
      '</div>' +
    '</section>';
  }

  function renderToday() {
    const today = document.getElementById('home-today');
    if (!today) return;
    today.innerHTML = renderDailyCard() + renderReviewCard();
    startDailyCountdown();
  }

  /* ----- The Library ----- */

  const DIFFICULTY_INFO = {
    normal: { label: 'Normal', desc: 'Found targets stay marked on the map' },
    hard: { label: 'Hard', desc: 'No process of elimination — completed targets stay unmarked' },
    uncharted: { label: 'Uncharted', desc: 'Satellite only, no borders — a shape shows only once you answer' }
  };
  // Pin the City draws no names at any difficulty, so its three mean something else
  const PIN_DIFFICULTY_DESCS = {
    normal: 'Country borders drawn, no names',
    hard: 'No borders — just coastlines and your memory',
    uncharted: 'Satellite only, no borders'
  };

  // Difficulty picker. bests (optional): difficulty -> a line shown under its label.
  function renderDifficultySeg(extraClass, bests) {
    return '<div class="seg' + (extraClass ? ' ' + extraClass : '') + '" role="radiogroup" aria-label="Difficulty">' +
      Object.keys(DIFFICULTY_INFO).map(key =>
        '<button type="button" role="radio" data-action="set-difficulty" data-value="' + key + '">' +
          '<span>' + DIFFICULTY_INFO[key].label + '</span>' +
          (bests ? '<small>' + (bests[key] || 'No best yet') + '</small>' : '') +
        '</button>').join('') +
    '</div>';
  }

  function renderMapSeg(extraClass) {
    return '<div class="seg' + (extraClass ? ' ' + extraClass : '') + '" role="radiogroup" aria-label="Map style">' +
      '<button type="button" role="radio" data-action="set-map" data-value="parchment">' + icon('map', 'icon--sm') + 'Chart</button>' +
      '<button type="button" role="radio" data-action="set-map" data-value="satellite">' + icon('sat', 'icon--sm') + 'Satellite</button>' +
    '</div>';
  }

  // Bring every difficulty and map control on the page (Home's and the
  // level sheet's) in line with the settings. Uncharted is satellite only,
  // so the map control locks there.
  function syncPlayControls() {
    const uncharted = state.difficulty === 'uncharted';
    const satellite = uncharted || state.mapStyle === 'satellite';
    const mark = (btn, on) => {
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    };
    document.querySelectorAll('[data-action="set-difficulty"]').forEach(btn => mark(btn, btn.dataset.value === state.difficulty));
    document.querySelectorAll('[data-action="set-map"]').forEach(btn => {
      mark(btn, (btn.dataset.value === 'satellite') === satellite);
      btn.disabled = uncharted && btn.dataset.value !== 'satellite';
    });
    document.querySelectorAll('[data-difficulty-note]').forEach(el => {
      const descs = el.dataset.difficultyNote === 'pin' ? PIN_DIFFICULTY_DESCS : null;
      el.innerHTML = '<b>' + DIFFICULTY_INFO[state.difficulty].label + '</b> · ' +
        (descs ? descs[state.difficulty] : DIFFICULTY_INFO[state.difficulty].desc);
    });
    document.querySelectorAll('[data-map-note]').forEach(el => { el.hidden = !uncharted; });
  }

  function chooseDifficulty(difficulty) {
    if (difficulty === state.difficulty) return;
    setDifficulty(difficulty);
    saveDifficulty(state.difficulty);
    syncPlayControls();
    renderCollections();
    if (sheet.level) renderSheetInfo();
  }

  function chooseMapStyle(style) {
    if (state.difficulty === 'uncharted' || style === state.mapStyle) return;
    state.mapStyle = style;
    saveMapStyle(state.mapStyle);
    syncPlayControls();
  }

  // The Library's heading, controls and collection chips. Drawn once; the
  // collections under it are redrawn whenever progress or difficulty changes.
  function renderLibraryFrame() {
    const playable = LEVELS.filter(level => level.available).length;
    document.getElementById('home-library').innerHTML =
      '<div class="library-head">' +
        '<div>' +
          '<h2 class="display-l" id="library-title">The Library</h2>' +
          '<p>' + capitalize(numberWord(playable)) + ' levels in ' + numberWord(COLLECTIONS.length) + ' collections.</p>' +
        '</div>' +
        '<div>' +
          '<div class="playbar">' +
            '<div class="field"><span class="eyebrow">Difficulty</span>' + renderDifficultySeg() + '</div>' +
            '<div class="field"><span class="eyebrow">Map</span>' + renderMapSeg() + '</div>' +
          '</div>' +
          '<p class="playbar-note" data-difficulty-note></p>' +
        '</div>' +
      '</div>' +
      '<nav class="chips jump" aria-label="Collections">' +
        COLLECTIONS.map(collection =>
          '<button type="button" class="chip" data-action="jump" data-collection="' + collection.key + '">' + escapeHtml(collection.title) + '</button>').join('') +
      '</nav>' +
      '<div id="library-collections"></div>';
  }

  function renderLevelCard(level, lead) {
    const title = escapeHtml(level.title);
    if (!level.available) {
      return '<div class="level is-soon">' +
        '<span class="level-title">' + title + '</span>' +
        '<span class="level-sub"><span class="level-meta">Coming soon</span></span>' +
        '<span class="level-due"><span class="tag">Soon</span></span>' +
        '<span class="ring"></span>' +
      '</div>';
    }

    const summary = levelSummary(level);
    if (!summary) loadLevelData(level);
    const said = [level.title, levelCountText(level)];

    let meta = levelCountText(level);
    let best = '';
    if (level.mode === 'city-pin') {
      const stats = levelPinStats(level, state.difficulty);
      if (stats.games && stats.recentKm != null) meta += ' · avg ' + formatKm(stats.recentKm);
      if (stats.games) best = '<em>Best</em>' + levelBestText(level, state.difficulty);
    } else {
      const rec = levelRecord(level, state.difficulty);
      if (rec && rec.bestAccuracy) {
        best = '<em>Best</em>' + levelBestText(level, state.difficulty) +
          (rec.bestTime ? '<span class="t"><span class="sep">·</span>' + formatTimeSeconds(rec.bestTime.value) + '</span>' : '');
      }
    }
    const hasBest = !!best;
    const ladder = level.mode === 'province' ? getLearnProgress(level.arg) : null;
    const untouched = !!summary && !summary.seen && !ladder && !levelPlayed(level);
    if (hasBest) {
      said.push('best ' + levelBestText(level, state.difficulty).replace(' / ', ' of '));
    } else if (!untouched) {
      best = ladder ? 'Learning · level ' + ladder.level + ' of ' + ladder.order.length
        : levelPlayed(level) ? 'Not played on ' + DIFFICULTY_INFO[state.difficulty].label
        : 'Not played yet';
      said.push(best);
    }

    // Trailing slot: what there is to do here, if anything
    let due = '';
    if (summary && summary.due > 0) due = summary.due + ' due';
    else if (untouched) due = 'New';
    if (due) said.push(due);
    if (summary && summary.seen) said.splice(2, 0, summary.mastered + ' of ' + summary.total + ' mastered');

    const blurb = lead && LEAD_BLURBS[level.key];
    return '<a class="level' + (lead ? ' level--feature' : '') + (hasBest ? '' : ' no-best') + '" href="?play=' + level.key +
        '" data-action="open-level" data-level="' + level.key + '" aria-haspopup="dialog" aria-label="' + escapeHtml(said.join(', ')) + '">' +
      '<span class="level-title">' + title + '</span>' +
      '<span class="level-sub"><span class="level-meta">' + meta + '</span>' + (best ? '<span class="level-best">' + best + '</span>' : '') + '</span>' +
      (blurb ? '<span class="level-blurb">' + blurb + '</span>' : '') +
      '<span class="level-due' + (summary && summary.due > 0 ? ' is-due' : '') + '">' + due + '</span>' +
      renderRing(summary) +
    '</a>';
  }

  function renderCollections() {
    const container = document.getElementById('library-collections');
    if (!container) return;
    const focused = document.activeElement && container.contains(document.activeElement)
      ? document.activeElement.dataset.level : null;

    container.innerHTML = COLLECTIONS.map(collection => {
      const levels = LEVELS.filter(level => level.collection === collection.key);
      const sum = addSummaries(skillSummaries(levels));
      // Seven cards sit as a wide lead plus two rows of three; six as two rows of three
      const lead = levels.length % 4 === 3;
      const three = !lead && levels.length % 3 === 0 && levels.length % 4 !== 0;
      return '<section class="collection" id="collection-' + collection.key + '" aria-labelledby="collection-' + collection.key + '-title">' +
        '<header class="collection-head">' +
          '<span class="collection-icon">' + icon(collection.icon) + '</span>' +
          '<h3 class="collection-title" id="collection-' + collection.key + '-title">' + escapeHtml(collection.title) + '</h3>' +
          '<p class="collection-desc">' + escapeHtml(collection.desc) + '.</p>' +
          '<span class="collection-sum">' + renderMasteryBar(sum) +
            '<span><b>' + sum.mastered.toLocaleString('en-US') + '</b> of ' + sum.total.toLocaleString('en-US') + '<span class="x"> mastered</span></span>' +
          '</span>' +
        '</header>' +
        '<div class="levels' + (three ? ' levels--three' : '') + '">' +
          levels.map((level, i) => renderLevelCard(level, lead && i === 0)).join('') +
        '</div>' +
      '</section>';
    }).join('');

    if (focused) {
      const card = container.querySelector('[data-level="' + focused + '"]');
      if (card) card.focus({ preventScroll: true });
    }
  }

  function jumpToCollection(key) {
    const section = document.getElementById('collection-' + key);
    if (section) section.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* =========================================================
   * SMART REVIEW (what is due, as a playlist of practice rounds)
   *
   * Due names come from the mastery store, skill by skill. Each is handed
   * to a level that can quiz exactly those names as a practice round, so a
   * review never touches records or focus lists. The rounds run largest
   * first; after each, the results screen offers the next.
   * ========================================================= */

  // Skills taught by several levels name the one that hosts their reviews.
  // The rest (cities, provinces) go to whichever level holds each name.
  const REVIEW_HOSTS = { 'country': 'world', 'us-state': 'us-state', 'us-capital': 'us-state-to-capital' };

  // The levels that can run reviews for a skill; none for Pin the City,
  // whose practice rounds would be saved as full games
  function reviewLevels(skill) {
    if (REVIEW_HOSTS[skill]) return [levelByKey(REVIEW_HOSTS[skill])];
    return LEVELS.filter(level => level.skill === skill && level.available && level.mode !== 'city-pin');
  }

  // For each reviewable skill, the names pick(skill) returns, with the
  // levels that can quiz them: [{ skill, levels, names }], skills with no
  // names left out. Names the store still holds for something no level
  // asks any more are dropped, as far as the maps loaded so far can tell.
  function reviewGroups(pick) {
    const skills = [];
    LEVELS.forEach(level => {
      if (level.available && level.mode !== 'city-pin' && skills.indexOf(level.skill) === -1) skills.push(level.skill);
    });
    return skills.map(skill => {
      const levels = reviewLevels(skill);
      let names = pick(skill);
      if (levels.every(level => level.ready())) {
        const asked = new Set();
        levels.forEach(level => level.names().forEach(name => asked.add(name)));
        names = names.filter(name => asked.has(name));
      }
      return { skill: skill, levels: levels, names: names };
    }).filter(group => group.names.length > 0);
  }

  // Due names per reviewable skill, biggest group first
  function reviewDue() {
    return reviewGroups(skill => mastery.due(skill)).sort((a, b) => b.names.length - a.names.length);
  }

  function reviewDueNames() {
    return reviewDue().reduce((all, group) => all.concat(group.names), []);
  }

  function reviewDueCount() {
    return reviewDueNames().length;
  }

  // Resolves to the groups' names as practice rounds, largest first:
  // [{ level, names }]. Loads the maps it needs; a skill whose map can't be
  // fetched is left for another day.
  async function buildReviewPlaylist(groups) {
    const steps = [];
    for (const group of groups) {
      try {
        await Promise.all(group.levels.map(level => level.load()));
      } catch (err) {
        continue;
      }
      const left = new Set(group.names);
      group.levels.forEach(level => {
        const names = level.names().filter(name => left.has(name));
        names.forEach(name => left.delete(name));
        if (names.length) steps.push({ level: level, names: names });
      });
    }
    return steps.sort((a, b) => b.names.length - a.names.length);
  }

  // Play a review: of everything due, or of the given groups of names
  async function startReview(groups) {
    if (startReview.busy) return;
    startReview.busy = true;
    showLoadingOverlay('Gathering your review');
    let steps = [];
    try {
      steps = await buildReviewPlaylist(groups || reviewDue());
    } finally {
      hideLoadingOverlay();
      startReview.busy = false;
    }
    if (!steps.length) {
      renderToday();
      showNotice('Nothing could be gathered for review just now.');
      return;
    }
    state.review = { queue: steps };
    startNextReview();
  }

  // Play the next round of the review in progress
  function startNextReview() {
    const review = state.review;
    const step = review && review.queue.shift();
    if (!step) return;
    startGame(step.level.arg, { practice: step.names, review: review });
  }

  // The results action that carries a review on: "Next: 6 states" while
  // rounds are left, hidden otherwise
  function showReviewNext() {
    const step = state.review && state.review.queue[0];
    const btn = document.getElementById('review-next-btn');
    btn.style.display = step ? '' : 'none';
    if (step) btn.textContent = 'Next: ' + countNoun(step.names.length, step.level.noun);
  }

  /* =========================================================
   * LEVEL SHEET (what a level card opens)
   *
   * One dialog per level: its mastery, bests at each difficulty, the ways
   * to play it (a full round; focus practice when the last full round left
   * a list; Learn for province levels), difficulty and map style, and
   * Start. Centred on wide windows, a bottom sheet on phones.
   * ========================================================= */

  // What a round of each mode asks for, in a few words
  const MODE_HOW = {
    'world-country': 'find each on the map',
    'us-state': 'find each on the map',
    'us-capital-to-state': 'a capital is named, find its state',
    'us-state-to-capital': 'a state is shown, pick its capital',
    'us-city': 'find each city on the map',
    'city-pin': 'drop a pin, score by how close you land',
    'province': 'find each on the map'
  };

  // The level on show (null when closed), the way to play picked in it, and
  // the card that opened it, which gets the focus back
  const sheet = { level: null, way: 'play', opener: null };

  function openLevelSheet(key, opener) {
    const level = levelByKey(key);
    if (!level || !level.available) return;
    sheet.level = level;
    sheet.way = 'play';
    sheet.opener = opener || null;
    renderSheetInfo();
    renderSheetPlay();
    document.getElementById('level-sheet-scrim').hidden = false;
    document.getElementById('level-sheet').hidden = false;
    document.getElementById('sheet-start-btn').focus();
    // A province map that isn't in yet: fetch it now, so the breakdown can
    // fill in and Start has nothing left to wait for
    if (!level.ready()) {
      level.load().then(() => {
        if (sheet.level === level) renderSheetInfo();
        refreshView();
      }, () => { /* Start will try again and say so if it still can't */ });
    }
  }

  // opts.keepFocus: leave the focus where it is (a round is about to start)
  function closeLevelSheet(opts) {
    if (!sheet.level) return;
    const key = sheet.level.key;
    const opener = sheet.opener;
    sheet.level = null;
    sheet.opener = null;
    document.getElementById('level-sheet-scrim').hidden = true;
    document.getElementById('level-sheet').hidden = true;
    if (opts && opts.keepFocus) return;
    // The library may have been redrawn since: find the card again by its level
    const card = opener && document.contains(opener) ? opener : document.querySelector('[data-level="' + key + '"]');
    if (card) card.focus({ preventScroll: true });
  }

  function renderSheetInfo() {
    const level = sheet.level;
    const collection = COLLECTIONS.find(c => c.key === level.collection);
    const round = PROVINCE_ROUNDS[level.arg];
    const summary = levelSummary(level);
    const pin = level.mode === 'city-pin';
    const dash = '—';

    let mastered = '';
    if (summary) {
      const step = (n, cls, label) =>
        '<div><dd class="num">' + n + '</dd><dt><i class="swatch' + (cls ? ' ' + cls : '') + '"></i>' + label + '</dt></div>';
      mastered =
        '<div class="sheet-block">' +
          '<p class="eyebrow">Your mastery <span class="muted">' + summary.mastered + ' of ' + summary.total + ' mastered</span></p>' +
          renderMasteryBar(summary, 'mbar--lg') +
          '<dl class="breakdown">' +
            step(summary.mastered, 'm3', 'Mastered') + step(summary.familiar, 'm2', 'Familiar') +
            step(summary.learning, 'm1', 'Learning') + step(summary.new, '', 'New') +
          '</dl>' +
        '</div>';
    }

    let rows = '';
    let games = 0;
    let last = 0;
    Object.keys(DIFFICULTY_INFO).forEach(d => {
      let cells;
      if (pin) {
        const stats = levelPinStats(level, d);
        games += stats.games;
        cells = stats.games
          ? '<td class="is-strong">' + stats.best.toLocaleString('en-US') + '</td><td>' + Math.round(stats.recentAvg).toLocaleString('en-US') +
            '</td><td>' + (stats.recentKm != null ? formatKm(stats.recentKm) : dash) + '</td><td>' + stats.games + '</td>'
          : null;
      } else {
        const rec = levelRecord(level, d);
        if (rec) {
          games += rec.gamesPlayed || 0;
          last = Math.max(last, new Date(rec.lastPlayed).getTime() || 0);
        }
        cells = rec && rec.bestAccuracy
          ? '<td class="is-strong">' + rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total + '</td><td>' +
            (rec.bestTime ? formatTimeSeconds(rec.bestTime.value) : dash) + '</td><td>' + rec.bestAccuracy.pct + '%</td><td>' + (rec.gamesPlayed || 0) + '</td>'
          : null;
      }
      rows += '<tr class="' + (d === state.difficulty ? 'is-current' : '') + (cells ? '' : ' is-empty') + '">' +
        '<th scope="row">' + DIFFICULTY_INFO[d].label + '</th>' +
        (cells || '<td>' + dash + '</td><td>' + dash + '</td><td>' + dash + '</td><td>0</td>') + '</tr>';
    });
    if (pin) {
      const store = loadPinStore().games.filter(g => g.region === resolveGameTarget(level.arg).region);
      last = store.reduce((m, g) => Math.max(m, g.at || 0), 0);
    }
    const head = pin ? ['Best', 'Average', 'Avg miss', 'Rounds'] : ['Best', 'Time', 'Accuracy', 'Rounds'];
    let note = games ? (games === 1 ? '1 round' : games + ' rounds') + ' in all' : 'No full round played yet';
    if (games && last) {
      note = 'Last played ' + new Date(last).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + note;
    }
    if (pin) {
      note += '. 100 points within ' + PIN_PERFECT_KM + ' km of the city · ' + pinPoints(100) + ' at 100 km · ' +
        pinPoints(250) + ' at 250 km · ' + pinPoints(500) + ' at 500 km · ' + pinPoints(1000) + ' at 1,000 km';
    }

    document.getElementById('sheet-info').innerHTML =
      '<header class="sheet-head">' +
        '<p class="eyebrow">' + escapeHtml(collection.title) + '</p>' +
        '<h2 class="display-l" id="sheet-title">' + escapeHtml(level.title) + '</h2>' +
        '<p class="sheet-sub">' + (round ? capitalize(round.subname) : levelCountText(level)) +
          '<span class="x"> · ' + MODE_HOW[level.mode] + '</span></p>' +
      '</header>' +
      mastered +
      '<div class="sheet-block sheet-block--bests">' +
        '<p class="eyebrow">Personal bests</p>' +
        '<table class="bests">' +
          '<thead><tr><th scope="col">Difficulty</th>' + head.map(h => '<th scope="col">' + h + '</th>').join('') + '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
        '<p class="sheet-note">' + note + '</p>' +
      '</div>';
  }

  // The ways to play this level: [{ key, icon, title, desc, count }]
  function sheetWays(level) {
    const count = level.count();
    const drawn = level.mode === 'city-pin' && count > PIN_ROUND_SIZE;
    const ways = [{
      key: 'play', icon: 'play', title: 'Play',
      desc: (drawn ? capitalize(numberWord(PIN_ROUND_SIZE)) + ' cities drawn from ' + count : 'All ' + countNoun(count, level.noun) + ', in random order') +
        ' · counts toward your records'
    }];
    const focus = levelFocusList(level);
    if (focus) {
      const n = focus.names.length;
      const savedOn = new Date(focus.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ways.push({
        key: 'focus', icon: 'focus', title: 'Focus Practice', count: n,
        desc: (n === 1 ? 'The one' : 'The ' + numberWord(n)) + ' you missed or needed two tries for in your last full game (' + savedOn +
          ') · practice only'
      });
    }
    if (level.mode === 'province') {
      const ladder = getLearnProgress(level.arg);
      ways.push({
        key: 'learn', icon: 'learn', title: ladder ? 'Keep Learning' : 'Learn Them',
        desc: (ladder ? 'Pick up at level ' + ladder.level + ' of ' + ladder.order.length + ' · ' : '') +
          'Start with one, add one each level. A miss restarts the level · practice only'
      });
    }
    return ways;
  }

  function renderSheetPlay() {
    const level = sheet.level;
    const ways = sheetWays(level);
    if (!ways.some(way => way.key === sheet.way)) sheet.way = 'play';
    const bests = {};
    Object.keys(DIFFICULTY_INFO).forEach(d => { bests[d] = levelBestText(level, d); });
    const ladder = level.mode === 'province' ? getLearnProgress(level.arg) : null;

    document.getElementById('sheet-play').innerHTML =
      '<div>' +
        '<p class="eyebrow" id="sheet-ways-label">Ways to play</p>' +
        '<div class="modes" role="radiogroup" aria-labelledby="sheet-ways-label">' +
          ways.map(way =>
            '<button type="button" class="mode" role="radio" data-action="sheet-way" data-value="' + way.key + '" aria-checked="' + (way.key === sheet.way) +
              '" tabindex="' + (way.key === sheet.way ? 0 : -1) + '">' +
              '<span class="mode-icon">' + icon(way.icon) + '</span>' +
              '<span class="mode-text"><strong>' + way.title + (way.count ? ' <i class="count">' + way.count + '</i>' : '') + '</strong>' +
                '<span>' + way.desc + '</span></span>' +
              '<span class="radio"></span>' +
            '</button>').join('') +
        '</div>' +
        (ladder ? '<button type="button" class="link sheet-reset" data-action="sheet-learn-reset">Start learning over from one</button>' : '') +
      '</div>' +
      '<div class="sheet-options">' +
        '<div class="option">' +
          '<p class="eyebrow">Difficulty</p>' +
          renderDifficultySeg('seg--block seg--rich', bests) +
          '<p class="option-note" data-difficulty-note="' + (level.mode === 'city-pin' ? 'pin' : '') + '"></p>' +
        '</div>' +
        '<div class="option">' +
          '<p class="eyebrow">Map</p>' +
          renderMapSeg('seg--block') +
          '<p class="option-note" data-map-note hidden>Always on in Uncharted</p>' +
        '</div>' +
      '</div>';
    syncPlayControls();
    renderSheetStart();
  }

  // Start's label says what is about to begin
  function renderSheetStart() {
    const level = sheet.level;
    let what = levelCountText(level);
    if (sheet.way === 'focus') {
      const focus = levelFocusList(level);
      what = focus ? focus.names.length + ' to revisit' : what;
    } else if (sheet.way === 'learn') {
      const ladder = getLearnProgress(level.arg);
      what = ladder ? 'level ' + ladder.level + ' of ' + ladder.order.length : 'from one';
    }
    document.getElementById('sheet-start-btn').innerHTML =
      (sheet.way === 'learn' ? 'Learn' : 'Start') + ' <span class="btn-count">· ' + what + '</span>' + icon('arrow');
  }

  function chooseSheetWay(way) {
    sheet.way = way;
    document.querySelectorAll('[data-action="sheet-way"]').forEach(btn => {
      const on = btn.dataset.value === way;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    renderSheetStart();
  }

  // Start the level the way the sheet says. opts.learnFresh: begin the
  // Learn ladder again from one.
  function startFromSheet(opts) {
    const level = sheet.level;
    if (!level) return;
    const way = opts && opts.learnFresh ? 'learn' : sheet.way;
    const focus = levelFocusList(level);
    closeLevelSheet({ keepFocus: true });
    if (way === 'learn') startGame(level.arg, { learn: true, learnFresh: !!(opts && opts.learnFresh) });
    else if (way === 'focus' && focus) startGame(level.arg, { practice: focus.names });
    else startGame(level.arg);
  }

  // In the dialog or the level sheet, whichever is on top: Escape closes
  // it, Tab stays inside it, and Enter in a field presses its main button
  document.addEventListener('keydown', (e) => {
    if (!dialog.open && !sheet.level) return;
    const panel = document.getElementById(dialog.open ? 'dialog' : 'level-sheet');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dialog.open) closeDialog();
      else closeLevelSheet();
      return;
    }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      const submit = panel.querySelector('[data-submit]');
      if (submit && !submit.disabled) {
        e.preventDefault();
        submit.click();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const stops = Array.from(panel.querySelectorAll('button, a[href], input, textarea, [tabindex]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!panel.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // Arrow keys move through a radio group and pick as they go, the way
  // native radio buttons do
  document.addEventListener('keydown', (e) => {
    const radio = e.target && e.target.getAttribute && e.target.getAttribute('role') === 'radio' ? e.target : null;
    if (!radio) return;
    const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
    if (!step) return;
    const group = radio.closest('[role="radiogroup"]');
    const radios = group ? Array.from(group.querySelectorAll('[role="radio"]')).filter(el => !el.disabled) : [];
    if (radios.length < 2) return;
    e.preventDefault();
    const next = radios[(radios.indexOf(radio) + step + radios.length) % radios.length];
    next.focus();
    next.click();
  });

  /* =========================================================
   * STATS (the progress page)
   *
   * Drawn into #stats-content from the stores as they stand: the mastery
   * store for the headline figures, the breakdown by collection and
   * level, the calendar and the places that need work; atlas-records for
   * the bests; atlas-daily-attempts and atlas-pin for their own panels.
   * Every value is printed on the page; nothing waits behind a hover.
   * ========================================================= */

  const STATS_WEEKS = 12;
  // Answers in a day that reach each calendar shade, lightest first
  const HEAT_STEPS = [1, 25, 75, 150];
  const WEAK_ROWS = 8;
  // A place needs work while its first-try rate is under this
  const WEAK_BELOW = 0.7;
  const DAILY_STRIP_DAYS = 30;
  const PIN_TREND_ROUNDS = 12;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Which collections are opened out into their levels in the mastery
  // table: every one on a wide window, none on a phone, then as toggled
  const statsOpen = new Map();
  // The phone's records list starts with this many rows; the rest follow a tap
  const RECORDS_SHORT = 6;
  let statsAllRecords = false;

  function formatCount(n) {
    return n.toLocaleString('en-US');
  }

  // Seconds as a figure with small units: "7h 05m", or "42m" under an hour
  function durationFigure(seconds) {
    const mins = Math.round(seconds / 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? h + '<small>h</small>' + String(m).padStart(2, '0') + '<small>m</small>' : m + '<small>m</small>';
  }

  // Seconds in running text: "7 h 5 min", "42 min"
  function durationText(seconds) {
    const mins = Math.round(seconds / 60);
    const h = Math.floor(mins / 60);
    return (h ? h + '\u00a0h\u00a0' : '') + (mins % 60) + '\u00a0min';
  }

  // "12 Nov", with the year when it isn't this one
  function shortDate(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] +
      (date.getFullYear() === new Date().getFullYear() ? '' : ' ' + date.getFullYear());
  }

  // A stored 'YYYY-MM-DD' as a date on the local calendar
  function dateFromKey(key) {
    const parts = String(key).slice(0, 10).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  // Totals over rows of mastery.activity()
  function sumActivity(days) {
    return days.reduce((sum, day) => {
      sum.games += day.games;
      sum.questions += day.questions;
      sum.firstTry += day.firstTry;
      sum.seconds += day.seconds;
      if (day.games) sum.active++;
      return sum;
    }, { games: 0, questions: 0, firstTry: 0, seconds: 0, active: 0 });
  }

  // The smallest round number at or above v, for the end of an axis
  function niceCeil(v) {
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
    return [1, 2, 2.5, 4, 5, 8, 10].map(step => step * mag).find(end => end >= v);
  }

  function renderEmpty(text, action) {
    return '<div class="empty"><p>' + text + '</p>' + (action || '') + '</div>';
  }

  function renderStats() {
    // Totals wait for the world map's country count, as Home does; without
    // a map at all, the page shows what the stores hold
    if (!state.allFeatures.length && !state.worldFailed) return;
    document.getElementById('stats-content').innerHTML =
      '<header class="page-head"><div>' +
        '<p class="eyebrow">Your atlas</p>' +
        '<h1 class="display-l">Statistics</h1>' +
        (isNewPlayer() ? '<p>Nothing has been played on this device yet. Each panel fills in as you play.</p>' : '') +
      '</div></header>' +
      renderStatsFigures() +
      '<div class="panels">' +
        renderStatsMastery() + renderStatsActivity() + renderStatsWeak() + renderStatsDaily() +
        renderStatsPin() + renderStatsRecords() +
      '</div>';
  }

  /* ----- Headline figures ----- */

  function renderStatsFigures() {
    const totals = mastery.totals();
    const all = addSummaries(skillSummaries(LEVELS));
    const days = mastery.activity(60);
    const month = sumActivity(days.slice(30));
    const before = sumActivity(days.slice(0, 30));
    const week = sumActivity(days.slice(-7));
    const streak = mastery.streak();
    const kpi = (label, value, sub, extra) =>
      '<div class="kpi"><dt class="eyebrow">' + label + '</dt>' +
        '<dd class="num' + (value === null ? ' is-empty' : '') + '">' + (value === null ? '—' : value) + '</dd>' +
        (extra || '') + '<span class="kpi-sub">' + sub + '</span></div>';

    const pct = month.questions ? Math.round(month.firstTry / month.questions * 100) : null;
    let accuracySub = 'last 30 days';
    // Compared with the month before, once that month has enough answers to mean something
    if (pct !== null && before.questions >= 20) {
      const change = pct - Math.round(before.firstTry / before.questions * 100);
      accuracySub = change === 0 ? 'last 30 days, level with the 30 before'
        : '<b>' + (change > 0 ? '+' : '−') + Math.abs(change) + (Math.abs(change) === 1 ? ' pt' : ' pts') + '</b> on the 30 days before';
    }

    return '<dl class="kpis" aria-label="Your progress">' +
      kpi('Places mastered',
        totals.itemsSeen ? formatCount(all.mastered) + '<span class="of">of ' + formatCount(all.total) + '</span>' : null,
        totals.itemsSeen ? formatCount(all.familiar) + ' familiar · ' + formatCount(all.learning) + ' learning · ' + formatCount(all.new) + ' new'
          : 'of ' + formatCount(all.total) + ' places',
        totals.itemsSeen ? renderMasteryBar(all) : '') +
      kpi('First-try accuracy', pct === null ? null : pct + '<small>%</small>', accuracySub) +
      kpi('Day streak', totals.games ? streak.current : null,
        totals.games ? 'longest ' + streak.longest + (streak.longest === 1 ? ' day' : ' days') : 'starts with a round') +
      kpi('Rounds played', totals.games ? formatCount(totals.games) : null,
        totals.games ? formatCount(week.games) + ' in the last 7 days' : 'none yet') +
      kpi('Time played', totals.seconds ? durationFigure(totals.seconds) : null,
        totals.seconds && totals.daysActive ? 'about ' + Math.max(1, Math.round(totals.seconds / totals.daysActive / 60)) + ' min on a day you play' : 'none yet') +
    '</dl>';
  }

  /* ----- Mastery by collection and level ----- */

  function renderStatsMastery() {
    const wide = !window.matchMedia || window.matchMedia('(min-width: 761px)').matches;
    const count = (n, unit) => '<td class="mtable-n' + (n ? '' : ' is-zero') + '">' + formatCount(n) +
      '<span class="mtable-unit"> ' + unit + '</span></td>';
    // The cells after a row's name; a level whose names aren't in yet says so
    const cells = summary => summary
      ? '<td class="mtable-bar">' + renderMasteryBar(summary, 'mbar--sm') + '</td>' +
        count(summary.mastered, 'mastered') + count(summary.familiar, 'familiar') +
        count(summary.learning, 'learning') + count(summary.new, 'new') +
        '<td class="mtable-total">of ' + formatCount(summary.total) + '</td>'
      : '<td class="mtable-bar"></td><td class="mtable-n" colspan="4">Loading</td><td class="mtable-total"></td>';

    const groups = COLLECTIONS.map(collection => {
      const levels = LEVELS.filter(level => level.collection === collection.key && level.available);
      if (!statsOpen.has(collection.key)) statsOpen.set(collection.key, wide);
      const open = statsOpen.get(collection.key);
      return '<tbody>' +
        '<tr class="mtable-group"><th scope="row">' +
          '<button type="button" class="mtable-toggle" data-action="toggle-stats-group" data-collection="' + collection.key +
            '" aria-expanded="' + open + '">' + icon('chevron', 'icon--sm') + escapeHtml(collection.title) + '</button></th>' +
          cells(addSummaries(skillSummaries(levels))) +
        '</tr>' +
        levels.map(level => {
          const summary = levelSummary(level);
          if (!summary) loadLevelData(level);
          return '<tr class="mtable-level"' + (open ? '' : ' hidden') + '><th scope="row">' + escapeHtml(level.title) + '</th>' +
            cells(summary) + '</tr>';
        }).join('') +
      '</tbody>';
    }).join('');

    const step = (cls, name) => '<th scope="col" class="mtable-n"><span class="swatch' + (cls ? ' ' + cls : '') + '"></span><span class="vh">' + name + '</span></th>';
    return '<section class="panel panel--7 panel--tall" aria-labelledby="stats-mastery-title">' +
      '<div class="panel-head">' +
        '<div><h2 id="stats-mastery-title">Mastery</h2><p>How well each place has stuck, by collection and level.</p></div>' +
        '<div class="legend" aria-hidden="true">' +
          '<span><i class="swatch m3"></i>Mastered</span><span><i class="swatch m2"></i>Familiar</span>' +
          '<span><i class="swatch m1"></i>Learning</span><span><i class="swatch"></i>New</span>' +
        '</div>' +
      '</div>' +
      '<table class="mtable">' +
        '<thead><tr><th scope="col"><span class="vh">Collection or level</span></th><th scope="col"><span class="vh">Share</span></th>' +
          step('m3', 'Mastered') + step('m2', 'Familiar') + step('m1', 'Learning') + step('', 'New') +
          '<th scope="col" class="mtable-total"><span class="vh">Places</span></th></tr></thead>' +
        groups +
      '</table>' +
    '</section>';
  }

  // Open or close one collection's levels in the mastery table
  function toggleStatsGroup(button) {
    const open = !statsOpen.get(button.dataset.collection);
    statsOpen.set(button.dataset.collection, open);
    button.setAttribute('aria-expanded', String(open));
    button.closest('tbody').querySelectorAll('.mtable-level').forEach(row => { row.hidden = !open; });
  }

  /* ----- Activity calendar ----- */

  function renderStatsActivity() {
    const all = mastery.activity(STATS_WEEKS * 7);
    // Columns are weeks that run Monday to Sunday; the last one holds today
    const weekday = (dateFromKey(all[all.length - 1].date).getDay() + 6) % 7;
    const shown = all.slice(all.length - ((STATS_WEEKS - 1) * 7 + weekday + 1));
    const sum = sumActivity(shown);

    let cells = '';
    for (let i = 0; i < STATS_WEEKS * 7; i++) {
      const day = shown[i];
      if (!day) {
        cells += '<i class="is-future"></i>';
        continue;
      }
      const shade = HEAT_STEPS.filter(min => day.questions >= min).length;
      cells += '<i class="h' + shade + (i === shown.length - 1 ? ' is-today' : '') + '"></i>';
    }
    let months = '';
    let sums = '';
    for (let w = 0; w < STATS_WEEKS; w++) {
      const month = dateFromKey(shown[w * 7].date).getMonth();
      const turned = w === 0 || month !== dateFromKey(shown[(w - 1) * 7].date).getMonth();
      months += '<span>' + (turned ? MONTHS[month] : '') + '</span>';
      sums += '<span>' + (sumActivity(shown.slice(w * 7, w * 7 + 7)).questions || '–') + '</span>';
    }
    const legend = '<span><i></i>0</span>' + HEAT_STEPS.map((min, i) =>
      '<span><i class="h' + (i + 1) + '"></i>' + (i + 1 < HEAT_STEPS.length ? min + '–' + (HEAT_STEPS[i + 1] - 1) : min + '+') + '</span>').join('');

    return '<section class="panel panel--5" aria-labelledby="stats-activity-title">' +
      '<div class="panel-head"><div><h2 id="stats-activity-title">Activity</h2>' +
        '<p>Answers each day over the last ' + STATS_WEEKS + ' weeks, and each week’s total.</p></div></div>' +
      '<div class="cal">' +
        '<div class="cal-months" aria-hidden="true">' + months + '</div>' +
        '<div class="cal-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>' +
        '<div class="cal-grid" role="img" aria-label="' + (sum.active
          ? sum.active + ' active days in the last ' + STATS_WEEKS + ' weeks'
          : 'No activity in the last ' + STATS_WEEKS + ' weeks') + '">' + cells + '</div>' +
        '<span class="cal-sums-label">Week</span>' +
        '<div class="cal-sums" aria-label="Answers each week, oldest first">' + sums + '</div>' +
      '</div>' +
      '<div class="panel-foot cal-foot">' +
        '<span>' + (sum.games
          ? '<b>' + sum.active + '</b> active ' + (sum.active === 1 ? 'day' : 'days') + ' · <b>' + formatCount(sum.games) + '</b> ' + (sum.games === 1 ? 'round' : 'rounds') +
            ' · <b>' + formatCount(sum.questions) + '</b> answers · <b>' + durationText(sum.seconds) + '</b>'
          : 'No rounds in these weeks. A day lights up once you finish one.') + '</span>' +
        '<span class="heat-legend" aria-label="Answers in a day">' + legend + '</span>' +
      '</div>' +
    '</section>';
  }

  /* ----- Needs work ----- */

  // What a skill's places are called in a list that mixes skills
  function skillLabel(skill) {
    if (skill.indexOf('province:') === 0) {
      const country = PROVINCE_COUNTRIES[skill.slice('province:'.length)];
      if (country) return country.name;
    }
    const named = { 'country': 'Countries', 'us-state': 'US states', 'us-capital': 'US capitals', 'us-city': 'US cities' };
    if (named[skill]) return named[skill];
    const level = LEVELS.find(l => l.skill === skill);
    return level ? capitalize(level.noun) : 'Places';
  }

  // The places with the lowest first-try rates among those a practice
  // round can quiz, weakest first: [{ skill, name, item }]
  function weakPlaces() {
    const rows = [];
    reviewGroups(skill => mastery.weakest(skill)).forEach(group => {
      group.names.forEach(name => {
        const item = mastery.get(group.skill, name);
        if (item.accuracy !== null && item.accuracy < WEAK_BELOW) rows.push({ skill: group.skill, name: name, item: item });
      });
    });
    return rows.sort((a, b) => a.item.accuracy - b.item.accuracy || b.item.missed - a.item.missed || b.item.last - a.item.last)
      .slice(0, WEAK_ROWS);
  }

  // Practice the places listed under Needs work, as a review playlist
  function startWeakPractice() {
    const bySkill = new Map();
    weakPlaces().forEach(row => {
      if (!bySkill.has(row.skill)) bySkill.set(row.skill, []);
      bySkill.get(row.skill).push(row.name);
    });
    startReview(Array.from(bySkill, ([skill, names]) => ({ skill: skill, levels: reviewLevels(skill), names: names })));
  }

  function renderStatsWeak() {
    const rows = weakPlaces();
    const list = rows.map((row, i) => {
      const pct = Math.round(row.item.accuracy * 100);
      return '<li><span class="weak-rank">' + (i + 1) + '</span>' +
        '<div><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(skillLabel(row.skill)) + ' · ' +
          'first try ' + row.item.first + ' of ' + row.item.seen + '</small></div>' +
        '<span class="meter" aria-hidden="true"><i style="--v:' + pct + '"></i></span>' +
        '<span class="weak-pct">' + pct + '%</span></li>';
    }).join('');
    const limit = Math.round(WEAK_BELOW * 100) + '%';
    return '<section class="panel panel--5" aria-labelledby="stats-weak-title">' +
      '<div class="panel-head"><div><h2 id="stats-weak-title">Needs work</h2>' +
        '<p>Your weakest places, by how often the first try lands.</p></div></div>' +
      (rows.length
        ? '<ol class="weak">' + list + '</ol>' +
          '<div class="panel-foot"><span>Seen at least twice, first try under ' + limit + '</span>' +
            '<button type="button" class="btn btn--primary" data-action="practice-weak">Practice ' +
              (rows.length === 1 ? 'this one' : 'these ' + rows.length) + '</button></div>'
        : renderEmpty(mastery.totals().itemsSeen
          ? 'Nothing needs work. Every place you have seen twice or more lands on the first try at least ' + limit + ' of the time.'
          : 'Nothing here yet. Once a place has been asked twice and keeps slipping, it is listed here with a way to practice it.')) +
    '</section>';
  }

  /* ----- Daily Five ----- */

  function renderStatsDaily() {
    const days = dailyDays(DAILY_STRIP_DAYS);
    const played = days.filter(day => day.attempt);
    const head = '<div class="panel-head"><div><h2 id="stats-daily-title">Daily Five</h2>' +
      '<p>One puzzle a day, scored out of 10. The last ' + DAILY_STRIP_DAYS + ' days.</p></div></div>';
    if (!played.length) {
      return '<section class="panel" aria-labelledby="stats-daily-title">' + head +
        renderEmpty('No Daily Five in the last ' + DAILY_STRIP_DAYS + ' days. Each day you play appears here with its score, and your streak starts counting.',
          '<button type="button" class="btn btn--secondary" data-action="play-daily">Play today’s five ' + icon('arrow') + '</button>') +
      '</section>';
    }

    let best = 0;
    let run = 0;
    days.forEach(day => {
      run = day.attempt ? run + 1 : 0;
      best = Math.max(best, run);
    });
    const scores = played.map(day => day.attempt.score || 0);
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    const perfect = played.filter(day => day.attempt.score === day.attempt.total * 2).length;
    // Rounds counted in the records reach back before these thirty days
    const ever = Object.keys(DIFFICULTY_INFO).reduce((n, difficulty) => {
      const rec = getRecords('Daily', difficulty, 'daily-five');
      return n + (rec ? rec.gamesPlayed || 0 : 0);
    }, 0);
    const fig = (label, value, unit) => '<div><dt class="eyebrow">' + label + '</dt><dd class="num">' + value +
      (unit ? '<small>' + unit + '</small>' : '') + '</dd></div>';

    const todayKey = todayUtcKey();
    const strip = days.map(day => {
      const date = dateFromKey(day.key);
      const said = shortDate(date) + ': ' + (day.attempt ? day.attempt.score + ' of ' + day.attempt.total * 2 : 'not played');
      const cls = (day.attempt ? ' is-played' : '') + (day.attempt && day.attempt.score === day.attempt.total * 2 ? ' is-perfect' : '') +
        (day.key === todayKey ? ' is-today' : '');
      return '<li' + (cls ? ' class="' + cls.trim() + '"' : '') + ' aria-label="' + said + '">' + (day.attempt ? day.attempt.score : '') + '</li>';
    }).join('');

    const tally = [];
    for (let score = 0; score <= 10; score++) tally.push(scores.filter(s => s === score).length);
    const most = Math.max.apply(null, tally);
    const columns = tally.map((n, score) =>
      '<li><div class="cols-plot">' + (n ? '<b>' + n + '</b><i style="--v:' + (n / most * 100) + '"></i>' : '') + '</div>' +
      '<span class="cols-x">' + score + '</span></li>').join('');

    return '<section class="panel" aria-labelledby="stats-daily-title">' + head +
      '<dl class="figs">' +
        fig('Current streak', calculateDailyStreak(), calculateDailyStreak() === 1 ? 'day' : 'days') +
        fig('Best streak', best, best === 1 ? 'day' : 'days') +
        fig('Days played', played.length, 'of ' + DAILY_STRIP_DAYS) +
        fig('Average', average.toFixed(1), 'of 10') +
      '</dl>' +
      '<h3 class="eyebrow subhead">Score each day</h3>' +
      '<ol class="strip">' + strip + '</ol>' +
      '<div class="strip-ends" aria-hidden="true"><span>' + shortDate(dateFromKey(days[0].key)) + '</span><span>Today</span></div>' +
      '<h3 class="eyebrow subhead">Days at each score</h3>' +
      '<ol class="cols" style="--n:11" aria-label="Days at each score, 0 to 10">' + columns + '</ol>' +
      '<p class="panel-note"><b>' + perfect + '</b> perfect ' + (perfect === 1 ? 'day' : 'days') + ' in these ' + DAILY_STRIP_DAYS +
        (ever > played.length ? ' · <b>' + formatCount(ever) + '</b> puzzles played in all' : '') + '</p>' +
    '</section>';
  }

  /* ----- Personal records ----- */

  // Every best on this device as { group, title, difficulty, rec }, in
  // library order. Records are looked up by each level's stored key, so
  // whatever else the store holds is left alone.
  function statsRecordRows() {
    const rows = [];
    const add = (group, title, mode, region) => Object.keys(DIFFICULTY_INFO).forEach(difficulty => {
      const rec = getRecords(region, difficulty, mode);
      if (rec && rec.bestAccuracy && rec.bestAccuracy.total > 0) rows.push({ group: group, title: title, difficulty: difficulty, rec: rec });
    });
    COLLECTIONS.forEach(collection => {
      LEVELS.filter(level => level.collection === collection.key && level.available && level.mode !== 'city-pin')
        .forEach(level => add(collection.title, level.title, level.mode, resolveGameTarget(level.arg).region));
    });
    add('Daily', 'Daily Five', 'daily-five', 'Daily');
    return rows;
  }

  function renderStatsRecords() {
    const rows = statsRecordRows();
    const head = '<div class="panel-head"><div><h2 id="stats-records-title">Personal records</h2>' +
      '<p>Your best full round on each level and difficulty. A time counts only for a round with no misses.</p></div></div>';
    if (!rows.length) {
      return '<section class="panel panel--12" aria-labelledby="stats-records-title">' + head +
        renderEmpty('No records yet. Finish a full round of any level and its best score, accuracy and time are kept here.') +
      '</section>';
    }
    const star = '<svg class="star" viewBox="0 0 24 24" role="img" aria-label="perfect"><use href="#i-star"/></svg>';
    let table = '';
    let list = '';
    let group = null;
    rows.forEach((row, i) => {
      const rec = row.rec;
      const folded = !statsAllRecords && i >= RECORDS_SHORT ? ' hidden' : '';
      if (row.group !== group) {
        table += (group === null ? '' : '</tbody>') + '<tbody><tr class="records-group"><th colspan="8" scope="colgroup">' + escapeHtml(row.group) + '</th></tr>';
        list += '<li class="recs-group eyebrow"' + folded + '>' + escapeHtml(row.group) + '</li>';
        group = row.group;
      }
      const accuracy = rec.bestAccuracy.correct + ' / ' + rec.bestAccuracy.total;
      const perfect = rec.bestAccuracy.pct === 100 ? star : '';
      const score = rec.bestScore ? rec.bestScore.value + ' / ' + rec.bestScore.max : '—';
      const time = rec.bestTime ? formatTimeSeconds(rec.bestTime.value) : '—';
      const rounds = rec.gamesPlayed || 0;
      const last = rec.lastPlayed ? shortDate(dateFromKey(rec.lastPlayed)) : '—';
      const difficulty = DIFFICULTY_INFO[row.difficulty].label;
      table += '<tr><th scope="row">' + escapeHtml(row.title) + '</th><td>' + difficulty + '</td>' +
        '<td class="is-strong">' + accuracy + perfect + '</td><td>' + rec.bestAccuracy.pct + '%</td><td>' + score + '</td>' +
        '<td>' + time + '</td><td>' + rounds + '</td><td>' + last + '</td></tr>';
      list += '<li' + folded + '><strong>' + escapeHtml(row.title) + '<span class="tag">' + difficulty + '</span></strong>' +
        '<span class="recs-score">' + accuracy + perfect + '</span>' +
        '<small>' + rec.bestAccuracy.pct + '% · ' + score + ' pts' + (rec.bestTime ? ' · ' + time : '') +
          ' · ' + rounds + (rounds === 1 ? ' round' : ' rounds') + ' · ' + last + '</small></li>';
    });
    return '<section class="panel panel--12" aria-labelledby="stats-records-title">' + head +
      '<table class="records">' +
        '<thead><tr><th scope="col">Level</th><th scope="col">Difficulty</th><th scope="col">Best found</th><th scope="col">Accuracy</th>' +
          '<th scope="col">Best score</th><th scope="col">Best time</th><th scope="col">Rounds</th><th scope="col">Last played</th></tr></thead>' +
        table + '</tbody>' +
      '</table>' +
      '<div class="recs"><ul>' + list + '</ul>' +
        (!statsAllRecords && rows.length > RECORDS_SHORT
          ? '<button type="button" class="btn btn--secondary btn--block" data-action="show-all-records">Show all ' + rows.length + ' records</button>' : '') +
      '</div>' +
    '</section>';
  }

  // Unfold the rest of the phone's records list
  function showAllRecords(button) {
    statsAllRecords = true;
    button.parentNode.querySelectorAll('[hidden]').forEach(row => { row.hidden = false; });
    button.remove();
  }

  /* ----- Pin the City ----- */

  function renderStatsPin() {
    const games = loadPinStore().games;
    const head = '<div class="panel-head"><div><h2 id="stats-pin-title">Pin the City</h2>' +
      '<p>How far your pins land from the city, in kilometres. Shorter is better.</p></div></div>';
    if (!games.length) {
      return '<section class="panel" aria-labelledby="stats-pin-title">' + head +
        renderEmpty('No pins dropped yet. Play a round of Pin the City and each region’s rounds, best score and average distance are charted here.') +
      '</section>';
    }

    const regions = LEVELS.filter(level => level.mode === 'city-pin' && level.available).map(level => {
      const played = games.filter(g => g.region === resolveGameTarget(level.arg).region);
      const kms = played.slice(-10).filter(g => g.avgKm != null).map(g => g.avgKm);
      return {
        title: level.title,
        rounds: played.length,
        best: played.reduce((m, g) => Math.max(m, g.score), 0),
        km: kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null
      };
    });
    const end = niceCeil(Math.max.apply(null, regions.map(r => r.km || 0).concat([1])));
    const body = regions.map(r =>
      '<tr><th scope="row">' + escapeHtml(r.title) + '</th>' +
        '<td class="pin-bar">' + (r.km === null
          ? '<span class="hbar-none">' + (r.rounds ? 'Every city skipped' : 'Not played yet') + '</span>'
          : '<div class="hbar"><i style="--v:' + (r.km / end * 100) + '"></i><b>' + formatKm(r.km) + '</b></div>') + '</td>' +
        '<td>' + (r.rounds ? r.rounds + '<span class="pin-unit">' + (r.rounds === 1 ? ' round' : ' rounds') + '</span>' : '') + '</td>' +
        '<td>' + (r.rounds ? '<span class="pin-unit">best </span>' + formatCount(r.best) : '') + '</td></tr>').join('');

    const recent = games.filter(g => g.avgKm != null).slice(-PIN_TREND_ROUNDS);
    let trend = renderEmpty('The chart starts with your second round.');
    if (recent.length > 1) {
      const top = Math.max.apply(null, recent.map(g => g.avgKm));
      const mean = list => Math.round(list.reduce((sum, g) => sum + g.avgKm, 0) / list.length);
      const half = Math.min(5, Math.floor(recent.length / 2));
      trend = '<ol class="cols" style="--n:' + recent.length + '" aria-label="Average distance in kilometres, round by round, oldest first">' +
          recent.map(g => '<li><div class="cols-plot"><b>' + Math.round(g.avgKm) + '</b><i style="--v:' + (g.avgKm / top * 100) + '"></i></div></li>').join('') +
        '</ol>' +
        '<div class="cols-ends" aria-hidden="true"><span>' + shortDate(new Date(recent[0].at)) + '</span><span>Latest</span></div>' +
        '<p class="panel-note">Last ' + half + ' ' + (half === 1 ? 'round' : 'rounds') + ' average <b>' + formatKm(mean(recent.slice(-half))) +
          '</b>; the ' + half + ' before, <b>' + formatKm(mean(recent.slice(-half * 2, -half))) + '</b>.</p>';
    }

    return '<section class="panel" aria-labelledby="stats-pin-title">' + head +
      '<table class="pintable">' +
        '<thead><tr><th scope="col">Region</th><th scope="col">Average, last 10 rounds</th><th scope="col">Rounds</th><th scope="col">Best score</th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
        '<tfoot><tr><td></td><td class="pin-bar"><div class="pin-axis" aria-hidden="true"><span style="left:0">0</span>' +
          '<span style="left:50%">' + formatCount(end / 2) + '</span><span style="left:100%">' + formatKm(end) + '</span></div></td><td></td><td></td></tr></tfoot>' +
      '</table>' +
      '<h3 class="eyebrow subhead">Average distance, last ' + Math.max(recent.length, 2) + ' rounds, km</h3>' +
      trend +
    '</section>';
  }

  /* =========================================================
   * GAME
   * ========================================================= */

  // Map a menu card's data-region value to { mode, region }. `region` is
  // what records and focus lists are keyed by (and becomes currentContinent).
  function resolveGameTarget(regionOrMode) {
    if (regionOrMode === 'daily-five') {
      return { mode: 'daily-five', region: 'Daily' };
    }
    if (regionOrMode === 'us-state' ||
        regionOrMode === 'us-capital-to-state' ||
        regionOrMode === 'us-state-to-capital') {
      return { mode: regionOrMode, region: GAME_MODES[regionOrMode].label() };
    }
    if (US_CITY_REGION_KEYS[regionOrMode]) {
      // Cities mode: the button id like 'northeast-cities' maps to a region
      // label like 'Northeast'. The label drives queue selection AND becomes
      // currentContinent so the records key stays per-region.
      return { mode: 'us-city', region: US_CITY_REGION_KEYS[regionOrMode] };
    }
    if (PIN_ROUNDS[regionOrMode]) {
      return { mode: 'city-pin', region: PIN_ROUNDS[regionOrMode] };
    }
    if (PROVINCE_ROUNDS[regionOrMode]) {
      // Province mode: the round key (e.g. 'india-states') is the region,
      // so records stay per-round and GAME_MODES.province.label() can title it.
      return { mode: 'province', region: regionOrMode };
    }
    return { mode: 'world-country', region: regionOrMode };
  }

  // Plural noun for what a mode asks you to find ("Countries", "States", ...)
  function targetNoun(mode, region) {
    if (mode === 'us-city' || mode === 'city-pin') return 'Cities';
    if (mode === 'province') return PROVINCE_COUNTRIES[PROVINCE_ROUNDS[region].country].noun;
    return GAME_MODES[mode].dataset === 'us' ? 'States' : 'Countries';
  }

  // Entry point for all games. For world modes, pass the continent name
  // (or 'World'). For US modes, pass the mode key; `region` becomes
  // unused and `currentContinent` is the display label.
  // opts.practice: names to quiz instead of the whole level (a focus round).
  // opts.dailyReplay: date key of a daily puzzle to replay as practice.
  async function startGame(regionOrMode, opts) {
    // Clear any leftover review-mode class so the prompt/score/skip UI
    // shows on the new round (in case the player entered review mode after
    // their last game and then started a fresh one without backing out).
    document.getElementById('game-screen').classList.remove('review-mode');

    // Only the Daily Five and levels that have something to ask can start
    const level = levelForStartArg(regionOrMode);
    if (regionOrMode !== 'daily-five' && !(level && level.available)) {
      refuseLevel(level);
      return;
    }

    const round = ++state.roundId;
    const target = resolveGameTarget(regionOrMode);
    const mode = target.mode;
    const region = target.region;
    state.startArg = regionOrMode;
    state.practice = false;
    state.learn = null;
    state.pin = null;
    // Any round that isn't the next step of a review ends the review
    state.review = (opts && opts.review) || null;
    // Set (or cleared) per start and left in place through finishGame, so
    // the results screen still knows a daily replay was practice.
    state.dailyReplay = opts && opts.dailyReplay ? { dateKey: opts.dailyReplay } : null;

    state.gameMode = mode;
    state.activeDataset = GAME_MODES[mode].dataset;
    state.currentContinent = region;
    state.currentProvinceRound = mode === 'province' ? region : null;

    // For daily mode, refuse to start if already played today (unless
    // explicitly replaying — see startDailyReplay below).
    if (mode === 'daily-five' && !state.dailyReplay) {
      const dateKey = todayUtcKey();
      const existing = getDailyAttempt(dateKey);
      if (existing) {
        switchScreen('menu');   // Home's card shows today's result
        return;
      }
      // Stash today's date key on state so finishGame knows what to save under
      state.dailyDateKey = dateKey;
    }

    // Lazy-load US data if needed
    if (state.activeDataset === 'us' && !state.usLoaded) {
      showLoadingOverlay('Loading the United States');
      try {
        await loadUsStatesData();
      } catch (err) {
        hideLoadingOverlay();
        switchScreen('menu');
        showNotice('The United States map could not be loaded. Check your connection and try again.');
        return;
      }
      hideLoadingOverlay();
      if (state.roundId !== round) return;
    }

    // Lazy-load the country's province map on first play
    if (mode === 'province') {
      const countryKey = PROVINCE_ROUNDS[region].country;
      const country = PROVINCE_COUNTRIES[countryKey];
      if (!state.provinceStores[countryKey]) {
        showLoadingOverlay('Loading ' + country.name);
        try {
          await loadProvinceData(countryKey);
        } catch (err) {
          hideLoadingOverlay();
          switchScreen('menu');
          showNotice('The map of ' + country.name + ' could not be loaded. Check your connection and try again.');
          return;
        }
        hideLoadingOverlay();
        if (state.roundId !== round) return;
      }
    }

    state.correct = 0;
    state.wrong = 0;
    state.score = 0;
    state.missed = [];
    state.secondTry = [];
    state.sequence = [];
    state.attempts = 0;
    state.startTime = Date.now();
    state.interactionLocked = false;
    state.totalQuestions = 0;
    state.current = null;   // nothing can be answered until the first prompt is up

    // Build eligible features based on mode
    if (mode === 'daily-five') {
      // Daily uses the world-country dataset but the queue is the
      // deterministic 5-country puzzle for today's date (or a replay date).
      const dateKey = state.dailyReplay && state.dailyReplay.dateKey
        ? state.dailyReplay.dateKey
        : todayUtcKey();
      state.dailyDateKey = dateKey;
      state.eligibleFeatures = state.allFeatures.filter(
        f => state.continentByFeature.get(featureKey(f))
      );
      const dailyNames = generateDailyPuzzle(dateKey);
      // Order matters for the daily puzzle - we want the easy→hard ramp
      state.queue = dailyNames.slice();
    } else if (mode === 'us-city') {
      // City mode: state polygons in the region are visible as the "land
      // beneath" but aren't click targets — the queue is city names, and
      // clicks resolve against city dots instead of country polygons.
      const regionStates = US_REGION_STATES[region] || [];
      const regionStateSet = new Set(regionStates);
      state.eligibleFeatures = state.usFeatures.filter(f => {
        const name = state.usCanonicalByFeature.get(featureKey(f));
        return regionStateSet.has(name);
      });
      const cities = US_CITIES_BY_REGION[region] || [];
      // Build a city -> state lookup so the prompt can show
      // "Burlington, Vermont" — disambiguates same-name cities (Portland
      // OR vs ME, Springfield MA vs MO, etc.) and gives the player
      // geographic context as part of the question.
      state.cityStateByName = new Map();
      cities.forEach(c => state.cityStateByName.set(c.name, c.state));
      state.queue = shuffle(usCityNames(region));
    } else if (mode === 'city-pin') {
      // Countries are only scenery here (the whole map takes pins); the
      // continent's countries are drawn as land, the rest grayed out.
      state.eligibleFeatures = state.allFeatures.filter(f => {
        const continent = state.continentByFeature.get(featureKey(f));
        return region === 'World' ? !!continent : continent === region;
      });
      state.queue = shuffle(pinCitiesFor(region).map(c => c.name)).slice(0, PIN_ROUND_SIZE);
      state.pin = { phase: 'aim', guess: null, results: [] };
    } else if (mode === 'province') {
      // Every feature in the country's file is quizzable; Russia's rounds
      // narrow it to one group (isEligible handles that).
      state.eligibleFeatures = currentProvinceStore().features.filter(isEligible);
      state.queue = shuffle(provinceRoundNames(region));
    } else if (state.activeDataset === 'us') {
      state.eligibleFeatures = state.usFeatures.filter(f => {
        const name = state.usCanonicalByFeature.get(featureKey(f));
        return US_STATE_SET.has(name);
      });
      state.queue = shuffle(US_STATE_NAMES.filter(name => state.usFeatureByCanonical.has(name)));
    } else {
      // The World, or one continent
      state.eligibleFeatures = state.allFeatures.filter(f => {
        const continent = state.continentByFeature.get(featureKey(f));
        return region === 'World' ? !!continent : continent === region;
      });
      state.queue = shuffle(countryNames(region));
    }

    // The map held none of the level's items: nothing to play or to save
    if (state.queue.length === 0) {
      refuseLevel(level);
      return;
    }

    // Focus round: keep only the requested names. The queue is already
    // shuffled, and names no longer on the map drop out. If none survive,
    // fall through to a normal full game.
    if (opts && opts.practice && mode !== 'daily-five') {
      const wanted = new Set(opts.practice);
      const subset = state.queue.filter(n => wanted.has(n));
      if (subset.length > 0) {
        state.queue = subset;
        state.practice = true;
      }
    }
    state.totalQuestions = state.queue.length;

    // Learn mode: the queue becomes the ladder order, quizzed one level at
    // a time (startLearnLevel builds each level's queue).
    if (opts && opts.learn && mode === 'province') {
      state.learn = createLearnRun(region, state.queue, !!opts.learnFresh);
    }
    setLearnChrome(!!state.learn);
    setAddressBar(levelLink(regionOrMode, !!state.learn));

    // Satellite / borderless classes go on before the map draws; give the
    // imagery a fresh chance if it failed last game
    sat.failed = false;
    applyMapStyle();

    switchScreen('game');
    // Header label - daily mode shows the puzzle number
    let headerLabel = GAME_MODES[mode].label(region);
    if (mode === 'daily-five') {
      headerLabel = 'Daily #' + dailyPuzzleNumber(state.dailyDateKey);
      if (state.dailyReplay) headerLabel += ' (Practice)';
    }
    if (state.practice) headerLabel += state.review ? ' · Review' : ' · Practice';
    if (state.learn) headerLabel += ' · Learn';
    document.getElementById('region-tag').textContent = headerLabel;
    const zoomHintEl = document.getElementById('zoom-hint');
    if (zoomHintEl) {
      zoomHintEl.style.display = state.zoomHintShown ? 'none' : '';
      state.zoomHintShown = true;
    }

    // Wait for screen transition, then render map
    roundTimeout(() => {
      renderMap();
      if (state.learn) startLearnLevel();
      else nextCountry();
    }, 80);
  }

  // Back to the menu with a word of explanation, for a level that can't
  // be played (level is null when the name matched none)
  function refuseLevel(level) {
    switchScreen('menu');
    showNotice((level ? level.title : 'That level') + ' isn’t ready to play yet.');
  }

  // Allow replaying a past daily puzzle without affecting today's record.
  // Used by the "Replay this puzzle" link on the already-played view.
  function startDailyReplay(dateKey) {
    startGame('daily-five', { dailyReplay: dateKey });
  }

  function showLoadingOverlay(text) {
    let el = document.getElementById('loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.className = 'loading-overlay';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="loading-inner">' + text + '<span class="loading-dots"></span></div>';
    el.classList.add('visible');
  }
  function hideLoadingOverlay() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('visible');
  }

  // A short plain-text message over whichever screen is showing; fades by itself
  function showNotice(text) {
    let el = document.getElementById('app-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-notice';
      el.className = 'app-notice';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(hideNotice, 4500);
  }

  function hideNotice() {
    const el = document.getElementById('app-notice');
    if (el) el.classList.remove('show');
  }

  // setTimeout for work that belongs to the round in play: the callback is
  // dropped if that round has been left or another has started by then
  function roundTimeout(fn, ms) {
    const round = state.roundId;
    return setTimeout(() => {
      if (state.roundId === round) fn();
    }, ms);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderMap() {
    const svgEl = document.getElementById('world-map');
    const wrap = svgEl.parentElement;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;

    svgEl.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    // Clear
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    const svg = d3.select(svgEl);
    state.svg = svg;

    // Feature lists for fitting and background rendering
    let fitCollection = {
      type: 'FeatureCollection',
      features: state.eligibleFeatures
    };
    const bgCollection = {
      type: 'FeatureCollection',
      features: activeFeatures()
    };

    // Pin the City frames the round's cities, not the continent's land, so
    // Europe isn't shrunk to fit all of Russia out to the Pacific
    if (state.gameMode === 'city-pin' && state.currentContinent !== 'World') {
      fitCollection = pinFitGeometry(state.currentContinent);
    }

    // Pick projection based on active dataset
    let projection;
    if (state.activeDataset === 'us') {
      // Albers USA handles Alaska and Hawaii insets automatically,
      // giving a clean framed map of the 50 states at any size.
      projection = d3.geoAlbersUsa();
    } else if (state.activeDataset === 'province') {
      // Equal-area conic centered on the round's land (see PROVINCE_COUNTRIES).
      // geoCentroid is spherical, so the Russian Far East round centers
      // correctly even though Chukotka straddles the antimeridian.
      const round = PROVINCE_ROUNDS[state.currentProvinceRound];
      const centroid = d3.geoCentroid(fitCollection);
      projection = d3.geoConicEqualArea()
        .parallels(PROVINCE_COUNTRIES[round.country].parallels)
        .rotate([-centroid[0], 0]);
    } else if (state.currentContinent === 'World' || state.gameMode === 'daily-five') {
      // Daily mode also uses the whole world, so it gets the same
      // Natural Earth projection (and the same fitExtent below).
      projection = d3.geoNaturalEarth1();
    } else {
      // Center Mercator on the continent's centroid longitude so the
      // land fills the view instead of being offset toward Greenwich.
      const centroid = d3.geoCentroid(fitCollection);
      projection = d3.geoMercator()
        .rotate([-centroid[0], 0]);
    }

    const padding = 20;
    if (state.activeDataset === 'us' || state.activeDataset === 'province') {
      projection.fitExtent(
        [[padding + 20, padding + 10], [width - padding - 20, height - padding - 10]],
        fitCollection
      );
    } else if (state.currentContinent === 'World' || state.gameMode === 'daily-five') {
      projection.fitExtent(
        [[padding, padding], [width - padding, height - padding]],
        bgCollection
      );
    } else {
      projection.fitExtent(
        [[padding + 40, padding + 10], [width - padding - 40, height - padding - 10]],
        fitCollection
      );
    }

    state.projection = projection;
    state.pathGen = d3.geoPath(projection);

    const g = svg.append('g');
    state.mapG = g;

    // Zoom & pan behavior
    // 60× max scale gives plenty of room to click tiny island nations
    // (Caribbean, Oceania) which are barely a few pixels at 1× zoom.
    const zoomBehavior = d3.zoom()
      .scaleExtent([1, 60])
      .translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]])
      .filter((event) => {
        if (event.type === 'dblclick') return false;
        if (event.type === 'mousedown' && event.button !== 0) return false;
        return true;
      })
      .on('zoom', (event) => {
        state.currentTransform = event.transform;
        g.attr('transform', event.transform);
        // City dots live inside `g` so they get scaled along with the map.
        // Counter-scale their radius and stroke so they stay at constant
        // screen size like the country borders do.
        if (state.gameMode === 'us-city') {
          const invK = 1 / event.transform.k;
          g.selectAll('.city-dot').attr('r', CITY_DOT_BASE_RADIUS * invK);
        }
        if (state.learn) scaleLearnLabels(event.transform.k);
        satOnZoom();
        if (state.pin) scalePinMarkers(event.transform.k);
      });

    svg.call(zoomBehavior);
    state.zoomBehavior = zoomBehavior;
    // The <svg> element outlives each game, and d3 keeps the last zoom on
    // it. Start every fresh map at 1× so stored and drawn zoom agree (the
    // resize handler restores the player's zoom after calling us).
    svg.call(zoomBehavior.transform, d3.zoomIdentity);

    // Sphere backdrop - only for world projections. Albers USA isn't a
    // true globe projection so a Sphere would just be a big blue box, and
    // the per-country conics would draw it as a giant fan shape.
    if (state.activeDataset === 'world') {
      g.append('path')
        .attr('class', 'sphere-bg')
        .attr('d', state.pathGen({ type: 'Sphere' }));
      const graticule = d3.geoGraticule().step([20, 20]);
      g.append('path')
        .attr('class', 'graticule')
        .attr('d', state.pathGen(graticule()));
    } else {
      // Full-bleed "ocean" rectangle so we get a consistent look
      g.append('rect')
        .attr('class', 'us-ocean')
        .attr('x', -width * 2).attr('y', -height * 2)
        .attr('width', width * 5).attr('height', height * 5);
    }

    // Frames around Albers USA's Alaska and Hawaii insets (constants from
    // d3.geoAlbersUsa). Only shown over satellite imagery, which otherwise
    // changes abruptly at the inset edges.
    if (state.activeDataset === 'us') {
      const k = projection.scale();
      const [x, y] = projection.translate();
      const rect = (x0, y0, x1, y1) =>
        'M' + (x + x0 * k) + ',' + (y + y0 * k) + 'H' + (x + x1 * k) +
        'V' + (y + y1 * k) + 'H' + (x + x0 * k) + 'Z';
      g.append('path')
        .attr('class', 'inset-frame')
        .attr('d', rect(-0.425, 0.120, -0.214, 0.234) + rect(-0.214, 0.166, -0.115, 0.234));
    }

    // Hit-zone overlay for tiny eligible features. Rendered first (so it sits
    // BELOW visible polygons in z-order) — visible neighbors take click
    // precedence at land borders, but small islands surrounded by ocean now
    // catch clicks within ~22px of their outline regardless of zoom.
    const SMALL_FEATURE_PX = 14; // max bounding-box dimension at zoom k=1
    // Province maps also have scattered territories (Lakshadweep's islands,
    // Puducherry's four enclaves) whose bounding box is big but whose land
    // is a few pixels. Catch those by on-screen area instead.
    const SMALL_AREA_PX2 = 200;
    g.selectAll('.country-hitzone')
      .data(activeFeatures().filter(f => {
        if (!isEligible(f)) return false;
        const d = state.pathGen(f);
        if (!d || d.indexOf('NaN') !== -1) return false;
        const b = state.pathGen.bounds(f);
        const maxDim = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
        return maxDim < SMALL_FEATURE_PX ||
          (state.activeDataset === 'province' && state.pathGen.area(f) < SMALL_AREA_PX2);
      }))
      .enter()
      .append('path')
      .attr('class', 'country-hitzone')
      .attr('d', f => state.pathGen(f))
      .attr('data-fkey', f => featureKey(f))
      .on('click', handleCountryClick);

    // All features (eligible ones colored as land, others grayed out)
    // Albers USA returns invalid paths (starting with NaN) for features
    // outside CONUS/AK/HI — we skip those so they don't render as artifacts.
    g.selectAll('.country-bg')
      .data(activeFeatures())
      .enter()
      .append('path')
      .attr('class', f => 'country ' + (isEligible(f) ? 'eligible' : 'ineligible'))
      .attr('d', f => {
        const d = state.pathGen(f);
        return (d && d.indexOf('NaN') === -1) ? d : null;
      })
      .filter(function () { return this.getAttribute('d') != null; })
      .attr('data-fkey', f => featureKey(f))
      .on('click', handleCountryClick);

    // Pin the City: a tap anywhere (land or sea) aims the pin. Country
    // clicks bubble up here; d3.zoom swallows the click that ends a drag.
    if (state.gameMode === 'city-pin') {
      svg.on('click', handlePinClick);
      drawPinLayer();
    }

    // City-dot layer (us-city mode only). Sits on top of the country
    // polygons so each city is clickable. Each dot's radius
    // is set in map-space units, so on subsequent zoom events we
    // counter-scale it (see zoomBehavior .on('zoom') above) to keep
    // constant screen size.
    if (state.gameMode === 'us-city') {
      const cities = US_CITIES_BY_REGION[state.currentContinent] || [];
      const k0 = (state.currentTransform && state.currentTransform.k) || 1;
      g.selectAll('.city-dot')
        .data(cities)
        .enter()
        .append('circle')
        .attr('class', 'city-dot')
        .attr('cx', d => {
          const p = state.projection(d.coords);
          return p ? p[0] : 0;
        })
        .attr('cy', d => {
          const p = state.projection(d.coords);
          return p ? p[1] : 0;
        })
        .attr('r', CITY_DOT_BASE_RADIUS / k0)
        .attr('data-city', d => d.name)
        .on('click', handleCityClick);
    }

    satReset();
  }

  // Base radius for city dots, in screen pixels at zoom k=1.
  // The dots live inside the zoom-transformed group, so we divide by k
  // on every zoom event to keep them visually constant.
  const CITY_DOT_BASE_RADIUS = 6;

  function isEligible(feature) {
    if (state.activeDataset === 'us') {
      const name = state.usCanonicalByFeature.get(featureKey(feature));
      if (state.gameMode === 'us-city') {
        // In cities mode, only states inside the current region are
        // foreground "land"; the rest are grayed-out background so the
        // regional zoom is unambiguous.
        const regionStates = US_REGION_STATES[state.currentContinent];
        return regionStates ? regionStates.indexOf(name) !== -1 : false;
      }
      return US_STATE_SET.has(name);
    }
    if (state.activeDataset === 'province') {
      // Whole-country rounds quiz everything; Russia's rounds quiz one
      // group and gray out the rest of the country as context.
      const round = PROVINCE_ROUNDS[state.currentProvinceRound];
      if (!round) return false;
      return !round.group || (feature.properties && feature.properties.group === round.group);
    }
    const continent = state.continentByFeature.get(featureKey(feature));
    // Daily mode pulls from the whole world, so every recognized country
    // is fair game to click. Without this, all countries are treated as
    // ineligible (grayed out) because state.currentContinent === 'Daily'
    // doesn't match any continent.
    if (state.gameMode === 'daily-five') return !!continent;
    if (state.currentContinent === 'World') return !!continent;
    return continent === state.currentContinent;
  }

  function nextCountry() {
    if (state.queue.length === 0) {
      if (state.learn) learnLevelPassed();
      else if (state.pin) finishPinGame();
      else finishGame();
      return;
    }
    state.current = state.queue.shift();
    state.attempts = 0;
    state.interactionLocked = false;

    const mode = state.gameMode;
    const promptEl = document.getElementById('prompt-country');
    const promptLabelEl = document.querySelector('.prompt-panel .prompt-label');
    const choicesEl = document.getElementById('choices-panel');

    // Configure the prompt based on mode
    if (mode === 'city-pin') {
      const city = PIN_CITY_BY_NAME.get(state.current);
      promptLabelEl.textContent = 'Pin the city';
      promptEl.innerHTML = escapeHtml(city.label) + '<span class="pin-prompt-country">' + escapeHtml(city.country) + '</span>';
      state.currentPromptText = city.name;
      choicesEl.style.display = 'none';
      state.pin.phase = 'aim';
      state.pin.guess = null;
      drawPinLayer();
      setPinButton('Drop Pin', true);
    } else if (mode === 'us-city') {
      // City mode: prompt shows "City, State" to disambiguate same-name
      // cities and give the player geographic context as part of the
      // question. The dot lookup still uses just the city name.
      promptLabelEl.textContent = 'Find the city';
      const cityState = state.cityStateByName
        ? state.cityStateByName.get(state.current)
        : null;
      // A name that already carries its state (see claimName) is shown as it is
      const display = cityState && !state.current.endsWith(', ' + cityState)
        ? state.current + ', ' + cityState
        : state.current;
      promptEl.textContent = display;
      state.currentPromptText = display;
      choicesEl.style.display = 'none';
    } else if (mode === 'us-capital-to-state') {
      // The quiz target is a state name; the prompt shows its capital.
      promptLabelEl.textContent = 'Click the state with this capital';
      promptEl.textContent = US_CAPITALS[state.current];
      state.currentPromptText = US_CAPITALS[state.current];
      choicesEl.style.display = 'none';
    } else if (mode === 'us-state-to-capital') {
      // The quiz target is a state name; the prompt shows the state,
      // and the user chooses the correct capital from 4 options.
      promptLabelEl.textContent = 'Which capital belongs to';
      promptEl.textContent = state.current;
      state.currentPromptText = state.current;
      renderCapitalChoices(state.current);
      choicesEl.style.display = '';
      // Highlight the state on the map so users visualize what they're being asked
      highlightPromptedState(state.current);
    } else {
      // World country mode or US state mode
      promptLabelEl.textContent = state.learn
        ? 'Level ' + state.learn.level + ' of ' + state.learn.order.length + ' · find'
        : 'Find on the map';
      promptEl.textContent = state.current;
      state.currentPromptText = state.current;
      choicesEl.style.display = 'none';
    }

    promptEl.classList.remove('shake');
    promptEl.classList.remove('pulse');
    void promptEl.offsetWidth;
    promptEl.classList.add('pulse');

    updateStats();
    document.getElementById('skip-btn').disabled = false;
  }

  // Books a resolved question: 2 points for a first-try find, 1 for a
  // second-try find, 0 for a miss (two wrong tries, or a skip). Locks the
  // map until the next prompt and hands the outcome to the mastery store.
  function scoreAnswer(points) {
    if (points > 0) {
      state.correct++;
      state.score += points;
      if (points === 1) state.secondTry.push(state.current);
    } else {
      state.wrong++;
      state.missed.push(state.current);
    }
    state.sequence.push(points);
    state.interactionLocked = true;

    if (state.learn) {
      // Counted toward the level's session only (see learnLevelPassed)
      state.learn.asked++;
      if (points > 0) state.learn.found++;
      return;
    }
    const skill = roundSkill();
    if (skill) mastery.record(skill, state.current, Mastery.OUTCOMES[points]);
  }

  // Highlights the currently-prompted state in the state-to-capital mode
  // so the user can see which state they're being asked about. Also pans
  // to it if it's off-screen.
  function highlightPromptedState(stateName) {
    d3.selectAll('.country.prompt-highlight').classed('prompt-highlight', false);
    const feature = state.usFeatureByCanonical.get(stateName);
    if (!feature) return;
    const targetKey = featureKey(feature);
    d3.select('.country[data-fkey="' + CSS.escape(targetKey) + '"]').classed('prompt-highlight', true);
    ensureFeatureVisible(feature);
  }

  // Builds 4 capital-choice buttons for state-to-capital mode: the correct
  // answer plus 3 plausible distractors (other state capitals).
  function renderCapitalChoices(stateName) {
    const correctCapital = US_CAPITALS[stateName];
    const distractors = shuffle(
      US_STATE_NAMES.filter(s => s !== stateName).map(s => US_CAPITALS[s])
    ).slice(0, 3);
    const choices = shuffle([correctCapital, ...distractors]);

    const container = document.getElementById('choices-panel');
    container.innerHTML = '';
    choices.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c;
      btn.dataset.capital = c;
      btn.addEventListener('click', () => handleCapitalChoice(c, btn));
      container.appendChild(btn);
    });
  }

  function handleCapitalChoice(capital, btn) {
    if (state.interactionLocked) return;
    if (!state.current) return;

    const correctCapital = US_CAPITALS[state.current];
    if (capital === correctCapital) {
      const pointsEarned = state.attempts === 0 ? 2 : 1;
      scoreAnswer(pointsEarned);
      btn.classList.add('choice-correct');
      const pointsLabel = pointsEarned === 2 ? '+2 pts' : '+1 pt';
      showToast('correct', '<em>' + state.current + '</em> → ' + capital + ' · ' + pointsLabel);
      updateStats();
      flashScore();

      // Also mark the state on the map as completed
      const feature = state.usFeatureByCanonical.get(state.current);
      if (feature) {
        const targetKey = featureKey(feature);
        const p = d3.select('.country[data-fkey="' + CSS.escape(targetKey) + '"]');
        p.classed('target-correct', true);
        roundTimeout(() => {
          p.classed('target-correct', false);
          if (!state.hardMode) p.classed('completed-correct', true);
        }, 700);
      }

      roundTimeout(nextCountry, 1100);
    } else {
      state.attempts++;
      btn.classList.add('choice-wrong');
      btn.disabled = true;

      const promptEl = document.getElementById('prompt-country');
      promptEl.classList.remove('shake');
      void promptEl.offsetWidth;
      promptEl.classList.add('shake');

      if (state.attempts >= 2) {
        // Reveal the correct answer
        scoreAnswer(0);

        // Highlight the correct capital button
        const container = document.getElementById('choices-panel');
        container.querySelectorAll('.choice-btn').forEach(b => {
          if (b.dataset.capital === correctCapital) b.classList.add('choice-reveal');
        });

        // Also mark state on map as wrong + show the reveal marker
        const feature = state.usFeatureByCanonical.get(state.current);
        if (feature) {
          revealTargetFeature(feature,
            '<em>' + state.current + '</em> → ' + correctCapital);
        } else {
          showToast('wrong', '<em>' + state.current + '</em> → ' + correctCapital);
          roundTimeout(nextCountry, 1800);
        }
      } else {
        showToast('wrong', 'Not quite — try again');
      }
    }
  }

  function handleCountryClick(event, f) {
    if (state.gameMode === 'city-pin') return;   // the map-wide pin handler takes it
    if (state.interactionLocked) return;
    if (!state.current) return;
    if (!isEligible(f)) return;
    // In state-to-capital mode, clicking the map shouldn't register —
    // the user answers via the capital choice buttons instead.
    if (state.gameMode === 'us-state-to-capital') return;
    // In cities mode, the city dots are the click target, not the
    // state polygons under them.
    if (state.gameMode === 'us-city') return;

    // Always operate on the VISIBLE polygon (.country) regardless of whether
    // the click hit the visible polygon or the invisible hit-zone overlay.
    // event.currentTarget can be either; we resolve by data-fkey + class.
    const fkey = featureKey(f);
    const visiblePath = d3.select('.country[data-fkey="' + CSS.escape(fkey) + '"]');
    const visibleEl = visiblePath.node();
    if (!visibleEl) return;
    if (visibleEl.classList.contains('completed-correct') ||
        visibleEl.classList.contains('completed-wrong')) {
      return;
    }

    const byCanonical = activeCanonicalByFeature();
    const byName = activeFeatureByCanonical();
    const clickedCanonical = byCanonical.get(featureKey(f));
    const targetFeature = byName.get(state.current);
    if (!targetFeature) return;

    if (clickedCanonical === state.current) {
      const pointsEarned = state.attempts === 0 ? 2 : 1;
      scoreAnswer(pointsEarned);
      visiblePath.classed('target-correct', true);
      const pointsLabel = pointsEarned === 2 ? '+2 pts' : '+1 pt';
      // For capital mode, the toast shows "Capital → State" to reinforce learning
      let toastMsg = state.gameMode === 'us-capital-to-state'
        ? '<em>' + state.currentPromptText + '</em> → ' + state.current + ' · ' + pointsLabel
        : 'Well done — <em>' + state.current + '</em> · ' + pointsLabel;
      if (state.learn) toastMsg = 'Well done — <em>' + state.current + '</em>';
      showToast('correct', toastMsg);
      updateStats();
      flashScore();

      roundTimeout(() => {
        visiblePath.classed('target-correct', false);
        if (!state.hardMode) {
          visiblePath.classed('completed-correct', true);
        }
        nextCountry();
      }, 900);
    } else {
      state.attempts++;
      visiblePath.classed('target-wrong', true);
      roundTimeout(() => visiblePath.classed('target-wrong', false), 700);

      const promptEl = document.getElementById('prompt-country');
      promptEl.classList.remove('shake');
      void promptEl.offsetWidth;
      promptEl.classList.add('shake');

      // Learn mode allows no second try: one miss restarts the level
      if (state.attempts >= 2 || state.learn) {
        scoreAnswer(0);
        let revealMsg = state.gameMode === 'us-capital-to-state'
          ? '<em>' + state.currentPromptText + '</em> → ' + state.current
          : 'Not quite — this is <em>' + state.current + '</em>';
        if (state.learn) {
          revealMsg = (clickedCanonical ? 'That’s <em>' + clickedCanonical + '</em> — ' : '') +
            'this is <em>' + state.current + '</em>';
        }
        revealTargetFeature(targetFeature, revealMsg);
      } else {
        const wrongName = clickedCanonical || 'That';
        showToast('wrong', '<em>' + wrongName + '</em> — try again');
      }
    }
  }

  // Prominently reveal a missed country: pan to it if off-screen,
  // flash the country with a bright gold fill and thick navy outline,
  // and draw a pulsing ring marker at its centroid.
  function revealTargetFeature(feature, toastHtml) {
    const targetKey = featureKey(feature);
    const targetPath = d3.select('.country[data-fkey="' + CSS.escape(targetKey) + '"]');
    targetPath.classed('reveal', true);
    showToast('wrong', toastHtml);
    updateStats();

    ensureFeatureVisible(feature);
    showRevealMarker(feature);

    roundTimeout(() => {
      targetPath.classed('reveal', false);
      if (state.learn) {
        learnLevelFailed();
        return;
      }
      if (!state.hardMode) {
        targetPath.classed('completed-wrong', true);
      }
      nextCountry();
    }, 2600);
  }

  // Pan the map so the given feature is visible, if currently off-screen.
  function ensureFeatureVisible(feature) {
    if (!state.svg || !state.zoomBehavior || !state.pathGen) return;
    const t = state.currentTransform || d3.zoomIdentity;
    const [cx, cy] = state.pathGen.centroid(feature);
    if (isNaN(cx) || isNaN(cy)) return;

    const node = state.svg.node();
    const width = node.clientWidth || node.getBoundingClientRect().width;
    const height = node.clientHeight || node.getBoundingClientRect().height;

    // Current screen position of the centroid
    const sx = cx * t.k + t.x;
    const sy = cy * t.k + t.y;

    const marginX = width * 0.15;
    const marginY = height * 0.15;
    const inView = sx >= marginX && sx <= width - marginX &&
                   sy >= marginY && sy <= height - marginY;
    if (inView && t.k <= 1.2) return; // already well in view at low zoom

    // Only auto-pan if we're meaningfully zoomed in; at 1x the whole map is visible
    if (t.k <= 1.05 && inView) return;

    const newX = width / 2 - cx * t.k;
    const newY = height / 2 - cy * t.k;
    state.svg.transition().duration(550)
      .call(state.zoomBehavior.transform,
            d3.zoomIdentity.translate(newX, newY).scale(t.k));
  }

  // Draw a pulsing ring marker at the centroid of the given feature.
  // Size is zoom-compensated so it looks consistent in screen pixels.
  function showRevealMarker(feature) {
    if (!state.pathGen || !state.mapG) return;
    const [cx, cy] = state.pathGen.centroid(feature);
    if (isNaN(cx) || isNaN(cy)) return;

    // Clean up any stray marker
    state.mapG.selectAll('.reveal-marker').remove();

    const k = (state.currentTransform && state.currentTransform.k) || 1;
    const invK = 1 / k;

    const marker = state.mapG.append('g')
      .attr('class', 'reveal-marker')
      .attr('transform', 'translate(' + cx + ',' + cy + ') scale(' + invK + ')');

    marker.append('circle').attr('class', 'pulse-ring');
    marker.append('circle').attr('class', 'pulse-ring delayed');
    marker.append('circle').attr('class', 'center-dot').attr('r', 5);

    roundTimeout(() => {
      marker.transition().duration(300).style('opacity', 0).remove();
    }, 2400);
  }

  // City-dot click (us-city mode only). Parallel to handleCountryClick
  // but operates on data-city attributes instead of feature keys.
  function handleCityClick(event, cityData) {
    if (state.interactionLocked) return;
    if (!state.current) return;

    const dotEl = event.currentTarget;
    if (!dotEl) return;
    if (dotEl.classList.contains('completed-correct') ||
        dotEl.classList.contains('completed-wrong')) {
      return;
    }

    const dotSel = d3.select(dotEl);
    const clickedName = cityData.name;

    if (clickedName === state.current) {
      const pointsEarned = state.attempts === 0 ? 2 : 1;
      scoreAnswer(pointsEarned);
      dotSel.classed('target-correct', true);
      const pointsLabel = pointsEarned === 2 ? '+2 pts' : '+1 pt';
      showToast('correct', 'Well done — <em>' + clickedName + '</em> · ' + pointsLabel);
      updateStats();
      flashScore();

      roundTimeout(() => {
        dotSel.classed('target-correct', false);
        if (!state.hardMode) dotSel.classed('completed-correct', true);
        nextCountry();
      }, 900);
    } else {
      state.attempts++;
      dotSel.classed('target-wrong', true);
      roundTimeout(() => dotSel.classed('target-wrong', false), 700);

      const promptEl = document.getElementById('prompt-country');
      promptEl.classList.remove('shake');
      void promptEl.offsetWidth;
      promptEl.classList.add('shake');

      if (state.attempts >= 2) {
        scoreAnswer(0);
        revealMissedCity(state.current);
      } else {
        showToast('wrong', '<em>' + clickedName + '</em> — try again');
      }
    }
  }

  // Reveal animation for a missed city: pan to it if off-screen, flash the
  // dot, draw the pulsing ring marker, advance after a beat.
  function revealMissedCity(cityName) {
    const cities = US_CITIES_BY_REGION[state.currentContinent] || [];
    const cityData = cities.find(c => c.name === cityName);
    if (!cityData) {
      showToast('wrong', 'Not quite — this is <em>' + cityName + '</em>');
      roundTimeout(nextCountry, 1800);
      return;
    }

    const dotSel = d3.select('.city-dot[data-city="' + CSS.escape(cityName) + '"]');
    dotSel.classed('reveal', true);
    showToast('wrong', 'Not quite — this is <em>' + cityName + '</em>');
    updateStats();

    ensureCoordsVisible(cityData.coords);
    showRevealMarkerAtCoords(cityData.coords);

    roundTimeout(() => {
      dotSel.classed('reveal', false);
      if (!state.hardMode) dotSel.classed('completed-wrong', true);
      nextCountry();
    }, 2600);
  }

  // Pan the map so the given [lng, lat] point is visible. Parallel to
  // ensureFeatureVisible but for explicit points (cities have no polygon).
  function ensureCoordsVisible(coords) {
    if (!state.svg || !state.zoomBehavior || !state.projection) return;
    const proj = state.projection(coords);
    if (!proj) return;
    const [cx, cy] = proj;
    const t = state.currentTransform || d3.zoomIdentity;
    const node = state.svg.node();
    const width = node.clientWidth || node.getBoundingClientRect().width;
    const height = node.clientHeight || node.getBoundingClientRect().height;
    const sx = cx * t.k + t.x;
    const sy = cy * t.k + t.y;
    const marginX = width * 0.15;
    const marginY = height * 0.15;
    const inView = sx >= marginX && sx <= width - marginX &&
                   sy >= marginY && sy <= height - marginY;
    if (inView && t.k <= 1.2) return;
    if (t.k <= 1.05 && inView) return;

    const newX = width / 2 - cx * t.k;
    const newY = height / 2 - cy * t.k;
    state.svg.transition().duration(550)
      .call(state.zoomBehavior.transform,
            d3.zoomIdentity.translate(newX, newY).scale(t.k));
  }

  // Pulsing ring marker at an arbitrary [lng, lat] point. Parallel to
  // showRevealMarker, which uses a feature's centroid.
  function showRevealMarkerAtCoords(coords) {
    if (!state.projection || !state.mapG) return;
    const proj = state.projection(coords);
    if (!proj) return;
    const [cx, cy] = proj;
    state.mapG.selectAll('.reveal-marker').remove();
    const k = (state.currentTransform && state.currentTransform.k) || 1;
    const invK = 1 / k;
    const marker = state.mapG.append('g')
      .attr('class', 'reveal-marker')
      .attr('transform', 'translate(' + cx + ',' + cy + ') scale(' + invK + ')');
    marker.append('circle').attr('class', 'pulse-ring');
    marker.append('circle').attr('class', 'pulse-ring delayed');
    marker.append('circle').attr('class', 'center-dot').attr('r', 5);
    roundTimeout(() => {
      marker.transition().duration(300).style('opacity', 0).remove();
    }, 2400);
  }

  function handleSkip() {
    if (state.interactionLocked) return;
    if (!state.current) return;
    if (state.learn && state.learn.phase !== 'quiz') return;
    if (state.pin) {
      if (state.pin.phase === 'aim') pinReveal(null);
      return;
    }
    scoreAnswer(0);

    // In state-to-capital mode, also show the correct capital button
    if (state.gameMode === 'us-state-to-capital') {
      const correctCapital = US_CAPITALS[state.current];
      const container = document.getElementById('choices-panel');
      if (container) {
        container.querySelectorAll('.choice-btn').forEach(b => {
          if (b.dataset.capital === correctCapital) b.classList.add('choice-reveal');
        });
      }
    }

    // City mode has no polygon for the missed answer — reveal the dot
    // and pulse a ring at its coords instead.
    if (state.gameMode === 'us-city') {
      revealMissedCity(state.current);
      updateStats();
      return;
    }

    const targetFeature = activeFeatureByCanonical().get(state.current);
    if (targetFeature) {
      // Toast message depends on mode
      let msg;
      if (state.gameMode === 'us-capital-to-state') {
        msg = '<em>' + state.currentPromptText + '</em> → ' + state.current;
      } else if (state.gameMode === 'us-state-to-capital') {
        msg = '<em>' + state.current + '</em> → ' + US_CAPITALS[state.current];
      } else {
        msg = '<em>' + state.current + '</em> — shown on the map';
      }
      revealTargetFeature(targetFeature, msg);
    } else {
      nextCountry();
    }
    updateStats();
  }

  function updateStats() {
    if (state.pin) {
      // Pin the City: points · average miss · last miss · cities left
      const rs = state.pin.results;
      const kms = rs.filter(r => r.km != null).map(r => r.km);
      const last = rs.length ? rs[rs.length - 1] : null;
      document.getElementById('stat-score').textContent = state.score;
      // Header values are bare numbers; the labels say km
      const n = (km) => Math.round(km).toLocaleString('en-US');
      document.getElementById('stat-correct').textContent =
        kms.length ? n(kms.reduce((a, b) => a + b, 0) / kms.length) : '—';
      document.getElementById('stat-wrong').textContent =
        last ? (last.km == null ? 'skip' : n(last.km)) : '—';
      document.getElementById('stat-remaining').textContent =
        Math.max(0, state.totalQuestions - rs.length);
      return;
    }
    if (state.learn) {
      // Learn mode: Level · found this pass · restarts so far · still to learn
      document.getElementById('stat-score').textContent = state.learn.level;
      document.getElementById('stat-correct').textContent = state.correct;
      document.getElementById('stat-wrong').textContent = state.learn.restarts;
      // Left = provinces not yet introduced, matching "Level n of N" above the map
      document.getElementById('stat-remaining').textContent = state.learn.order.length - state.learn.level;
      return;
    }
    document.getElementById('stat-score').textContent = state.score;
    document.getElementById('stat-correct').textContent = state.correct;
    document.getElementById('stat-wrong').textContent = state.wrong;
    const remaining = Math.max(0, state.totalQuestions - state.correct - state.wrong);
    document.getElementById('stat-remaining').textContent = remaining;
  }

  function flashScore() {
    const el = document.getElementById('stat-score');
    if (!el) return;
    el.classList.remove('score-flash');
    void el.offsetWidth;
    el.classList.add('score-flash');
  }

  function showToast(kind, html) {
    const toast = document.getElementById('toast');
    toast.className = 'toast ' + kind;
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  function finishGame() {
    setLearnResultsLabels(false);
    state.lastWasLearn = false;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const total = state.correct + state.wrong;
    const pct = total > 0 ? Math.round((state.correct / total) * 100) : 0;
    const maxScore = state.totalQuestions * 2;

    // What this round says to work on next: misses first, then second tries
    state.roundNeedsWork = state.missed.concat(state.secondTry);

    mastery.recordSession({
      questions: state.sequence.length,
      firstTry: state.sequence.filter(points => points === 2).length,
      seconds: elapsed
    });

    // Focus rounds and daily replays are practice: no records, no share
    const isPractice = state.practice || !!state.dailyReplay;

    if (isPractice) {
      // Focus rounds are a subset of the level, so they'd distort the
      // level's bests; a daily replay is a puzzle you've already seen.
      // Practice also leaves the saved focus list alone — only a full game
      // rewrites it.
      state.brokenRecords = {};
      state.priorRecords = null;
      state.currentRecords = null;
    } else {
      // Snapshot previous records BEFORE committing this session so we can
      // show the user what they beat (or how close they came).
      const priorRecords = getRecords(state.currentContinent, state.difficulty, state.gameMode);

      const commitResult = commitSessionRecords({
        region: state.currentContinent,
        difficulty: state.difficulty,
        gameMode: state.gameMode,
        score: state.score,
        correct: state.correct,
        totalQuestions: state.totalQuestions,
        timeSeconds: elapsed
      });
      state.brokenRecords = commitResult.broken;
      state.priorRecords = priorRecords;
      state.currentRecords = commitResult.records;

      if (state.gameMode !== 'daily-five') {
        saveFocusList(state.gameMode, state.currentContinent, state.roundNeedsWork, state.totalQuestions);
      }
    }

    // Daily mode: persist this attempt so the player gets the locked-out
    // "already played today" view if they reload or come back later.
    // Practice replays don't write to storage so they never "use up" the day.
    if (state.gameMode === 'daily-five' && !state.dailyReplay && state.dailyDateKey) {
      saveDailyAttempt(state.dailyDateKey, {
        dateKey: state.dailyDateKey,
        puzzleNumber: dailyPuzzleNumber(state.dailyDateKey),
        countries: generateDailyPuzzle(state.dailyDateKey),
        sequence: state.sequence.slice(),
        score: state.score,
        correct: state.correct,
        wrong: state.wrong,
        total: state.totalQuestions,
        timeSeconds: elapsed,
        hardMode: state.hardMode,
        difficulty: state.difficulty,
        completedAt: Date.now()
      });
    }

    // Mirror to cloud after every round (fire-and-forget; no-op if sync
    // isn't set up). Practice rounds count too: they add to the mastery history.
    syncAfterGameEnd();

    const modeConfig = GAME_MODES[state.gameMode];
    let regionLabel = modeConfig.label(state.currentContinent);
    if (state.gameMode === 'daily-five') {
      regionLabel = 'Daily #' + dailyPuzzleNumber(state.dailyDateKey);
      if (state.dailyReplay) regionLabel += ' (Practice)';
    }
    if (state.practice) regionLabel += ' · Practice';
    const difficultyLabel = difficultyBadge(state.difficulty, state.hardMode);
    document.getElementById('results-region').textContent = regionLabel + difficultyLabel;
    document.getElementById('grade-big').textContent = pct;
    document.getElementById('r-correct').textContent = state.correct;
    document.getElementById('r-wrong').textContent = state.wrong;
    document.getElementById('r-time').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    document.getElementById('r-score').textContent = state.score + '/' + maxScore;

    renderRecordsBanner();
    renderBestsSection();

    const missedSection = document.getElementById('missed-section');
    const missedList = document.getElementById('missed-list');
    const missedHeading = document.getElementById('missed-heading');
    const missedLegend = document.getElementById('missed-legend');
    if (state.roundNeedsWork.length > 0) {
      // Heading word matches what the player was actually identifying.
      // us-city stores city names; us-state/us-capital-to-state/us-state-to-capital
      // all store state names (even when the prompt was a capital).
      const noun = targetNoun(state.gameMode, state.currentContinent);
      if (missedHeading) missedHeading.textContent = '— ' + noun + ' to revisit —';
      const items = state.missed.map(n => '<span class="missed-item">' + n + '</span>')
        .concat(state.secondTry.map(n => '<span class="missed-item second-try">' + n + '</span>'));
      missedList.innerHTML = items.join('<span style="opacity:0.3">·</span>');
      // Legend names only the kinds that actually appear
      let legend = '';
      if (state.missed.length) legend += '<span class="missed-key">Missed</span>';
      if (state.secondTry.length) legend += '<span class="missed-key second-try">Second try</span>';
      if (missedLegend) missedLegend.innerHTML = legend;
      missedSection.style.display = 'block';
    } else {
      missedSection.style.display = 'none';
    }

    // Daily mode tweaks the results actions: hide "Study Again" since you
    // can't replay today's puzzle for record. Replace with a Practice link
    // (after a practice replay too, so you can go again).
    const replayBtn = document.getElementById('replay-btn');
    const dailyPracticeBtn = document.getElementById('daily-practice-btn');
    if (state.gameMode === 'daily-five') {
      if (replayBtn) replayBtn.style.display = 'none';
      if (dailyPracticeBtn) dailyPracticeBtn.style.display = '';
    } else {
      if (replayBtn) replayBtn.style.display = '';
      if (dailyPracticeBtn) dailyPracticeBtn.style.display = 'none';
    }

    // "Practice These N" drills the list shown just above. After a focus
    // round, "Study Again" would be ambiguous, so it becomes "Full Game".
    // Practice is the suggested next step when offered, so it takes the
    // filled style and Study Again steps back to an outline.
    const practiceBtn = document.getElementById('practice-btn');
    const offerPractice = state.gameMode !== 'daily-five' && state.roundNeedsWork.length > 0;
    if (practiceBtn) {
      practiceBtn.style.display = offerPractice ? '' : 'none';
      const n = state.roundNeedsWork.length;
      practiceBtn.textContent = n === 1 ? 'Practice This One' : 'Practice These ' + n;
    }
    if (replayBtn) {
      replayBtn.textContent = state.practice ? 'Full Game' : 'Study Again';
      replayBtn.classList.toggle('primary', !offerPractice);
    }

    // Sharing a practice round would read like a real score for the level
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) shareBtn.style.display = isPractice ? 'none' : '';

    // "View Map" button: lets the player go back to the map with all the
    // green/red markers still in place, so they can take a screenshot.
    // Pointless in Hard Mode (markers don't persist between answers), so
    // hide it there.
    const viewMapBtn = document.getElementById('view-map-btn');
    if (viewMapBtn) {
      viewMapBtn.style.display = state.hardMode ? 'none' : '';
    }

    showReviewNext();
    switchScreen('results');
  }

  // Shows a "New Record!" banner at the top of results if any record broke.
  function renderRecordsBanner() {
    const banner = document.getElementById('new-record-banner');
    if (!banner) return;
    const broken = state.brokenRecords || {};
    const list = [];
    if (broken.score) list.push('Score');
    if (broken.time) list.push('Time');
    if (broken.accuracy) list.push('Accuracy');

    if (list.length === 0) {
      banner.style.display = 'none';
      return;
    }

    const headline = list.length === 3
      ? 'Triple Record Broken!'
      : list.length === 2
        ? 'Two New Records!'
        : 'New ' + list[0] + ' Record!';

    banner.innerHTML =
      '<div class="record-laurel">❧</div>' +
      '<div class="record-text">' + headline + '</div>' +
      '<div class="record-laurel flipped">❧</div>';
    banner.style.display = 'flex';
  }

  // Shows the "Your Personal Bests" panel with current records for this region × mode.
  function renderBestsSection() {
    const section = document.getElementById('bests-section');
    if (!section) return;
    const rec = state.currentRecords;
    if (!rec) { section.style.display = 'none'; return; }

    const broken = state.brokenRecords || {};

    const items = [];
    if (rec.bestScore) {
      items.push({
        label: 'Best Score',
        value: rec.bestScore.value + '/' + rec.bestScore.max,
        broken: broken.score
      });
    }
    if (rec.bestAccuracy) {
      items.push({
        label: 'Best Accuracy',
        value: rec.bestAccuracy.pct + '% · ' + rec.bestAccuracy.correct + '/' + rec.bestAccuracy.total,
        broken: broken.accuracy
      });
    }
    if (rec.bestTime) {
      items.push({
        label: 'Fastest Clean Sweep',
        value: formatTimeSeconds(rec.bestTime.value),
        broken: broken.time
      });
    }
    items.push({
      label: 'Games Played',
      value: String(rec.gamesPlayed || 0),
      broken: false
    });

    const html = items.map(it =>
      '<div class="best-item' + (it.broken ? ' broken' : '') + '">' +
        '<div class="best-value">' + it.value + (it.broken ? ' <span class="best-star">★</span>' : '') + '</div>' +
        '<div class="best-label">' + it.label + '</div>' +
      '</div>'
    ).join('');

    section.querySelector('.bests-grid').innerHTML = html;
    section.style.display = 'block';
  }

  /* =========================================================
   * SATELLITE IMAGERY (raster layer under the SVG map)
   *
   * Imagery comes from Esri World Imagery tiles, which are Web Mercator.
   * Our maps use other projections (Natural Earth, Albers USA, conics), so
   * the tiles can't simply be laid down — they're reprojected: each canvas
   * pixel is inverted through the current projection to lon/lat, then
   * sampled from the matching tile pixel. Inverting every pixel is slow,
   * so we invert a coarse grid and interpolate inside each cell, dropping
   * to per-pixel only where the projection jumps (the globe's edge,
   * Albers USA's Alaska/Hawaii insets).
   *
   * The canvas is redrawn once zooming settles; mid-gesture it's just
   * CSS-transformed to follow the SVG.
   * ========================================================= */

  const SAT_TILE_URL = (z, x, y) =>
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' +
    z + '/' + y + '/' + x;
  const SAT_CREDIT = 'Imagery © Esri, Maxar, Earthstar Geographics';
  const SAT_MAX_ZOOM = 15;     // deepest tile level we ask for
  const SAT_GRID = 8;          // canvas px between inverted grid points
  const SAT_MAX_TILES = 72;    // per redraw (the whole world at zoom 3 is 64); we drop a level past this
  const SAT_CACHE_TILES = 160; // decoded tiles kept in memory (256KB each)
  const SAT_SETTLE_MS = 160;   // wait this long after zooming stops to redraw

  const sat = {
    tiles: new Map(),  // 'z/x/y' -> { status: 'loading'|'ok'|'error', pixels, promise }; Map order = LRU
    drawnAt: null,     // zoom transform the canvas content was drawn at
    timer: null,
    gen: 0,            // bumped by every redraw/reset; stale async draws bail
    failed: false,     // last redraw found no imagery at all (offline?)
    scratch: null      // 256×256 canvas for decoding tiles to pixels
  };

  // Satellite is on for this game: the player's choice, or forced by Uncharted
  function satEnabled() {
    return state.difficulty === 'uncharted' || state.mapStyle === 'satellite';
  }

  // Sync the map's CSS classes and the in-game button with the settings
  function applyMapStyle() {
    const wrap = document.getElementById('map-wrap');
    const on = satEnabled();
    wrap.classList.toggle('sat-on', on && !sat.failed);
    wrap.classList.toggle('no-borders', state.difficulty === 'uncharted');
    const btn = document.getElementById('map-style-btn');
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }

  // In-game Parchment ⇄ Satellite flip (Uncharted is always satellite)
  function toggleMapStyle() {
    if (state.difficulty === 'uncharted') return;
    state.mapStyle = state.mapStyle === 'satellite' ? 'parchment' : 'satellite';
    saveMapStyle(state.mapStyle);
    sat.failed = false;
    applyMapStyle();
    satRedrawSoon(0);
  }

  // Called from renderMap(): the projection changed, so old pixels are wrong
  function satReset() {
    const canvas = document.getElementById('sat-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.transform = '';
    sat.drawnAt = null;
    sat.gen++;
    satRedrawSoon(0);
  }

  // Zoom-handler hook: follow the gesture now, redraw sharp once it settles
  function satOnZoom() {
    if (!satEnabled()) return;
    satFollowTransform();
    satRedrawSoon(SAT_SETTLE_MS);
  }

  // CSS-transform the canvas (drawn at sat.drawnAt) onto the current view
  function satFollowTransform() {
    const canvas = document.getElementById('sat-canvas');
    const t0 = sat.drawnAt;
    const t = state.currentTransform || d3.zoomIdentity;
    if (!t0) { canvas.style.transform = ''; return; }
    const s = t.k / t0.k;
    canvas.style.transform =
      'translate(' + (t.x - s * t0.x) + 'px,' + (t.y - s * t0.y) + 'px) scale(' + s + ')';
  }

  function satRedrawSoon(delay) {
    clearTimeout(sat.timer);
    if (!satEnabled()) return;
    sat.timer = setTimeout(satRedraw, delay);
  }

  function satSetLoading(on) {
    document.getElementById('sat-credit').textContent = (on ? 'Loading imagery… · ' : '') + SAT_CREDIT;
  }

  // Fetch (or reuse) one tile, decoded to raw pixels for fast sampling
  function satTile(z, x, y) {
    const key = z + '/' + x + '/' + y;
    let e = sat.tiles.get(key);
    if (e) {
      sat.tiles.delete(key); // move to the fresh end of the LRU order
      sat.tiles.set(key, e);
      return e;
    }
    e = { status: 'loading', pixels: null, promise: null };
    e.promise = new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // the tile server allows CORS, so pixels stay readable
      img.onload = () => {
        try {
          if (!sat.scratch) {
            sat.scratch = document.createElement('canvas');
            sat.scratch.width = sat.scratch.height = 256;
          }
          const sctx = sat.scratch.getContext('2d', { willReadFrequently: true });
          sctx.clearRect(0, 0, 256, 256);
          sctx.drawImage(img, 0, 0, 256, 256);
          e.pixels = new Uint32Array(sctx.getImageData(0, 0, 256, 256).data.buffer);
          e.status = 'ok';
        } catch (err) {
          e.status = 'error';
        }
        resolve();
      };
      img.onerror = () => { e.status = 'error'; resolve(); };
      img.src = SAT_TILE_URL(z, x, y);
    });
    sat.tiles.set(key, e);
    while (sat.tiles.size > SAT_CACHE_TILES) sat.tiles.delete(sat.tiles.keys().next().value);
    return e;
  }

  // Redraw for the current view: right away with whatever's cached
  // (blurry parent tiles stand in for missing ones), then again once the
  // missing tiles arrive.
  function satRedraw() {
    if (!satEnabled() || !state.projection) return;
    const gen = ++sat.gen;
    const plan = satPlan();
    if (!plan) return;
    const pending = [];
    plan.tiles.forEach(([z, x, y]) => {
      const e = satTile(z, x, y);
      if (e.status === 'loading') pending.push(e.promise);
    });
    if (pending.length === 0) {
      satDraw(plan, false);
      return;
    }
    satSetLoading(true);
    satDraw(plan, true);
    Promise.all(pending).then(() => {
      if (gen === sat.gen) satDraw(plan, false);
    });
  }

  // Work out which tiles the view needs, and where every grid point of
  // the canvas lands in Web Mercator.
  function satPlan() {
    const wrap = document.getElementById('map-wrap');
    const cssW = wrap.clientWidth, cssH = wrap.clientHeight;
    if (!cssW || !cssH) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    const t = state.currentTransform || d3.zoomIdentity;
    const proj = state.projection;
    // Unwrap longitudes around the projection's own center so they run
    // continuously across the view; the seam lands on the far side of the
    // globe. (Albers USA has no rotate(); its lower 48 center on 96°W.)
    const lon0 = typeof proj.rotate === 'function' ? -proj.rotate()[0] : -96;
    // Inverting a point off the edge of the globe still returns a lon/lat,
    // so check it projects back to where we started. Albers USA skips the
    // check: its forward projection rejects anything outside its insets,
    // and we want imagery across the whole frame there.
    const roundTrip = state.activeDataset !== 'us';
    const tol = 0.5 / (t.k * dpr) + 1e-3;
    const DEG = Math.PI / 180;

    // Canvas pixel → Web Mercator [x, y] in world units (x unwrapped), or null
    function invert(cx, cy) {
      const mx = (cx / dpr - t.x) / t.k;
      const my = (cy / dpr - t.y) / t.k;
      const ll = proj.invert([mx, my]);
      if (!ll || !isFinite(ll[0]) || !(Math.abs(ll[1]) <= 90)) return null;
      if (roundTrip) {
        const p = proj(ll);
        if (!p || Math.abs(p[0] - mx) > tol || Math.abs(p[1] - my) > tol) return null;
      }
      let dl = ll[0] - lon0;
      dl -= 360 * Math.floor((dl + 180) / 360);
      const lat = Math.max(-85.0511, Math.min(85.0511, ll[1]));
      const s = Math.sin(lat * DEG);
      return [(lon0 + dl + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)];
    }

    // Coarse grid, one column/row past the canvas edge so every cell is whole
    const G = SAT_GRID;
    const cols = Math.floor(W / G) + 2, rows = Math.floor(H / G) + 2;
    const gx = new Float64Array(cols * rows), gy = new Float64Array(cols * rows);
    for (let r = 0, i = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const m = invert(c * G, r * G);
        gx[i] = m ? m[0] : NaN;
        gy[i] = m ? m[1] : NaN;
      }
    }

    // Tile zoom: match tile pixels to canvas pixels (median over the view)
    const dens = [];
    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c + 1 < cols; c += 2) {
        const i = r * cols + c;
        const d = Math.hypot(gx[i + 1] - gx[i], gy[i + 1] - gy[i]);
        if (d > 0 && d < 0.1) dens.push(d); // NaN fails both; big jumps are seams
      }
    }
    if (!dens.length) return null;
    dens.sort((a, b) => a - b);
    const dMid = dens[dens.length >> 1];
    let z = Math.ceil(Math.log2(G / (256 * dMid)) - 0.3);
    z = Math.max(1, Math.min(SAT_MAX_ZOOM, z));

    // Tiles touched by grid points; step down a zoom level if too many
    let n, tiles, tx0, tx1, ty0, ty1;
    for (;;) {
      n = 1 << z;
      tiles = new Map();
      tx0 = Infinity; tx1 = -Infinity; ty0 = Infinity; ty1 = -Infinity;
      for (let i = 0; i < gx.length; i++) {
        if (gx[i] !== gx[i]) continue;
        const tx = Math.floor(gx[i] * n);
        const ty = Math.min(n - 1, Math.max(0, Math.floor(gy[i] * n)));
        const wx = ((tx % n) + n) % n;
        tiles.set(wx + '/' + ty, [z, wx, ty]);
        if (tx < tx0) tx0 = tx;
        if (tx > tx1) tx1 = tx;
        if (ty < ty0) ty0 = ty;
        if (ty > ty1) ty1 = ty;
      }
      if (tiles.size <= SAT_MAX_TILES || z <= 1) break;
      z--;
    }

    return {
      W, H, t, cols, rows, gx, gy, z, n, invert,
      tx0, ty0, nx: tx1 - tx0 + 1, ny: ty1 - ty0 + 1,
      tiles: Array.from(tiles.values()),
      // Filled in by the first satDraw and reused by the next one:
      cellKind: new Uint8Array(cols * rows), // 0 unknown, 1 interpolate, 2 per-pixel
      cellPix: new Map()                     // per-pixel cell -> Mercator coords
    };
  }

  // Paint the canvas from the plan. `interim` draws only if some imagery is
  // cached, so a zoom-in shows upscaled parents instead of a blank frame.
  function satDraw(plan, interim) {
    const { W, H, cols, rows, gx, gy, z, n, tx0, ty0, nx, ny } = plan;

    // One lookup slot per tile in the view's bounding box: the tile's own
    // pixels, or a cached ancestor's (sampled at 2^dz scale) meanwhile.
    const slots = nx * ny;
    const slotPix = new Array(slots).fill(null);
    const slotDz = new Uint8Array(slots);
    const slotOx = new Uint16Array(slots);
    const slotOy = new Uint16Array(slots);
    let found = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = (((tx0 + i) % n) + n) % n, y = ty0 + j;
        for (let dz = 0; dz <= 6 && dz <= z; dz++) {
          const e = sat.tiles.get((z - dz) + '/' + (x >> dz) + '/' + (y >> dz));
          if (e && e.status === 'ok') {
            const s = j * nx + i;
            slotPix[s] = e.pixels;
            slotDz[s] = dz;
            slotOx[s] = x & ((1 << dz) - 1);
            slotOy[s] = y & ((1 << dz) - 1);
            found++;
            break;
          }
        }
      }
    }
    if (interim && !found) return;

    const canvas = document.getElementById('sat-canvas');
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const out = new Uint32Array(img.data.buffer);
    const scale = n * 256;        // world units → tile pixels at zoom z
    const maxY = scale - 1e-6;

    // Copy the tile pixel under Mercator point (X, Y) into output pixel o
    function put(o, X, Y) {
      if (Y < 0) Y = 0; else if (Y > maxY) Y = maxY;
      const tx = Math.floor(X / 256), ty = Math.floor(Y / 256);
      const i = tx - tx0, j = ty - ty0;
      if (i < 0 || i >= nx || j < 0 || j >= ny) return;
      const s = j * nx + i;
      const pix = slotPix[s];
      if (!pix) return;
      const k = 1 << slotDz[s];
      const u = ((slotOx[s] * 256 + X - tx * 256) / k) | 0;
      const v = ((slotOy[s] * 256 + Y - ty * 256) / k) | 0;
      out[o] = pix[(v << 8) | u];
    }

    const G = SAT_GRID;
    for (let r = 0; r + 1 < rows; r++) {
      const y0 = r * G;
      if (y0 >= H) break;
      const y1 = Math.min(y0 + G, H);
      for (let c = 0; c + 1 < cols; c++) {
        const x0 = c * G;
        if (x0 >= W) break;
        const x1 = Math.min(x0 + G, W);
        const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
        const ax = gx[a] * scale, ay = gy[a] * scale;
        const bx = gx[b] * scale, by = gy[b] * scale;
        const cx = gx[cc] * scale, cy = gy[cc] * scale;
        const dx = gx[d] * scale, dy = gy[d] * scale;
        let kind = plan.cellKind[a];
        if (kind === 0) {
          const va = ax === ax, vb = bx === bx, vc = cx === cx, vd = dx === dx;
          if (!va && !vb && !vc && !vd) {
            kind = 3; // wholly off the globe: nothing to paint
          } else if (va && vb && vc && vd) {
            // Interpolate only if the real center lands within a pixel of
            // the interpolated one (no seam or inset edge inside the cell)
            const m = plan.invert(x0 + G / 2, y0 + G / 2);
            kind = m &&
              Math.abs(m[0] * scale - (ax + bx + cx + dx) / 4) +
              Math.abs(m[1] * scale - (ay + by + cy + dy) / 4) < 1 ? 1 : 2;
          } else {
            kind = 2; // straddles the globe's edge
          }
          plan.cellKind[a] = kind;
        }
        if (kind === 1) {
          for (let py = y0; py < y1; py++) {
            const v = (py - y0) / G;
            const lx = ax + (cx - ax) * v, ly = ay + (cy - ay) * v;
            const rx = bx + (dx - bx) * v, ry = by + (dy - by) * v;
            const sx = (rx - lx) / G, sy = (ry - ly) / G;
            let X = lx, Y = ly, o = py * W + x0;
            for (let px = x0; px < x1; px++, o++, X += sx, Y += sy) put(o, X, Y);
          }
        } else if (kind === 2) {
          let cell = plan.cellPix.get(a);
          if (!cell) {
            cell = new Float64Array(2 * G * G).fill(NaN);
            for (let py = y0, q = 0; py < y0 + G; py++) {
              for (let px = x0; px < x0 + G; px++, q += 2) {
                const m = plan.invert(px, py);
                if (m) { cell[q] = m[0]; cell[q + 1] = m[1]; }
              }
            }
            plan.cellPix.set(a, cell);
          }
          for (let py = y0; py < y1; py++) {
            let o = py * W + x0, q = (py - y0) * G * 2;
            for (let px = x0; px < x1; px++, o++, q += 2) {
              if (cell[q] === cell[q]) put(o, cell[q] * scale, cell[q + 1] * scale);
            }
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    sat.drawnAt = plan.t;
    satFollowTransform();

    if (interim) return;
    satSetLoading(false);
    // Forget failed tiles so a later redraw retries them
    plan.tiles.forEach(([tz, tx, ty]) => {
      const key = tz + '/' + tx + '/' + ty;
      const e = sat.tiles.get(key);
      if (e && e.status === 'error') sat.tiles.delete(key);
    });
    // No imagery at all: fall back to parchment (Uncharted keeps its
    // borderless silhouette) until a later redraw succeeds
    const failed = found === 0;
    if (failed !== sat.failed) {
      sat.failed = failed;
      applyMapStyle();
      if (failed) showToast('wrong', 'Satellite imagery couldn’t load — showing the parchment map');
    }
  }

/* =========================================================
 * MASTERY (per-item learning history, spaced review, daily activity)
 *
 * Pure logic, no DOM: storage and clock can be injected, so the same code
 * runs in the game and under node.
 *   const mastery = Mastery.create();   // the page's localStorage, the real clock
 *   const mastery = Mastery.create({ storage: fakeStorage, now: () => fakeMs });
 *
 * Storage shape under key "atlas-mastery" (synced; kept compact because it
 * shares the sync payload with every other store):
 * {
 *   v: 2,
 *   items: { "<skill>": { "<name>": [lastDay, box, first, streak, second, missed, dueFix] } },
 *   days:  { "<dayNumber>": [games, questions, firstTry, seconds] },
 *   life:  [games, questions, firstTry, seconds, daysActive, longestStreak, runEnd, runLength]
 * }
 * - skill is an opaque string chosen by the game ("world-country", "flag",
 *   "province:china", ...); name is the game's canonical name.
 * - dayNumber = whole local-calendar days since 2026-01-01.
 * - Trailing zeros of an item are dropped, and only seen items are stored.
 *   seen = first + second + missed. An item is due INTERVALS[box] days after
 *   lastDay unless dueFix says otherwise: dueFix n > 0 means n - 1 days after.
 * - days keeps the last 400 days. life holds the lifetime tallies, so totals
 *   and streaks don't shrink when old rows are pruned; runLength is the run
 *   of active days ending on runEnd.
 * - An item written in the wide v: 1 layout, [seen, first, second, missed,
 *   streak, box, dueDay, lastDay], is read too (its eight fields give it
 *   away) and rewritten in this layout on the next save.
 *
 * Scheduling (Leitner): a first-try answer moves an item up a box, at most
 * once per calendar day, and schedules it INTERVALS[box] days out. A
 * second-try answer caps it at box 2, due tomorrow. A miss or skip sends it
 * to box 1, due again straight away.
 * ========================================================= */

const Mastery = (function () {
  'use strict';

  const KEY = 'atlas-mastery';
  const VERSION = 2;
  const INTERVALS = [0, 1, 3, 7, 16, 35];        // days until the next review, by box
  const WEIGHTS = [0, 0.2, 0.45, 0.7, 0.9, 1];   // how much of "mastered" each box is worth
  const LEVELS = ['new', 'learning', 'familiar', 'mastered'];
  const OUTCOMES = ['miss', 'second', 'first'];  // indexed by points earned (0, 1, 2)
  const MAX_BOX = INTERVALS.length - 1;
  const KEEP_DAYS = 400;                         // day rows older than this are pruned
  const DAY_MS = 86400000;
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const COUNT_LIMIT = 1e9;                       // ceilings for numbers read from storage or sync
  const DAY_LIMIT = 1e6;

  // Item fields
  const LAST = 0, BOX = 1, FIRST = 2, STREAK = 3, SECOND = 4, MISSED = 5, DUE_FIX = 6;
  // Lifetime fields; 0-3 are the day-row fields in day-row order
  const DAYS_ACTIVE = 4, LONGEST = 5, RUN_END = 6, RUN_LEN = 7;

  /* ===== Days ===== */

  // Whole local-calendar days from 2026-01-01 to the day containing `ms`.
  // Counts calendar fields, not elapsed hours, so 23- and 25-hour DST days
  // and days whose midnight doesn't exist still come out as one day each.
  function dayNumber(ms) {
    const d = new Date(ms);
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH_UTC) / DAY_MS);
  }

  // 'YYYY-MM-DD' (local calendar) for a day number
  function dayToDate(day) {
    const ms = EPOCH_UTC + day * DAY_MS;
    return isFinite(ms) && Math.abs(ms) < 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : '';
  }

  /* ===== Store shape ===== */

  // Lookup table without Object.prototype, so a skill or name such as
  // "constructor" or "__proto__" is just another key
  function dict() {
    return Object.create(null);
  }

  function emptyStore() {
    return { v: VERSION, items: dict(), days: dict() };
  }

  // Non-negative whole number; 0 for anything else
  function count(v) {
    const n = Math.floor(Number(v));
    return n > 0 ? Math.min(n, COUNT_LIMIT) : 0;
  }

  // Whole day number (may be negative), or null if it isn't a number
  function dayValue(v) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return Math.max(-DAY_LIMIT, Math.min(DAY_LIMIT, Math.floor(v)));
  }

  function isMap(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  // Drops trailing zeros (in place)
  function trim(a) {
    let n = a.length;
    while (n > 1 && !a[n - 1]) n--;
    a.length = n;
    return a;
  }

  function seenOf(it) {
    return (it[FIRST] || 0) + (it[SECOND] || 0) + (it[MISSED] || 0);
  }

  function dueOf(it) {
    const fix = it[DUE_FIX] || 0;
    return it[LAST] + (fix ? fix - 1 : INTERVALS[it[BOX]]);
  }

  // The stored form of an item last answered on `last` and due `dueIn` days
  // later (capped, so an absurd due day reads back the way it was written)
  function pack(last, box, dueIn, first, streak, second, missed) {
    const wait = Math.min(dueIn, DAY_LIMIT - 1);
    return trim([last, box, first, streak, second, missed, wait === INTERVALS[box] ? 0 : wait + 1]);
  }

  function levelOf(box) {
    return box >= 4 ? LEVELS[3] : box >= 2 ? LEVELS[2] : LEVELS[1];
  }

  // A stored item from untrusted JSON, or null if it isn't one. Eight fields
  // mean the wide v1 layout [seen, first, second, missed, streak, box, dueDay,
  // lastDay]; the compact layout never has more than seven.
  function cleanItem(a) {
    if (!Array.isArray(a)) return null;
    const wide = a.length === 8;
    const last = dayValue(wide ? a[7] : a[LAST]);
    if (last === null) return null;
    const first = count(wide ? a[1] : a[FIRST]);
    const second = count(wide ? a[2] : a[SECOND]);
    let missed = count(wide ? a[3] : a[MISSED]);
    // Answers the three tallies don't account for can't have been first-try
    if (wide) missed += Math.max(0, count(a[0]) - first - second - missed);
    if (first + second + missed === 0) return null;
    const box = Math.max(1, Math.min(MAX_BOX, count(wide ? a[5] : a[BOX])));
    const streak = count(wide ? a[4] : a[STREAK]);
    let dueIn;
    if (wide) {
      const due = dayValue(a[6]);
      dueIn = due === null ? INTERVALS[box] : Math.max(0, due - last);
    } else {
      const fix = Math.min(count(a[DUE_FIX]), DAY_LIMIT);
      dueIn = fix ? fix - 1 : INTERVALS[box];
    }
    return pack(last, box, dueIn, first, streak, second, missed);
  }

  // A clean store from parsed JSON, or null if it isn't one (or is from a
  // version this code doesn't know). Copies everything, so the result shares
  // nothing with its input.
  function normalize(raw) {
    if (!isMap(raw)) return null;
    if (raw.v !== undefined && raw.v !== 1 && raw.v !== VERSION) return null;
    const st = emptyStore();

    if (isMap(raw.items)) {
      Object.keys(raw.items).forEach(skill => {
        const from = raw.items[skill];
        if (!isMap(from)) return;
        Object.keys(from).forEach(name => {
          const it = cleanItem(from[name]);
          if (it) (st.items[skill] || (st.items[skill] = dict()))[name] = it;
        });
      });
    }

    if (isMap(raw.days)) {
      Object.keys(raw.days).forEach(k => {
        const row = raw.days[k];
        // Only the way a day number is written out counts as one: "007" or
        // "-0" would land on another row's key
        if (!/^(0|-?[1-9]\d{0,5})$/.test(k) || !Array.isArray(row)) return;
        const clean = [count(row[0]), count(row[1]), count(row[2]), count(row[3])];
        if (clean[0] + clean[1] + clean[2] + clean[3] > 0) st.days[k] = clean;
      });
    }

    if (Array.isArray(raw.life)) {
      st.life = [];
      for (let i = 0; i <= LONGEST; i++) st.life[i] = count(raw.life[i]);
      const end = dayValue(raw.life[RUN_END]);
      st.life[RUN_END] = end === null ? -DAY_LIMIT : end;
      st.life[RUN_LEN] = count(raw.life[RUN_LEN]);
    }
    return st;
  }

  /* ===== Activity log: runs, lifetime tallies, pruning ===== */

  // Day numbers with at least one game, ascending
  function activeDays(st) {
    const out = [];
    for (const k in st.days) if (st.days[k][0] > 0) out.push(Number(k));
    return out.sort((a, b) => a - b);
  }

  // Every run of active days the store knows of, oldest first, as [first day,
  // last day] pairs: the runs in the day rows, the stored run (which can reach
  // back past the pruned rows) and, in a merge, the other device's stored run
  // (`other` is its lifetime row) - joined wherever they overlap or abut
  function runsOf(st, other) {
    const runs = [];
    activeDays(st).forEach(d => {
      const top = runs[runs.length - 1];
      if (top && d === top[1] + 1) top[1] = d;
      else runs.push([d, d]);
    });
    [st.life, other].forEach(life => {
      if (life && life[RUN_LEN] > 0) runs.push([life[RUN_END] - life[RUN_LEN] + 1, life[RUN_END]]);
    });
    runs.sort((a, b) => a[0] - b[0]);
    const joined = [];
    runs.forEach(r => {
      const top = joined[joined.length - 1];
      if (top && r[0] <= top[1] + 1) top[1] = Math.max(top[1], r[1]);
      else joined.push(r);
    });
    return joined;
  }

  // Sums of the day rows' four numbers, then the number of days with a game
  // (the first five lifetime fields, as far as the rows show them), over the
  // rows dated `from` or later, or over all of them
  function rowTotals(st, from) {
    const out = [0, 0, 0, 0, 0];
    for (const k in st.days) {
      if (from !== undefined && Number(k) < from) continue;
      for (let i = 0; i < 4; i++) out[i] += st.days[k][i];
      if (st.days[k][0] > 0) out[DAYS_ACTIVE]++;
    }
    return out;
  }

  // The first of the "recent" days: those whose rows every device still has.
  // The two oldest days a save keeps don't count, as a device one time zone
  // ahead has pruned them already.
  function recentFrom(today) {
    return today - KEEP_DAYS + 2;
  }

  // Brings the lifetime row into line with everything else the store holds:
  // tallies at least what the day rows show (so rows are counted before they
  // are pruned), and the stored run brought up to date, with `other`'s run
  // joined in when merging
  function settle(st, today, other) {
    if (!st.life && !Object.keys(st.days).length) return;
    const life = st.life || (st.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
    rowTotals(st).forEach((sum, i) => { life[i] = Math.max(life[i], sum); });
    // The recent rows spell out every run that began among them. The run to
    // remember is the one that began earlier: its first days are in no row,
    // and a day played on another device may yet join it to today. Failing
    // that, the latest run. No real run ends after tomorrow (where a device
    // one time zone ahead may already be), so one from a clock that ran fast
    // is cut back to tomorrow, or passed over if it starts later still.
    let early = null, latest = null, longest = life[LONGEST];
    runsOf(st, other).forEach(r => {
      longest = Math.max(longest, r[1] - r[0] + 1);
      if (r[0] < recentFrom(today)) early = r;
      if (r[0] <= today + 1) latest = r;
    });
    const run = early || latest;
    life[RUN_END] = run ? Math.min(run[1], today + 1) : -DAY_LIMIT;
    life[RUN_LEN] = run ? life[RUN_END] - run[0] + 1 : 0;
    life[LONGEST] = longest;
    life[DAYS_ACTIVE] = Math.max(life[DAYS_ACTIVE], longest);
    // Nothing is left above the ceiling it would be read back with
    for (let i = 0; i <= RUN_LEN; i++) {
      if (i !== RUN_END) life[i] = Math.min(life[i], COUNT_LIMIT);
    }
  }

  // Drops day rows more than KEEP_DAYS old. Returns true if any went.
  function pruneStore(st, today) {
    const cutoff = today - KEEP_DAYS;
    let changed = false;
    for (const k in st.days) {
      if (Number(k) < cutoff) {
        delete st.days[k];
        changed = true;
      }
    }
    return changed;
  }

  /* ===== Merging two stores ===== */

  // True if history `a` of an item should replace history `b`: more answers
  // wins, then the more recent, then the higher box. The remaining fields only
  // make the choice the same whichever side does the merging.
  function better(a, b) {
    const order = [seenOf(a) - seenOf(b), a[LAST] - b[LAST], a[BOX] - b[BOX]];
    [FIRST, STREAK, SECOND, DUE_FIX].forEach(i => order.push((a[i] || 0) - (b[i] || 0)));
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== 0) return order[i] > 0;
    }
    return false;
  }

  // Merges `src` into `dst`. `src` must be a normalize() result nobody else
  // holds: `dst` takes over its arrays, and both come out pruned as of `today`.
  function mergeStores(dst, src, today) {
    // What each side's lifetime tallies hold beyond its recent day rows. Both
    // sides are first brought to where a save today would leave them, so that
    // each has all of its recent rows and nothing older than a save keeps.
    const recent = recentFrom(today);
    const older = [dst, src].map(st => {
      settle(st, today);
      pruneStore(st, today);
      return rowTotals(st, recent).map((sum, i) => (st.life ? st.life[i] - sum : 0));
    });

    for (const skill in src.items) {
      const from = src.items[skill];
      const to = dst.items[skill] || (dst.items[skill] = dict());
      for (const name in from) {
        if (!to[name] || better(from[name], to[name])) to[name] = from[name];
      }
    }
    for (const k in src.days) {
      const mine = dst.days[k], theirs = src.days[k];
      if (!mine) dst.days[k] = theirs;
      else for (let i = 0; i < 4; i++) mine[i] = Math.max(mine[i], theirs[i]);
    }
    if (src.life) {
      const life = dst.life || (dst.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
      // The older history is taken to be one both devices share (the larger
      // count of the two) and the recent rows, now merged, are counted on top:
      // games played on one device before it saw the other's are added, not
      // swallowed by the larger total
      rowTotals(dst, recent).forEach((sum, i) => { life[i] = Math.max(older[0][i], older[1][i]) + sum; });
      life[LONGEST] = Math.max(life[LONGEST], src.life[LONGEST]);
    }
    // The two devices' runs are one run if the days they cover meet, which
    // settle() works out from both stored runs and the merged day rows
    settle(dst, today, src.life);
  }

  /* ===== Instance ===== */

  function defaultStorage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
      return null;
    }
  }

  // options: storage (getItem/setItem/removeItem; default localStorage, null =
  // memory only), now (ms clock; default Date.now), key, promote ('daily', the
  // default = a box gained at most once per calendar day; 'always' = every
  // first-try answer gains one)
  function create(options) {
    const opts = options || {};
    const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const key = opts.key || KEY;
    const promoteAlways = opts.promote === 'always';

    let store = emptyStore();
    let lastRaw = null;    // what storage held when we last read or wrote it
    let dirty = false;     // true while the latest save hasn't reached storage
    let trusted = false;   // true once storage has handed back what was saved
    let tidied = null;     // the day the tallies and pruning were last brought up to date

    // A clock that throws, or hands back something Date can't hold, is
    // replaced by the real one
    function today() {
      let day;
      try { day = dayNumber(Number(now())); } catch (e) { day = NaN; }
      return isFinite(day) ? day : dayNumber(Date.now());
    }

    // The stored string, null if there is none, undefined if storage can't be read
    function read() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(key);
        return typeof raw === 'string' ? raw : null;
      } catch (e) {
        return undefined;
      }
    }

    function parse(raw) {
      try {
        return normalize(JSON.parse(raw));
      } catch (e) {
        return null;
      }
    }

    function persist(raw) {
      if (!storage) return;
      try {
        storage.setItem(key, raw);
        lastRaw = raw;
        dirty = false;
      } catch (e) {
        dirty = true;   // storage full or blocked: carry on in memory
        return;
      }
      // A storage that doesn't hand back what it was given (a stub, some
      // private modes) reads as empty forever; reload() must not take that
      // for another tab wiping the store
      if (!trusted) trusted = read() === raw;
    }

    // Settles the lifetime tallies and prunes old day rows, once per calendar
    // day: after that, writes and merges keep the tallies in step themselves
    // and no row can age past the cutoff until the date changes. Returns true
    // if rows were pruned.
    function tidy() {
      const day = today();
      if (tidied === day) return false;
      settle(store, day);
      tidied = day;
      return pruneStore(store, day);
    }

    function save() {
      tidy();
      if (storage) persist(JSON.stringify(store));
    }

    // Picks up what another tab wrote since we last looked, so two tabs don't
    // overwrite each other: its data is merged in, and a wiped store empties
    // ours. Runs before every write; call it on the window's "storage" event
    // to refresh what the read methods see. Returns true if storage had changed.
    function reload() {
      const raw = read();
      if (raw === undefined || raw === lastRaw) return false;
      if (raw === null) {
        if (!trusted) return false;
        store = emptyStore();
      } else {
        trusted = true;
        const other = parse(raw);
        if (other) mergeStores(store, other, today());
      }
      lastRaw = raw;
      return true;
    }

    function lookup(skill, name) {
      const bySkill = store.items[skill];
      return (bySkill && bySkill[name]) || null;
    }

    // The names a query covers: the caller's list without repeats, or every
    // stored name of the skill when no list is given
    function nameList(skill, names) {
      if (!Array.isArray(names)) return Object.keys(store.items[skill] || {});
      const had = new Set();
      return names.filter(n => typeof n === 'string' && !had.has(n) && had.add(n));
    }

    function view(it, day) {
      if (!it) {
        return {
          seen: 0, first: 0, second: 0, missed: 0, streak: 0, box: 0,
          due: null, last: null, accuracy: null, level: LEVELS[0], isDue: false
        };
      }
      const first = it[FIRST] || 0, second = it[SECOND] || 0, missed = it[MISSED] || 0;
      const seen = first + second + missed;
      const dueDay = dueOf(it);
      return {
        seen: seen, first: first, second: second, missed: missed,
        streak: it[STREAK] || 0, box: it[BOX], due: dueDay, last: it[LAST],
        accuracy: first / seen, level: levelOf(it[BOX]), isDue: dueDay <= day
      };
    }

    function dayView(day) {
      const row = store.days[day] || [0, 0, 0, 0];
      return { day: day, date: dayToDate(day), games: row[0], questions: row[1], firstTry: row[2], seconds: row[3] };
    }

    // ---- Writing ----

    // Records one answer: outcome is 'first' (right first try), 'second'
    // (right second try) or 'miss' (missed twice, or skipped). Returns the
    // item as get() would. An unknown outcome changes nothing; a skill or
    // name that isn't a non-empty string returns null.
    function record(skill, name, outcome) {
      if (typeof skill !== 'string' || !skill || typeof name !== 'string' || !name) return null;
      if (OUTCOMES.indexOf(outcome) < 0) return get(skill, name);
      reload();
      const day = today();
      const it = lookup(skill, name);
      let box = it ? it[BOX] : 0;
      let first = it ? it[FIRST] || 0 : 0, second = it ? it[SECOND] || 0 : 0, missed = it ? it[MISSED] || 0 : 0;
      let inARow = it ? it[STREAK] || 0 : 0;
      let dueDay;

      if (outcome === 'first') {
        first++;
        inARow++;
        if (promoteAlways || !it || it[LAST] !== day) {
          box = Math.min(MAX_BOX, box + 1);
          dueDay = day + INTERVALS[box];
        } else {
          // Already answered today: repeating it the same day earns no second
          // step up, but it does clear an item that was due
          dueDay = Math.max(dueOf(it), day + 1);
        }
      } else if (outcome === 'second') {
        second++;
        inARow = 0;
        box = Math.max(1, Math.min(box, 2));
        dueDay = day + 1;
      } else {
        missed++;
        inARow = 0;
        box = 1;
        dueDay = day;
      }

      const next = pack(day, box, dueDay - day, first, inARow, second, missed);
      (store.items[skill] || (store.items[skill] = dict()))[name] = next;
      save();
      return view(next, day);
    }

    // Adds one finished game (or practice round) to today's row and to the
    // lifetime tallies. Returns today's row as activity() would.
    function recordSession(session) {
      const s = session || {};
      reload();
      const day = today();
      const row = store.days[day] || (store.days[day] = [0, 0, 0, 0]);
      const life = store.life || (store.life = [0, 0, 0, 0, 0, 0, -DAY_LIMIT, 0]);
      // A number that isn't finite is a bug in the caller, not a long game
      const amount = v => (isFinite(v) ? count(v) : 0);
      const add = [1, amount(s.questions), 0, amount(Math.round(Number(s.seconds)))];
      add[2] = Math.min(amount(s.firstTry), add[1]);
      if (row[0] === 0) life[DAYS_ACTIVE]++;
      for (let i = 0; i < 4; i++) {
        row[i] += add[i];
        life[i] += add[i];
      }
      settle(store, day);   // today joins the run that reached yesterday, or starts one

      save();
      return dayView(day);
    }

    // Folds another device's export into this store. Per item, the history
    // with more answers wins (then the more recent, then the higher box); day
    // rows keep the larger of each number, and the lifetime tallies and the
    // streak follow from the merged rows. Returns true if this store changed.
    function mergeBlob(remote) {
      let other = null;
      try { other = normalize(remote); } catch (e) { /* not a store */ }
      if (!other) return false;
      reload();
      tidy();
      const before = JSON.stringify(store);
      mergeStores(store, other, tidied);
      const after = JSON.stringify(store);
      if (after !== before || dirty) persist(after);
      return after !== before;
    }

    // Drops day rows older than 400 days (their numbers stay in the lifetime
    // tallies). Runs on every save; returns true if any rows went.
    function prune() {
      tidied = null;
      const changed = tidy();
      if (changed) persist(JSON.stringify(store));
      return changed;
    }

    function reset() {
      store = emptyStore();
      dirty = false;
      lastRaw = null;
      if (!storage) return;
      try {
        if (typeof storage.removeItem === 'function') storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(store));
      } catch (e) {
        dirty = true;   // storage blocked: memory is cleared, and the next save that gets through replaces the rest
      }
      // Anything storage still holds is what was just wiped: reload() must
      // not take it for another tab's work and merge it back in
      const left = read();
      if (left !== undefined) lastRaw = left;
    }

    // Saves are immediate, so there is normally nothing to flush; this only
    // retries a save that storage refused
    function flush() {
      if (dirty) save();
    }

    // ---- Reading ----

    function get(skill, name) {
      return view(lookup(skill, name), today());
    }

    // Counts by level over `names`, how many are due, pooled first-try
    // accuracy (null until something is seen), and pct: the mean box weight,
    // 0-100 to one decimal
    function summary(skill, names) {
      const day = today();
      const list = nameList(skill, names);
      const out = { total: list.length, seen: 0, new: 0, learning: 0, familiar: 0, mastered: 0, due: 0, accuracy: null, pct: 0 };
      let first = 0, answers = 0, weight = 0;
      list.forEach(name => {
        const it = lookup(skill, name);
        if (!it) {
          out.new++;
          return;
        }
        out.seen++;
        out[levelOf(it[BOX])]++;
        if (dueOf(it) <= day) out.due++;
        first += it[FIRST] || 0;
        answers += seenOf(it);
        weight += WEIGHTS[it[BOX]];
      });
      if (answers) out.accuracy = first / answers;
      if (list.length) out.pct = Math.round(weight / list.length * 1000) / 10;
      return out;
    }

    // Names due today or earlier: most overdue first, then lowest box, then
    // most missed. Never-seen names aren't due.
    function due(skill, names, query) {
      const day = today();
      const rows = [];
      nameList(skill, names).forEach((name, i) => {
        const it = lookup(skill, name);
        if (it && dueOf(it) <= day) rows.push({ name: name, due: dueOf(it), box: it[BOX], missed: it[MISSED] || 0, i: i });
      });
      rows.sort((a, b) => a.due - b.due || a.box - b.box || b.missed - a.missed || a.i - b.i);
      const limit = query ? query.limit : null;
      return (limit == null ? rows : rows.slice(0, count(limit))).map(r => r.name);
    }

    // Up to n names with the lowest first-try accuracy (ties: more misses, then
    // more recent), among those seen at least minSeen times. A name never
    // missed on the first try isn't weak, so it is left out unless
    // includePerfect is set.
    function weakest(skill, names, n, query) {
      const o = query || {};
      const minSeen = o.minSeen == null ? 2 : o.minSeen;
      const rows = [];
      nameList(skill, names).forEach((name, i) => {
        const it = lookup(skill, name);
        if (!it) return;
        const seen = seenOf(it), first = it[FIRST] || 0;
        if (seen < minSeen || (first === seen && !o.includePerfect)) return;
        rows.push({ name: name, accuracy: first / seen, missed: it[MISSED] || 0, last: it[LAST], i: i });
      });
      rows.sort((a, b) => a.accuracy - b.accuracy || b.missed - a.missed || b.last - a.last || a.i - b.i);
      return (n == null ? rows : rows.slice(0, count(n))).map(r => r.name);
    }

    // { name: level } for colouring a map. Built from entries so that a name
    // such as "__proto__" becomes an ordinary key of the result.
    function levels(skill, names) {
      return Object.fromEntries(nameList(skill, names).map(name => {
        const it = lookup(skill, name);
        return [name, it ? levelOf(it[BOX]) : LEVELS[0]];
      }));
    }

    // The last `daysBack` days ending today, oldest first, quiet days included
    function activity(daysBack) {
      const n = Math.min(count(daysBack == null ? 30 : daysBack), 4000);
      const day = today();
      const out = [];
      for (let d = day - n + 1; d <= day; d++) out.push(dayView(d));
      return out;
    }

    // Days in a row with at least one game. `current` holds until the end of
    // the day after the last active day; `longest` is the lifetime best.
    // Tomorrow counts as "now" too: a device one time zone ahead may be there.
    function streak() {
      const day = today();
      let longest = store.life ? store.life[LONGEST] : 0;
      let current = 0;
      runsOf(store).forEach(r => {
        longest = Math.max(longest, r[1] - r[0] + 1);
        if (r[1] >= day - 1 && r[0] <= day + 1) current = Math.min(r[1], day + 1) - r[0] + 1;
      });
      return { current: current, longest: longest };
    }

    function totals() {
      const life = store.life || [0, 0, 0, 0, 0];
      const sums = [0, 0, 0, 0];
      let active = 0, itemsSeen = 0, itemsMastered = 0;
      for (const k in store.days) {
        for (let i = 0; i < 4; i++) sums[i] += store.days[k][i];
        if (store.days[k][0] > 0) active++;
      }
      for (const skill in store.items) {
        for (const name in store.items[skill]) {
          itemsSeen++;
          if (store.items[skill][name][BOX] >= 4) itemsMastered++;
        }
      }
      return {
        games: Math.max(life[0], sums[0]), questions: Math.max(life[1], sums[1]),
        firstTry: Math.max(life[2], sums[2]), seconds: Math.max(life[3], sums[3]),
        daysActive: Math.max(life[DAYS_ACTIVE], active),
        itemsSeen: itemsSeen, itemsMastered: itemsMastered
      };
    }

    function skills() {
      return Object.keys(store.items).filter(skill => Object.keys(store.items[skill]).length > 0);
    }

    // A detached copy of the whole store, for the sync payload
    function exportBlob() {
      reload();
      tidy();
      return JSON.parse(JSON.stringify(store));
    }

    function byteSize() {
      return JSON.stringify(store).length;
    }

    const stored = read();
    if (stored) {
      store = parse(stored) || emptyStore();
      lastRaw = stored;
      trusted = true;
    }

    return {
      record: record, recordSession: recordSession,
      get: get, summary: summary, due: due, weakest: weakest, levels: levels,
      activity: activity, streak: streak, totals: totals, skills: skills,
      exportBlob: exportBlob, mergeBlob: mergeBlob,
      prune: prune, byteSize: byteSize, reset: reset, flush: flush,
      reload: reload, today: today
    };
  }

  return {
    create: create,
    KEY: KEY, INTERVALS: INTERVALS, WEIGHTS: WEIGHTS, LEVELS: LEVELS, OUTCOMES: OUTCOMES,
    dayNumber: dayNumber, dayToDate: dayToDate
  };
})();

// Lets node load this file for its tests; a browser never takes this branch
if (typeof module !== 'undefined' && module.exports) module.exports = Mastery;
/* ===== END OF MASTERY MODULE ===== */

  /* =========================================================
   * MASTERY — the game's store and how rounds feed it
   *
   * The module above is kept byte for byte as the file its tests run
   * against, which is why it keeps its own indentation.
   *
   * Skills (each level names its own in LEVELS; levels that teach the same
   * thing share one):
   *   country              The World, each continent, the Daily Five
   *   us-state             States
   *   us-capital           States → Capitals and Capitals → States (item = the state)
   *   us-city              the four Cities levels
   *   province:<country>   that country's rounds
   *   city-pin             Pin the City
   * An item's name is the name the game queues it under, which is unique
   * within its skill (see claimName).
   *
   * Every resolved question records one outcome (scoreAnswer, pinReveal),
   * in full rounds, the Daily Five and practice rounds alike. Learn-ladder
   * quizzes don't record items, since a ladder repeats the same names many
   * times a sitting. Every finished round, and every cleared Learn level,
   * is one session in the activity log; a round that is left part-way keeps
   * its answers but is not a session.
   * ========================================================= */

  const mastery = Mastery.create();

  // Pin the City scores by distance, so points stand in for tries
  function pinOutcome(points) {
    return points >= 80 ? 'first' : points >= 40 ? 'second' : 'miss';
  }

  // Another tab changed the store: take its work in, so this tab's reads
  // (and its next save) include it
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === Mastery.KEY) mastery.reload();
  });

  /* =========================================================
   * PERSONAL RECORDS (best score, time, accuracy per region × mode)
   *
   * Storage shape under key "atlas-records":
   * {
   *   "North America|normal": {
   *     bestScore: { value: 44, max: 46, date: "2026-04-24" },
   *     bestTime:  { value: 182, total: 23, date: "..." },  // seconds, only if all found
   *     bestAccuracy: { correct: 23, total: 23, pct: 100, date: "..." },
   *     gamesPlayed: 7,
   *     lastPlayed: "2026-04-24"
   *   },
   *   "North America|hard": { ... },
   *   "World|normal": { ... },
   *   ...
   * }
   * ========================================================= */

  const RECORDS_KEY = 'atlas-records';

  function loadAllRecords() {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveAllRecords(records) {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch (e) { /* storage blocked - ignore silently */ }
  }

  // `difficulty` is 'normal' | 'hard' | 'uncharted'; a boolean (the old
  // hardMode flag) still works and maps to hard/normal.
  function recordsKeyFor(region, difficulty, gameMode) {
    // Include mode so US quiz types don't collide with each other
    // or with world country games. Defaults to world-country if omitted.
    const mode = gameMode || 'world-country';
    const diff = difficulty === true ? 'hard'
      : (difficulty === 'hard' || difficulty === 'uncharted') ? difficulty
      : 'normal';
    return mode + '|' + region + '|' + diff;
  }

  function getRecords(region, difficulty, gameMode) {
    const all = loadAllRecords();
    return all[recordsKeyFor(region, difficulty, gameMode)] || null;
  }

  // Commit the session's results against the stored records for this
  // region × mode. Returns an object indicating which records were broken
  // so the results screen can celebrate them.
  function commitSessionRecords(session) {
    const all = loadAllRecords();
    const key = recordsKeyFor(session.region, session.difficulty, session.gameMode);
    const existing = all[key] || { gamesPlayed: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const maxScore = session.totalQuestions * 2;
    const pct = session.totalQuestions > 0
      ? Math.round((session.correct / session.totalQuestions) * 100)
      : 0;

    const broken = { score: false, time: false, accuracy: false, firstPlay: !existing.lastPlayed };

    // Best score
    if (!existing.bestScore || session.score > existing.bestScore.value) {
      broken.score = !broken.firstPlay;
      existing.bestScore = { value: session.score, max: maxScore, date: today };
    }

    // Best time — only tracked if the session was a clean sweep (no misses).
    // A faster time on an incomplete run isn't really "better".
    if (session.correct === session.totalQuestions && session.totalQuestions > 0) {
      if (!existing.bestTime || session.timeSeconds < existing.bestTime.value) {
        broken.time = !broken.firstPlay || existing.bestTime !== undefined;
        // Don't mark as broken on the very first perfect clear if there
        // simply was no prior time to beat — still celebrate it as a first.
        if (!existing.bestTime) broken.time = true;
        existing.bestTime = {
          value: session.timeSeconds,
          total: session.totalQuestions,
          date: today
        };
      }
    }

    // Best accuracy (by percentage, then by absolute count as tiebreaker)
    const priorPct = existing.bestAccuracy ? existing.bestAccuracy.pct : -1;
    const priorCorrect = existing.bestAccuracy ? existing.bestAccuracy.correct : -1;
    if (pct > priorPct || (pct === priorPct && session.correct > priorCorrect)) {
      broken.accuracy = !broken.firstPlay;
      existing.bestAccuracy = {
        correct: session.correct,
        total: session.totalQuestions,
        pct: pct,
        date: today
      };
    }

    existing.gamesPlayed = (existing.gamesPlayed || 0) + 1;
    existing.lastPlayed = today;

    all[key] = existing;
    saveAllRecords(all);
    return { broken: broken, records: existing };
  }

  function formatTimeSeconds(seconds) {
    if (seconds == null) return '—';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* =========================================================
   * FOCUS LISTS (what to practice next, per level)
   *
   * Storage shape under key "atlas-focus":
   * {
   *   "world-country|World": { names: ["Bhutan", ...], total: 197, savedAt: 1761140000000 },
   *   "province|russia-east": { names: [], total: 27, savedAt: ... },
   *   ...
   * }
   * names = missed + found-on-second-try from the last FULL game of that
   * level. Shared by normal and hard mode (it's about what you know, not
   * the difficulty). Focus rounds never rewrite it.
   * ========================================================= */

  const FOCUS_KEY = 'atlas-focus';

  function loadFocusLists() {
    try {
      const raw = localStorage.getItem(FOCUS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveFocusLists(all) {
    try {
      localStorage.setItem(FOCUS_KEY, JSON.stringify(all));
    } catch (e) { /* storage blocked - ignore silently */ }
  }

  function focusKeyFor(gameMode, region) {
    return gameMode + '|' + region;
  }

  function getFocusList(gameMode, region) {
    const entry = loadFocusLists()[focusKeyFor(gameMode, region)];
    return entry && Array.isArray(entry.names) ? entry : null;
  }

  function saveFocusList(gameMode, region, names, total) {
    const all = loadFocusLists();
    all[focusKeyFor(gameMode, region)] = { names: names.slice(), total: total, savedAt: Date.now() };
    saveFocusLists(all);
  }

  /* =========================================================
   * PIN THE CITY — play
   * ========================================================= */

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "8 km", "412 km", "1,240 km"
  function formatKm(km) {
    return Math.round(km).toLocaleString('en-US') + ' km';
  }

  // What to fit the map to: every city of the region plus a margin, so
  // the frame doesn't hint at where any one city is
  function pinFitGeometry(region) {
    const cities = pinCitiesFor(region);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    cities.forEach(c => {
      x0 = Math.min(x0, c.lon); x1 = Math.max(x1, c.lon);
      y0 = Math.min(y0, c.lat); y1 = Math.max(y1, c.lat);
    });
    const padX = Math.max(4, (x1 - x0) * 0.12);
    const padY = Math.max(3, (y1 - y0) * 0.12);
    return {
      type: 'MultiPoint',
      coordinates: cities.map(c => [c.lon, c.lat]).concat([
        [x0 - padX, y0 - padY], [x1 + padX, y0 - padY], [x0 - padX, y1 + padY], [x1 + padX, y1 + padY]
      ])
    };
  }

  // Tap on the map: move the aiming pin there (not scored until Drop Pin)
  function handlePinClick(event) {
    if (!state.pin || state.pin.phase !== 'aim' || !state.current) return;
    const pt = d3.pointer(event, state.mapG.node());
    const ll = state.projection.invert(pt);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
    // Taps off the edge of the globe invert to nonsense: require a round trip
    const back = state.projection(ll);
    if (!back || Math.abs(back[0] - pt[0]) > 1 || Math.abs(back[1] - pt[1]) > 1) return;
    state.pin.guess = ll;
    drawPinLayer();
    setPinButton('Drop Pin', false);
  }

  // The one button under the map: Drop Pin while aiming, Next after a reveal
  function handlePinButton() {
    if (!state.pin) return;
    if (state.pin.phase === 'aim') {
      if (state.pin.guess) pinReveal(state.pin.guess);
    } else if (state.pin.phase === 'reveal') {
      nextCountry();
    }
  }

  function setPinButton(label, disabled) {
    const btn = document.getElementById('pin-btn');
    btn.textContent = label;
    btn.disabled = disabled;
  }

  // Score the guess (null = skipped), then show the city and the miss
  function pinReveal(guess) {
    const city = PIN_CITY_BY_NAME.get(state.current);
    const truth = [city.lon, city.lat];
    const km = guess ? d3.geoDistance(guess, truth) * 6371 : null;
    const pts = guess ? pinPoints(km) : 0;
    state.score += pts;
    state.pin.results.push({ name: city.name, km: km, pts: pts });
    mastery.record(roundSkill(), city.name, pinOutcome(pts));
    state.pin.phase = 'reveal';
    drawPinLayer();

    let msg;
    if (!guess) msg = '<em>' + escapeHtml(city.name) + '</em> — here it is';
    else if (pts === 100) msg = 'Bullseye — <em>' + escapeHtml(city.name) + '</em> · +100';
    else msg = '<em>' + escapeHtml(city.name) + '</em> · ' + formatKm(km) + ' off · +' + pts;
    showToast(pts >= 50 ? 'correct' : 'wrong', msg);
    if (pts > 0) flashScore();

    const t = state.currentTransform || d3.zoomIdentity;
    if (t.k > 1.05) ensureFeatureVisible({ type: 'Feature', geometry: { type: 'Point', coordinates: truth } });

    document.getElementById('skip-btn').disabled = true;
    setPinButton(state.queue.length ? 'Next' : 'Finish', false);
    updateStats();
  }

  // Draw the aiming pin, and after a reveal the real spot, the great-circle
  // line between them and the city's name. Rebuilt from state each time
  // (also after a resize rebuilds the map).
  function drawPinLayer() {
    if (!state.mapG || !state.pin) return;
    state.mapG.selectAll('.pin-layer').remove();
    const layer = state.mapG.append('g').attr('class', 'pin-layer');
    const k = (state.currentTransform && state.currentTransform.k) || 1;
    const scaleAt = (p) => 'translate(' + p[0] + ',' + p[1] + ') scale(' + (1 / k) + ')';
    const guess = state.pin.guess;
    const city = state.current ? PIN_CITY_BY_NAME.get(state.current) : null;

    if (state.pin.phase === 'reveal' && city) {
      const truth = [city.lon, city.lat];
      if (guess) {
        layer.append('path')
          .attr('class', 'pin-line')
          .attr('d', state.pathGen({ type: 'LineString', coordinates: [guess, truth] }));
      }
      const tp = state.projection(truth);
      const target = layer.append('g').attr('class', 'pin-scaled pin-truth')
        .attr('data-x', tp[0]).attr('data-y', tp[1]).attr('transform', scaleAt(tp));
      target.append('circle').attr('class', 'pin-truth-ring').attr('r', 9);
      target.append('circle').attr('class', 'pin-truth-dot').attr('r', 4);
      target.append('text').attr('class', 'pin-truth-label').attr('y', -14).text(city.name);
    }
    if (guess) {
      const gp = state.projection(guess);
      const pin = layer.append('g').attr('class', 'pin-scaled pin-guess')
        .attr('data-x', gp[0]).attr('data-y', gp[1]).attr('transform', scaleAt(gp));
      pin.append('path').attr('d', 'M0,0 C-2,-6 -8,-10 -8,-16 A8,8 0 1 1 8,-16 C8,-10 2,-6 0,0 Z');
      pin.append('circle').attr('cx', 0).attr('cy', -16).attr('r', 3);
    }
  }

  // Keep pins and markers a constant screen size while zooming
  function scalePinMarkers(k) {
    if (!state.mapG) return;
    state.mapG.selectAll('.pin-scaled').attr('transform', function () {
      return 'translate(' + this.getAttribute('data-x') + ',' + this.getAttribute('data-y') + ') scale(' + (1 / k) + ')';
    });
  }

  // Round over: save it, then the results screen
  function finishPinGame() {
    const region = state.currentContinent;
    const results = state.pin.results;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const max = results.length * 100;
    const kms = results.filter(r => r.km != null).map(r => r.km);
    const avgKm = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null;

    mastery.recordSession({
      questions: results.length,
      firstTry: results.filter(r => pinOutcome(r.pts) === 'first').length,
      seconds: elapsed
    });

    const prior = pinRegionStats(region, state.difficulty);
    recordPinGame({
      at: Date.now(), region: region, diff: state.difficulty,
      score: state.score, max: max, avgKm: avgKm == null ? null : Math.round(avgKm)
    }, results);
    syncAfterGameEnd();
    const now = pinRegionStats(region, state.difficulty);
    const newBest = prior.games > 0 && state.score > prior.best;

    state.lastWasLearn = false;
    state.roundNeedsWork = [];
    setLearnResultsLabels(false);

    document.getElementById('results-region').textContent =
      GAME_MODES['city-pin'].label(region) + difficultyBadge(state.difficulty, false);
    document.getElementById('grade-big').textContent = state.score.toLocaleString('en-US');
    document.getElementById('grade-unit').textContent = 'of ' + max.toLocaleString('en-US') + ' points';
    document.getElementById('r-score-label').textContent = 'Avg Miss';
    document.getElementById('r-score').textContent = avgKm == null ? '—' : formatKm(avgKm);
    document.getElementById('r-correct-label').textContent = 'Within 100 km';
    document.getElementById('r-correct').textContent = results.filter(r => r.km != null && r.km <= 100).length;
    document.getElementById('r-wrong-label').textContent = 'Skipped';
    document.getElementById('r-wrong').textContent = results.filter(r => r.km == null).length;
    document.getElementById('r-time').textContent = formatTimeSeconds(elapsed);

    // "New Best" banner reuses the records banner
    state.brokenRecords = {};
    const banner = document.getElementById('new-record-banner');
    if (newBest) {
      banner.innerHTML =
        '<div class="record-laurel">❧</div>' +
        '<div class="record-text">New Best Score!</div>' +
        '<div class="record-laurel flipped">❧</div>';
      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }

    // Progress over time for this region (and difficulty)
    const bests = document.getElementById('bests-section');
    document.getElementById('bests-heading').textContent = '— Your Progress —';
    const recentN = Math.min(10, now.games);
    const items = [{ label: 'Best Game', value: now.best.toLocaleString('en-US'), broken: newBest }];
    if (recentN >= 2) {
      items.push({ label: 'Avg, Last ' + recentN, value: Math.round(now.recentAvg).toLocaleString('en-US') + pinTrendArrow(now) });
      items.push({ label: 'Avg Miss, Last ' + recentN, value: now.recentKm == null ? '—' : formatKm(now.recentKm) });
    }
    items.push({ label: 'Games Played', value: String(now.games) });
    bests.querySelector('.bests-grid').innerHTML = items.map(it =>
      '<div class="best-item' + (it.broken ? ' broken' : '') + '">' +
        '<div class="best-value">' + it.value + (it.broken ? ' <span class="best-star">★</span>' : '') + '</div>' +
        '<div class="best-label">' + it.label + '</div>' +
      '</div>'
    ).join('');
    bests.style.display = 'block';

    // Farthest misses this round, then the cities that have been hardest lately
    const worst = results.slice().sort((a, b) => (b.km == null ? Infinity : b.km) - (a.km == null ? Infinity : a.km))
      .filter(r => r.pts < 80).slice(0, 6);
    const missedSection = document.getElementById('missed-section');
    if (worst.length) {
      document.getElementById('missed-heading').textContent = '— Farthest off —';
      document.getElementById('missed-list').innerHTML = worst.map(r =>
        '<span class="missed-item">' + escapeHtml(r.name) + ' · ' + (r.km == null ? 'skipped' : formatKm(r.km)) + '</span>'
      ).join('<span style="opacity:0.3">·</span>');
      const weak = pinWeakestCities(region, 5);
      document.getElementById('missed-legend').innerHTML = weak.length
        ? '<span class="pin-weak">Hardest over your last few tries: ' +
          weak.map(w => escapeHtml(w.name) + ' (' + (w.allSkipped ? 'skipped' : 'avg ' + formatKm(w.avgKm)) + ')').join(', ') + '</span>'
        : '';
      missedSection.style.display = 'block';
    } else {
      missedSection.style.display = 'none';
    }

    const replayBtn = document.getElementById('replay-btn');
    replayBtn.style.display = '';
    replayBtn.textContent = 'Play Again';
    replayBtn.classList.add('primary');
    document.getElementById('practice-btn').style.display = 'none';
    document.getElementById('daily-practice-btn').style.display = 'none';
    document.getElementById('share-btn').style.display = '';
    document.getElementById('view-map-btn').style.display = 'none';
    document.getElementById('pin-btn').style.display = 'none';

    showReviewNext();
    switchScreen('results');
  }

  // ↑ / ↓ when the last 5 games beat / trail the 5 before them by 5%+
  function pinTrendArrow(stats) {
    const g = stats.recentScores;
    if (g.length < 6) return '';
    const a = g.slice(-5), b = g.slice(-10, -5);
    const avg = arr => arr.reduce((x, y) => x + y, 0) / arr.length;
    const ratio = avg(a) / Math.max(1, avg(b));
    if (ratio >= 1.05) return ' <span class="pin-trend up">↑</span>';
    if (ratio <= 0.95) return ' <span class="pin-trend down">↓</span>';
    return '';
  }

  // Wordle-style share: one square per city by points
  function buildPinShareText() {
    const rs = state.pin ? state.pin.results : [];
    const sq = r => r.pts >= 80 ? '🟩' : r.pts >= 50 ? '🟨' : r.pts >= 20 ? '🟧' : '🟥';
    const rows = [];
    for (let i = 0; i < rs.length; i += 10) rows.push(rs.slice(i, i + 10).map(sq).join(''));
    const kms = rs.filter(r => r.km != null).map(r => r.km);
    const avgKm = kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null;
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return [
      '🧭 Cartographer’s Atlas · ' + dateStr,
      'Pin the City · ' + state.currentContinent + difficultyBadge(state.difficulty, false) +
        ' · ' + state.score.toLocaleString('en-US') + '/' + (rs.length * 100).toLocaleString('en-US') + ' pts' +
        (avgKm == null ? '' : ' · avg ' + formatKm(avgKm) + ' off'),
      '',
      ...rows,
      '',
      levelLink(state.startArg)
    ].join('\n');
  }

  /* =========================================================
   * PIN STORE (Pin the City history)
   *
   * Storage shape under key "atlas-pin" (synced; merges are unions):
   * {
   *   games: [{ at, region, diff, score, max, avgKm }, ...],   // newest last, capped
   *   cities: { "Lagos": [[at, km], ...] }                      // last 5 tries; km null = skipped
   * }
   * ========================================================= */

  const PIN_KEY = 'atlas-pin';
  const PIN_MAX_GAMES = 200;
  const PIN_CITY_TRIES = 5;
  const PIN_SKIP_KM = 2000;   // a skip counts as this far off in "hardest lately"

  function loadPinStore() {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      const st = raw ? JSON.parse(raw) : null;
      if (st && Array.isArray(st.games) && st.cities && typeof st.cities === 'object') return st;
    } catch (e) { /* fall through */ }
    return { games: [], cities: {} };
  }

  function savePinStore(st) {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(st));
    } catch (e) { /* storage blocked - ignore silently */ }
  }

  function recordPinGame(game, results) {
    const st = loadPinStore();
    st.games.push(game);
    if (st.games.length > PIN_MAX_GAMES) st.games = st.games.slice(-PIN_MAX_GAMES);
    results.forEach(r => {
      const tries = (st.cities[r.name] || []).concat([[game.at, r.km == null ? null : Math.round(r.km)]]);
      st.cities[r.name] = tries.slice(-PIN_CITY_TRIES);
    });
    savePinStore(st);
  }

  function mergePinStores(a, b) {
    const seen = new Set();
    const games = a.games.concat(Array.isArray(b.games) ? b.games : [])
      .filter(g => {
        if (!g || typeof g.at !== 'number') return false;
        const key = g.at + '|' + g.region;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((x, y) => x.at - y.at)
      .slice(-PIN_MAX_GAMES);
    const cities = Object.assign({}, a.cities);
    const bc = (b.cities && typeof b.cities === 'object') ? b.cities : {};
    Object.keys(bc).forEach(name => {
      if (!Array.isArray(bc[name])) return;
      const byAt = new Map();
      (cities[name] || []).concat(bc[name]).forEach(t => { if (Array.isArray(t)) byAt.set(t[0], t); });
      cities[name] = Array.from(byAt.values()).sort((x, y) => x[0] - y[0]).slice(-PIN_CITY_TRIES);
    });
    return { games: games, cities: cities };
  }

  // { games, best, recentScores (last 10), recentAvg, recentKm } for a
  // region at one difficulty ('normal' | 'hard' | 'uncharted')
  function pinRegionStats(region, difficulty) {
    const games = loadPinStore().games.filter(g => g.region === region && (g.diff || 'normal') === difficulty);
    const recent = games.slice(-10);
    const kms = recent.filter(g => g.avgKm != null).map(g => g.avgKm);
    return {
      games: games.length,
      best: games.reduce((m, g) => Math.max(m, g.score), 0),
      recentScores: recent.map(g => g.score),
      recentAvg: recent.length ? recent.reduce((a, g) => a + g.score, 0) / recent.length : 0,
      recentKm: kms.length ? kms.reduce((a, b) => a + b, 0) / kms.length : null
    };
  }

  // The region's cities with the worst average miss over their last tries
  function pinWeakestCities(region, n) {
    const store = loadPinStore().cities;
    return pinCitiesFor(region)
      .map(c => {
        const tries = store[c.name] || [];
        if (tries.length < 2) return null;   // one try is just this round's miss
        const avgKm = tries.reduce((a, t) => a + (t[1] == null ? PIN_SKIP_KM : t[1]), 0) / tries.length;
        return { name: c.name, avgKm: avgKm, allSkipped: tries.every(t => t[1] == null) };
      })
      .filter(x => x && x.avgKm > PIN_PERFECT_KM * 4)
      .sort((x, y) => y.avgKm - x.avgKm)
      .slice(0, n);
  }

  /* =========================================================
   * LEARN MODE (province ladder)
   *
   * Level n: study the first n provinces of a shuffled order (named on the
   * map, newest highlighted), then find all n in random order. One miss
   * restarts the level with the same n; a clean pass adds the next one.
   * Practice only: no records, no focus list, no per-item mastery. Each
   * cleared level does count as a session in the activity log.
   *
   * Progress persists per round under "atlas-learn" (synced; per round,
   * whichever device saved last wins):
   *   { "china-provinces": { order: [...all names], level: 7, savedAt } }
   * level = the level to resume at. A finished ladder leaves
   * { done: true, savedAt } in its place, so that an older copy of the
   * ladder on another device doesn't bring it back.
   * ========================================================= */

  const LEARN_KEY = 'atlas-learn';

  function loadLearnAll() {
    try {
      const raw = localStorage.getItem(LEARN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveLearnAll(all) {
    try {
      localStorage.setItem(LEARN_KEY, JSON.stringify(all));
    } catch (e) { /* storage blocked - ignore silently */ }
  }

  function getLearnProgress(roundKey) {
    const p = loadLearnAll()[roundKey];
    if (!p || !Array.isArray(p.order) || !p.order.length || !(p.level >= 1)) return null;
    return p;
  }

  function saveLearnProgress(run) {
    const all = loadLearnAll();
    all[run.roundKey] = { order: run.order.slice(), level: run.level, savedAt: Date.now() };
    saveLearnAll(all);
  }

  function markLearnFinished(roundKey) {
    const all = loadLearnAll();
    all[roundKey] = { done: true, savedAt: Date.now() };
    saveLearnAll(all);
  }

  // Resume the saved ladder if it still matches the map; else a new shuffle.
  function createLearnRun(roundKey, names, fresh) {
    const saved = fresh ? null : getLearnProgress(roundKey);
    const nameSet = new Set(names);
    let order = null;
    let level = 1;
    if (saved && saved.order.length === names.length && saved.order.every(n => nameSet.has(n))) {
      order = saved.order.slice();
      level = Math.min(saved.level, order.length);
    }
    if (!order) order = shuffle(names);
    const run = {
      roundKey: roundKey, order: order, level: level, phase: 'study', restarts: 0,
      // Quiz answers and time since the last cleared level, for its session
      asked: 0, found: 0, levelStart: Date.now()
    };
    saveLearnProgress(run);
    return run;
  }

  // Swap the in-game chrome between learn and normal play
  // (Pin the City's chrome is set here too, from state.gameMode.)
  function setLearnChrome(on) {
    const pin = state.gameMode === 'city-pin' && !!state.pin;
    document.getElementById('stat-score-label').textContent = on ? 'Level' : 'Score';
    document.getElementById('stat-correct-label').textContent = pin ? 'Avg km' : 'Found';
    document.getElementById('stat-wrong-label').textContent = on ? 'Restarts' : (pin ? 'Last km' : 'Missed');
    document.getElementById('learn-ready-btn').style.display = 'none';
    document.getElementById('pin-btn').style.display = pin ? '' : 'none';
    document.getElementById('skip-btn').style.display = '';
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.toggle('pin-mode', pin);
    // Hard: no borders on parchment (Uncharted's satellite no-borders is generic)
    gameScreen.classList.toggle('pin-hard', pin && state.difficulty === 'hard');
  }

  function setLearnResultsLabels(on) {
    document.getElementById('r-score-label').textContent = on ? 'Levels' : 'Score';
    document.getElementById('r-correct-label').textContent = 'Found';
    document.getElementById('r-wrong-label').textContent = on ? 'Restarts' : 'Missed';
    document.getElementById('grade-unit').textContent = on ? 'learned' : '% accuracy';
    document.getElementById('bests-heading').textContent = '— Your Personal Bests —';
  }

  // Study phase: show the provinces of this level with their names
  function startLearnLevel() {
    const run = state.learn;
    if (!run) return;
    run.phase = 'study';
    state.current = null;
    state.queue = [];
    state.correct = 0;
    state.wrong = 0;
    state.totalQuestions = run.level;
    state.interactionLocked = true;

    // Wipe last pass's green/red so the map is clean for studying
    d3.selectAll('.country').classed('completed-correct', false)
      .classed('completed-wrong', false).classed('target-correct', false)
      .classed('target-wrong', false).classed('reveal', false);

    const newest = run.order[run.level - 1];
    const promptLabelEl = document.querySelector('.prompt-panel .prompt-label');
    const promptEl = document.getElementById('prompt-country');
    promptLabelEl.textContent = learnStudyPromptLabel(run);
    drawLearnStudy();
    promptEl.textContent = newest;
    state.currentPromptText = newest;
    promptEl.classList.remove('shake', 'pulse');
    void promptEl.offsetWidth;
    promptEl.classList.add('pulse');

    document.getElementById('skip-btn').style.display = 'none';
    document.getElementById('learn-ready-btn').style.display = '';

    // Zoomed in: bring the new one into view. Zoomed out, the whole round
    // is already on screen, so leave the framing alone.
    const feature = activeFeatureByCanonical().get(newest);
    const k = (state.currentTransform && state.currentTransform.k) || 1;
    if (feature && k > 1.05) ensureFeatureVisible(feature);
    updateStats();
  }

  // Tint and label this level's provinces (newest brightest)
  function drawLearnStudy() {
    const run = state.learn;
    if (!run || !state.mapG || !state.pathGen) return;
    clearLearnStudy();
    const byName = activeFeatureByCanonical();
    run.order.slice(0, run.level).forEach((name, i) => {
      const feature = byName.get(name);
      if (!feature) return;
      d3.select('.country[data-fkey="' + CSS.escape(featureKey(feature)) + '"]')
        .classed(i === run.level - 1 ? 'learn-new' : 'learn-known', true);
    });
    placeLearnLabels();
  }

  // Lay out this level's name labels for the current zoom. Each label
  // anchors on the province's largest piece, at its most-inside point (a
  // centroid can fall outside a thin or scattered shape — Puducherry's
  // enclaves average out to the middle of Tamil Nadu). A name that fits
  // sits on its province; one that doesn't gets a dot on the province and
  // sits beside it. Labels are placed newest first, each taking the first
  // spot that doesn't collide with one already placed.
  function placeLearnLabels() {
    const run = state.learn;
    if (!run || run.phase !== 'study' || !state.mapG || !state.pathGen) return;
    state.mapG.selectAll('.learn-labels').remove();
    const labelG = state.mapG.append('g').attr('class', 'learn-labels');
    const t = state.currentTransform || d3.zoomIdentity;
    const k = t.k;
    const svgNode = state.svg.node();
    const viewW = svgNode.clientWidth || svgNode.getBoundingClientRect().width;
    const viewH = svgNode.clientHeight || svgNode.getBoundingClientRect().height;
    const byName = activeFeatureByCanonical();

    // Build every label first (measured, not yet positioned), newest first
    const items = [];
    run.order.slice(0, run.level).reverse().forEach((name, i) => {
      const feature = byName.get(name);
      const anchor = feature && learnLabelAnchor(feature);
      if (!anchor) return;
      const label = labelG.append('g')
        .attr('class', 'learn-label' + (i === 0 ? ' new' : ''))
        .attr('data-cx', anchor.x).attr('data-cy', anchor.y)
        .attr('transform', 'translate(' + anchor.x + ',' + anchor.y + ') scale(' + (1 / k) + ')');
      const text = label.append('text').text(name);
      const bb = text.node().getBBox();
      const w = bb.width + 8;    // room for the parchment halo
      const h = bb.height + 2;
      // Screen position of the anchor (the zoom transform applied)
      const sx = anchor.x * k + t.x;
      const sy = anchor.y * k + t.y;
      // Big enough to hold its name: the clear area around the anchor
      // covers the text height and most of its width (wide, short text
      // can run a little past a curve in the border)
      const room = anchor.radius * k * 2;
      const fits = room >= h * 1.2 && room >= w * 0.6;
      items.push({ label, text, w, h, sx, sy, fits, isNew: i === 0 });
    });

    // Placement order: the newest name, then names that sit inside their
    // province (they have the fewest options), then the dotted ones
    items.sort((a, b) => (b.isNew - a.isNew) || (b.fits - a.fits));

    // Dots go down before any text, so no name ever covers another's dot
    const placed = [];
    items.forEach(it => {
      if (!it.fits) placed.push({ x0: it.sx - 5, y0: it.sy - 5, x1: it.sx + 5, y1: it.sy + 5 });
    });
    const overlapArea = (b) => placed.reduce((sum, p) => {
      const ox = Math.min(b.x1, p.x1) - Math.max(b.x0, p.x0);
      const oy = Math.min(b.y1, p.y1) - Math.max(b.y0, p.y0);
      return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
    }, 0);
    // Off-screen parts count as collisions, so names stay readable
    const offscreen = (b) => (Math.max(0, -b.x0) + Math.max(0, b.x1 - viewW)) * (b.y1 - b.y0) +
      (Math.max(0, -b.y0) + Math.max(0, b.y1 - viewH)) * (b.x1 - b.x0);

    let hidden = 0;
    items.forEach(it => {
      const box = (dx, dy) => ({
        x0: it.sx + dx - it.w / 2, y0: it.sy + dy - it.h / 2,
        x1: it.sx + dx + it.w / 2, y1: it.sy + dy + it.h / 2
      });
      const gapX = it.w / 2 + 6;
      const gapY = it.h / 2 + 4;
      // [dx, dy, needsDot]: inside first when it fits, then beside a dot
      const candidates = (it.fits ? [[0, 0, false]] : []).concat([
        [gapX, 0, true], [-gapX, 0, true], [0, -gapY, true], [0, gapY, true],
        [gapX, -gapY, true], [-gapX, -gapY, true], [gapX, gapY, true], [-gapX, gapY, true]
      ]);
      // First clear spot wins. With no clear spot, an older name is left
      // off until zooming in makes room; the newest takes the least-covered.
      let choice = null;
      let leastCost = Infinity;
      for (const c of candidates) {
        const b = box(c[0], c[1]);
        // A dot this label didn't reserve must also land somewhere clear
        const dotBox = { x0: it.sx - 5, y0: it.sy - 5, x1: it.sx + 5, y1: it.sy + 5 };
        const cost = overlapArea(b) + offscreen(b) + (c[2] && it.fits ? overlapArea(dotBox) : 0);
        if (cost === 0) { choice = c; leastCost = 0; break; }
        if (cost < leastCost) { leastCost = cost; choice = c; }
      }
      // A sliver of overlap still reads fine; a fifth of the name doesn't
      if (leastCost > it.w * it.h * 0.2 && !it.isNew) {
        it.label.remove();
        const onScreen = it.sx >= 0 && it.sx <= viewW && it.sy >= 0 && it.sy <= viewH;
        if (onScreen) hidden++;
        return;
      }
      it.text.attr('x', choice[0]).attr('y', choice[1]);
      if (choice[2]) {
        it.label.insert('circle', 'text').attr('class', 'learn-dot').attr('r', it.isNew ? 4 : 3);
        if (it.fits) placed.push({ x0: it.sx - 5, y0: it.sy - 5, x1: it.sx + 5, y1: it.sy + 5 });
      }
      placed.push(box(choice[0], choice[1]));
    });
    // Newest label on top so it's never hidden under an older one
    labelG.select('.learn-label.new').raise();
    setLearnHint(hidden > 0);
  }

  // "Zoom in" pill on the map while some study names are left off
  function setLearnHint(on) {
    const hint = document.getElementById('learn-hint');
    if (hint) hint.style.display = on ? '' : 'none';
    if (on) document.getElementById('zoom-hint').style.display = 'none';
  }

  function learnStudyPromptLabel(run) {
    return 'Level ' + run.level + ' of ' + run.order.length +
      (run.level === 1 ? ' · study it' : ' · study all ' + run.level);
  }

  // Label anchor for a province, in projected (zoom 1) map units:
  // { x, y, radius }, where radius is how far the point sits from the
  // nearest edge. Cached per projection, since resizes rebuild it.
  function learnLabelAnchor(feature) {
    if (state.learnAnchorProjection !== state.projection) {
      state.learnAnchorCache = new Map();
      state.learnAnchorProjection = state.projection;
    }
    const key = featureKey(feature);
    if (state.learnAnchorCache.has(key)) return state.learnAnchorCache.get(key);

    // Outer ring of the largest piece, projected to screen units
    const g = feature.geometry;
    const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    let best = null;
    let bestArea = 0;
    polys.forEach(poly => {
      const ring = poly[0].map(pt => state.projection(pt)).filter(pt => pt && isFinite(pt[0]) && isFinite(pt[1]));
      if (ring.length < 3) return;
      const area = Math.abs(d3.polygonArea(ring));
      if (area > bestArea) { bestArea = area; best = ring; }
    });

    let anchor = null;
    if (best) anchor = poleOfInaccessibility(best);
    if (!anchor) {
      const c = state.pathGen.centroid(feature);
      anchor = isNaN(c[0]) ? null : { x: c[0], y: c[1], radius: 0 };
    }
    state.learnAnchorCache.set(key, anchor);
    return anchor;
  }

  // Point inside a ring farthest from its edges (coarse grid search, then
  // two refinements around the best point). Plenty for label placement.
  function poleOfInaccessibility(ring) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ring.forEach(p => {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    });
    const edgeDist = (x, y) => {
      let min = Infinity;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0], ay = ring[j][1];
        const dx = ring[i][0] - ax, dy = ring[i][1] - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 ? ((x - ax) * dx + (y - ay) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + t * dx - x, ey = ay + t * dy - y;
        const d = ex * ex + ey * ey;
        if (d < min) min = d;
      }
      return Math.sqrt(min);
    };
    let bestPt = null;
    let bestD = -1;
    const search = (cx0, cy0, cx1, cy1, n) => {
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
          const x = cx0 + (cx1 - cx0) * i / n;
          const y = cy0 + (cy1 - cy0) * j / n;
          if (!d3.polygonContains(ring, [x, y])) continue;
          const d = edgeDist(x, y);
          if (d > bestD) { bestD = d; bestPt = [x, y]; }
        }
      }
    };
    search(x0, y0, x1, y1, 24);
    if (!bestPt) return null;
    let step = Math.max(x1 - x0, y1 - y0) / 24;
    for (let r = 0; r < 2; r++) {
      const [bx, by] = bestPt;
      search(bx - step, by - step, bx + step, by + step, 8);
      step /= 4;
    }
    return { x: bestPt[0], y: bestPt[1], radius: bestD };
  }

  function clearLearnStudy() {
    setLearnHint(false);
    d3.selectAll('.country.learn-new, .country.learn-known')
      .classed('learn-new', false).classed('learn-known', false);
    if (state.mapG) state.mapG.selectAll('.learn-labels').remove();
  }

  // Keep labels a constant screen size while zooming, then re-lay them out
  // once the zoom settles (more room between provinces when zoomed in)
  function scaleLearnLabels(k) {
    if (!state.mapG) return;
    state.mapG.selectAll('.learn-label').attr('transform', function () {
      return 'translate(' + this.getAttribute('data-cx') + ',' + this.getAttribute('data-cy') +
        ') scale(' + (1 / k) + ')';
    });
    clearTimeout(scaleLearnLabels._t);
    scaleLearnLabels._t = setTimeout(placeLearnLabels, 150);
  }

  // Study → quiz: hide the names, ask for each of this level's provinces
  function beginLearnQuiz() {
    const run = state.learn;
    if (!run || run.phase !== 'study') return;
    run.phase = 'quiz';
    clearLearnStudy();
    document.getElementById('learn-ready-btn').style.display = 'none';
    document.getElementById('skip-btn').style.display = '';
    state.queue = shuffle(run.order.slice(0, run.level));
    state.totalQuestions = run.level;
    state.correct = 0;
    state.wrong = 0;
    nextCountry();
  }

  function learnLevelPassed() {
    const run = state.learn;
    // A cleared level is one session: every quiz answer it took, failed
    // passes included
    mastery.recordSession({
      questions: run.asked,
      firstTry: run.found,
      seconds: Math.round((Date.now() - run.levelStart) / 1000)
    });
    run.asked = 0;
    run.found = 0;
    run.levelStart = Date.now();

    if (run.level >= run.order.length) {
      finishLearn();
      return;
    }
    run.level++;
    saveLearnProgress(run);
    showToast('correct', 'Level cleared — adding <em>' + run.order[run.level - 1] + '</em>');
    startLearnLevel();
  }

  function learnLevelFailed() {
    state.learn.restarts++;
    showToast('wrong', 'Back to the start of level ' + state.learn.level);
    startLearnLevel();
  }

  // Ladder complete: every province of the round found in one clean pass
  function finishLearn() {
    const run = state.learn;
    markLearnFinished(run.roundKey);
    syncAfterGameEnd();
    state.lastWasLearn = true;
    state.roundNeedsWork = [];
    state.brokenRecords = {};
    state.currentRecords = null;

    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const total = run.order.length;
    setLearnResultsLabels(true);
    document.getElementById('results-region').textContent =
      GAME_MODES.province.label(run.roundKey) + ' · Learn';
    document.getElementById('grade-big').textContent = total;
    document.getElementById('r-score').textContent = total + '/' + total;
    document.getElementById('r-correct').textContent = total;
    document.getElementById('r-wrong').textContent = run.restarts;
    document.getElementById('r-time').textContent = formatTimeSeconds(elapsed);

    renderRecordsBanner();
    renderBestsSection();
    document.getElementById('missed-section').style.display = 'none';
    document.getElementById('practice-btn').style.display = 'none';
    document.getElementById('daily-practice-btn').style.display = 'none';
    document.getElementById('share-btn').style.display = 'none';
    document.getElementById('view-map-btn').style.display = 'none';
    const replayBtn = document.getElementById('replay-btn');
    replayBtn.style.display = '';
    replayBtn.textContent = 'Learn Again';
    replayBtn.classList.add('primary');

    state.learn = null;
    setLearnChrome(false);
    showReviewNext();
    switchScreen('results');
  }

  /* =========================================================
   * DIFFICULTY & MAP STYLE PREFERENCES (persisted across sessions)
   *
   * "atlas-difficulty" is 'normal' | 'hard' | 'uncharted'. Older installs
   * only have "atlas-hard-mode" ('true' | 'false'), so fall back to it.
   * "atlas-map-style" is 'parchment' | 'satellite'.
   * Both are per-device preferences: they are not synced.
   * ========================================================= */

  function loadHardMode() {
    try {
      return localStorage.getItem('atlas-hard-mode') === 'true';
    } catch (e) {
      return false;
    }
  }

  function loadDifficulty() {
    try {
      const d = localStorage.getItem('atlas-difficulty');
      if (DIFFICULTY_INFO[d]) return d;
    } catch (e) { /* storage blocked - fall through */ }
    return loadHardMode() ? 'hard' : 'normal';
  }

  function saveDifficulty(d) {
    try {
      localStorage.setItem('atlas-difficulty', d);
    } catch (e) { /* private mode or disabled storage - ignore */ }
  }

  function setDifficulty(d) {
    state.difficulty = DIFFICULTY_INFO[d] ? d : 'normal';
    state.hardMode = state.difficulty !== 'normal';
  }

  function loadMapStyle() {
    try {
      return localStorage.getItem('atlas-map-style') === 'satellite' ? 'satellite' : 'parchment';
    } catch (e) {
      return 'parchment';
    }
  }

  function saveMapStyle(style) {
    try {
      localStorage.setItem('atlas-map-style', style);
    } catch (e) { /* ignore */ }
  }

  // Load once at startup, before anything is drawn from them
  setDifficulty(loadDifficulty());
  state.mapStyle = loadMapStyle();

  /* =========================================================
   * SHARE RESULTS
   * ========================================================= */

  function buildShareText() {
    if (state.gameMode === 'city-pin') return buildPinShareText();
    // Daily mode gets its own concise Wordle-style format. The country
    // names are deliberately NOT included so people can share before
    // their friends play without spoiling the puzzle.
    if (state.gameMode === 'daily-five' && !state.dailyReplay) {
      return buildDailyShareText({
        puzzleNumber: dailyPuzzleNumber(state.dailyDateKey),
        sequence: state.sequence,
        score: state.score,
        correct: state.correct,
        total: state.totalQuestions,
        hardMode: state.hardMode,
        difficulty: state.difficulty
      });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const mode = state.gameMode;
    let region;
    if (mode === 'us-state') region = 'US States';
    else if (mode === 'us-capital-to-state') region = 'US Capitals → States';
    else if (mode === 'us-state-to-capital') region = 'US States → Capitals';
    else if (mode === 'province') region = GAME_MODES.province.label(state.currentContinent);
    else region = state.currentContinent === 'World' ? 'The World' : state.currentContinent;
    const total = state.correct + state.wrong;
    const maxScore = state.totalQuestions * 2;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;

    // Three-color emoji grid telling the full story:
    //   🟩 = found on first try (2 pts)
    //   🟨 = found on second try (1 pt)
    //   🟥 = missed (0 pts)
    const EMOJI = { 2: '🟩', 1: '🟨', 0: '🟥' };
    const perRow = 10;
    const gridRows = [];
    for (let i = 0; i < state.sequence.length; i += perRow) {
      const row = state.sequence.slice(i, i + perRow)
        .map(r => EMOJI[r] || '⬜')
        .join('');
      gridRows.push(row);
    }

    // Perfect score (all 2s) gets a flourish
    const isPerfect = state.score === maxScore && state.totalQuestions > 0;
    const modeBadge = difficultyBadge(state.difficulty, state.hardMode);
    const headline = isPerfect
      ? region + modeBadge + ' · Perfect! ' + state.score + '/' + maxScore + ' pts in ' + timeStr + ' ✨'
      : region + modeBadge + ' · ' + state.score + '/' + maxScore + ' pts · ' + state.correct + '/' + state.totalQuestions + ' found · ' + timeStr;

    // Broken-record badges (shown as a single line between grid and URL)
    const broken = state.brokenRecords || {};
    const badges = [];
    if (broken.score) badges.push('New Score Record');
    if (broken.accuracy) badges.push('New Accuracy Record');
    if (broken.time) badges.push('New Time Record');
    const recordLine = badges.length
      ? '🏆 ' + badges.join(' · ')
      : null;

    // Link straight to this level so the recipient can play it
    const url = levelLink(state.startArg);

    const lines = [
      '🧭 Cartographer\u2019s Atlas · ' + dateStr,
      headline,
      '',
      ...gridRows,
      ''
    ];
    if (recordLine) {
      lines.push(recordLine);
      lines.push('');
    }
    lines.push(url);

    return lines.join('\n');
  }

  // " · Hard" / " · Uncharted" suffix for share headlines. Older daily
  // attempts only stored the hardMode flag, so fall back to it.
  function difficultyBadge(difficulty, hardMode) {
    if (difficulty === 'uncharted') return ' · Uncharted';
    return (difficulty === 'hard' || hardMode) ? ' · Hard' : '';
  }

  // Wordle-style compact share format for the daily puzzle, used both
  // from the in-game share button and from the menu's "Share Result" button.
  function buildDailyShareText(opts) {
    const EMOJI = { 2: '🟩', 1: '🟨', 0: '🟥' };
    const grid = (opts.sequence || []).map(r => EMOJI[r] || '⬜').join('');
    const maxScore = opts.total * 2;
    const isPerfect = opts.score === maxScore && opts.total > 0;
    const hardBadge = difficultyBadge(opts.difficulty, opts.hardMode);
    const url = levelLink('daily-five');

    const headline = isPerfect
      ? 'Perfect! ' + opts.score + '/' + maxScore + ' pts ✨'
      : opts.correct + '/' + opts.total + ' found · ' + opts.score + '/' + maxScore + ' pts';

    return [
      '🧭 Atlas Daily #' + opts.puzzleNumber + hardBadge,
      headline,
      '',
      grid,
      '',
      url
    ].join('\n');
  }

  // Re-share today's result from the menu after the game has been completed.
  async function shareDailyResultFromMenu() {
    const dateKey = todayUtcKey();
    const attempt = getDailyAttempt(dateKey);
    if (!attempt) return;
    const text = buildDailyShareText({
      puzzleNumber: attempt.puzzleNumber || dailyPuzzleNumber(dateKey),
      sequence: attempt.sequence || [],
      score: attempt.score,
      correct: attempt.correct,
      total: attempt.total,
      hardMode: attempt.hardMode,
      difficulty: attempt.difficulty
    });
    await shareTextOrCopy(text, 'Atlas Daily');
  }

  // Common share-or-clipboard logic, factored out so both the in-game
  // share button and the menu share button can use it.
  async function shareTextOrCopy(text, title) {
    if (navigator.share) {
      try {
        await navigator.share({ title: title, text: text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      // Find the button that triggered this share if possible
      const btn = document.querySelector('.daily-share-btn') || document.getElementById('share-btn');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✓ Copied to clipboard';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 2200);
      }
    } catch (err) {
      copyDialog('Copy your results', text);
    }
  }

  async function shareResults() {
    const btn = document.getElementById('share-btn');
    const text = buildShareText();
    const shareData = { title: "Cartographer's Atlas", text: text };

    // Try the native share sheet first (mobile, modern desktop)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled — don't fall through to clipboard
        if (err && err.name === 'AbortError') return;
        // Other errors fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(text);
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied to clipboard';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 2200);
    } catch (err) {
      copyDialog('Copy your results', text);
    }
  }

  /* =========================================================
   * DIALOG (the one modal: questions, short forms, text to copy)
   *
   * #dialog sits over everything with its scrim. openDialog() fills it.
   * Escape, the scrim and the close button dismiss it; focus stays inside
   * while it is open and returns to whatever opened it.
   * ========================================================= */

  const dialog = { open: false, opener: null, confirm: null };

  function openDialog(html) {
    const panel = document.getElementById('dialog');
    if (!dialog.open) dialog.opener = document.activeElement;
    dialog.open = true;
    dialog.confirm = null;
    document.getElementById('dialog-body').innerHTML = html;
    document.getElementById('dialog-scrim').hidden = false;
    panel.hidden = false;
    panel.scrollTop = 0;
    (panel.querySelector('[data-autofocus]') || panel.querySelector('#dialog-body input, #dialog-body button') ||
      panel.querySelector('button')).focus();
  }

  function closeDialog() {
    if (!dialog.open) return;
    const opener = dialog.opener;
    dialog.open = false;
    dialog.opener = null;
    dialog.confirm = null;
    document.getElementById('dialog-scrim').hidden = true;
    document.getElementById('dialog').hidden = true;
    document.getElementById('dialog-body').innerHTML = '';
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  // A dialog's contents: its title, body markup and row of buttons
  function dialogContent(title, body, actions) {
    return '<h2 class="dialog-title" id="dialog-title">' + title + '</h2>' +
      '<div class="dialog-text">' + body + '</div>' +
      '<div class="dialog-actions">' + actions + '</div>';
  }

  // Ask before doing something that can't be taken back. opts: title,
  // body (markup), confirm (the button's label), danger, onConfirm.
  // Focus starts on Cancel, so Enter alone never confirms.
  function confirmDialog(opts) {
    openDialog(dialogContent(opts.title, opts.body,
      '<button type="button" class="btn btn--secondary" data-action="dialog-close" data-autofocus>Cancel</button>' +
      '<button type="button" class="btn ' + (opts.danger ? 'btn--danger-solid' : 'btn--primary') + '" data-action="dialog-confirm">' + opts.confirm + '</button>'));
    dialog.confirm = opts.onConfirm;
  }

  // Text laid out to be copied by hand, for browsers that won't copy it themselves
  function copyDialog(title, text) {
    openDialog(dialogContent(title,
      '<p>This browser wouldn’t copy it for you. Select the text below and copy it.</p>' +
      '<textarea class="input" readonly rows="' + Math.min(8, text.split('\n').length + 1) + '" aria-label="' + escapeHtml(title) + '">' + escapeHtml(text) + '</textarea>',
      '<button type="button" class="btn btn--primary" data-action="dialog-close">Done</button>'));
    const field = document.querySelector('#dialog textarea');
    field.focus();
    field.select();
  }

  // Copy text to the clipboard and say so, or show it to be copied by hand
  async function copyText(text, done, title) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice(done);
    } catch (err) {
      copyDialog(title, text);
    }
  }

  /* =========================================================
   * SETTINGS (appearance, play defaults, sync, data, about)
   *
   * Drawn once into #settings-content. After that only its controls are
   * brought in line with what is stored, so a field being typed in keeps
   * its place when a sync finishes underneath it.
   * ========================================================= */

  const THEME_CHOICES = [
    { value: 'system', label: 'System', preview: ' theme-prev--system' },
    { value: 'light', label: 'Parchment', preview: '' },
    { value: 'dark', label: 'Night Chart', preview: ' theme-prev--dark' }
  ];
  // What Reset progress takes away, as the confirmation lists it
  const RESET_ERASES = [
    'Personal records for every level and difficulty',
    'Mastery of every place, and what is due for review',
    'Your activity history and day streak',
    'Daily Five results and streak',
    'Pin the City rounds and distances',
    'Focus practice lists and Learn progress'
  ];

  function renderSettings() {
    if (!document.getElementById('settings-sync')) {
      const group = (key, title, text, body) =>
        '<section class="settings-group" aria-labelledby="settings-' + key + '-title">' +
          '<header><h2 id="settings-' + key + '-title">' + title + '</h2><p>' + text + '</p></header>' +
          '<div class="settings-card">' + body + '</div>' +
        '</section>';
      const tiles = THEME_CHOICES.map(choice =>
        '<button type="button" class="theme-tile" role="radio" data-action="set-theme" data-value="' + choice.value + '">' +
          '<span class="theme-prev' + choice.preview + '"></span>' +
          '<span class="theme-name">' + choice.label + '<span class="radio"></span></span>' +
        '</button>').join('');
      const difficulties = Object.keys(DIFFICULTY_INFO).map(key =>
        '<li><b>' + DIFFICULTY_INFO[key].label + '</b><span>' + DIFFICULTY_INFO[key].desc + '.</span></li>').join('');

      document.getElementById('settings-content').innerHTML =
        '<header class="page-head"><div><p class="eyebrow">This device</p><h1 class="display-l">Settings</h1></div></header>' +
        group('appearance', 'Appearance', 'Two charts of the same world.',
          '<div class="setting setting--stack">' +
            '<div class="setting-text"><strong id="theme-label">Theme</strong></div>' +
            '<div class="themes" role="radiogroup" aria-labelledby="theme-label">' + tiles + '</div>' +
          '</div>' +
          '<div class="setting">' +
            '<div class="setting-text"><strong id="motion-label">Reduce motion</strong>' +
              '<span>Skips screen transitions and animated movement. Follows your device’s setting until you change it here.</span></div>' +
            '<button type="button" class="switch" role="switch" data-action="toggle-motion" aria-labelledby="motion-label"></button>' +
          '</div>') +
        group('play', 'Play', 'Defaults for every level. You can still change them when you start one.',
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Difficulty</strong></div>' + renderDifficultySeg() +
            '<ul class="difflist">' + difficulties + '</ul>' +
          '</div>' +
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Map style</strong><span>Satellite needs a connection. Imagery © Esri.</span>' +
              '<span data-map-note hidden>Uncharted is always played on satellite imagery.</span></div>' + renderMapSeg() +
          '</div>') +
        group('sync', 'Sync', 'Your progress lives on this device. Sync keeps a copy so your other devices match.',
          '<div id="settings-sync"></div>') +
        group('data', 'Data', 'Take a copy of your progress, or start over.',
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Export my progress</strong>' +
              '<span>Downloads everything this device holds as one JSON file: records, mastery, activity, Daily Five and Pin the City history. Your sync code is left out.</span></div>' +
            '<button type="button" class="btn btn--secondary" data-action="export-progress">Export</button>' +
          '</div>' +
          '<div class="setting setting--wrap">' +
            '<div class="setting-text"><strong>Reset progress</strong>' +
              '<span>Erases every record, all mastery, your streaks and your history. Settings stay as they are.</span></div>' +
            '<button type="button" class="btn btn--danger" data-action="reset-progress">Reset progress…</button>' +
          '</div>') +
        group('about', 'About', 'What this is, and what it is made with.',
          '<div class="about">' +
            '<p><b>Cartographer’s Atlas</b> is a geography trainer. Find countries, states, provinces and cities on the map; it keeps track of the ones you know and brings back the ones you miss. It works offline once loaded, and your progress stays on your own devices.</p>' +
            '<dl class="credits">' +
              '<div><dt>Borders and places</dt><dd>Natural Earth, public domain. US outlines fall back to US Census Bureau data.</dd></div>' +
              '<div><dt>Satellite imagery</dt><dd>Esri World Imagery (Esri, Maxar, Earthstar Geographics)</dd></div>' +
              '<div><dt>Typefaces</dt><dd>Cormorant Garamond and Inter, SIL Open Font License</dd></div>' +
            '</dl>' +
            '<button type="button" class="btn btn--secondary" data-action="share-app">' + icon('share') + 'Share the atlas</button>' +
          '</div>');
    }
    syncThemeControls();
    syncMotionControl();
    syncPlayControls();
    renderSettingsSync();
  }

  // Hand the player everything this device holds as a JSON file
  function downloadProgress() {
    const data = exportProgress();
    const name = 'cartographers-atlas-progress-' + data.exportedAt.slice(0, 10) + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice('Saved as ' + name);
  }

  // Reset progress, after saying exactly what goes
  function confirmReset() {
    const synced = !!syncGetToken();
    confirmDialog({
      title: 'Reset all progress?',
      body: '<p>This erases, for good:</p>' +
        '<ul class="dialog-list">' + RESET_ERASES.map(line => '<li>' + line + '</li>').join('') + '</ul>' +
        '<p>' + (synced
          ? 'Your settings and your sync code stay. <b>Sync is on, so your other devices are reset too</b> the next time they sync.'
          : 'Your settings stay as they are.') + '</p>' +
        '<p class="dialog-fine">To keep a copy first, cancel and use Export my progress.</p>',
      confirm: 'Reset progress',
      danger: true,
      onConfirm: () => {
        resetProgress().then(result => {
          showNotice(!synced || result.ok ? 'Progress reset.'
            : 'Progress reset on this device. Your other devices follow once sync can be reached.');
        });
      }
    });
  }

  // Pass the app on: the share sheet where there is one, the link otherwise
  async function shareApp() {
    const url = baseUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cartographer’s Atlas',
          text: 'Learn the world’s countries, states, provinces and cities on the map.',
          url: url
        });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    copyText(url, 'Link copied.', 'Copy the link');
  }

  /* =========================================================
   * THEME & MOTION (per-device preferences, not synced)
   *
   * "atlas-theme" is 'light' | 'dark' | 'system'; without it the page
   * follows the OS. The script in <head> sets data-theme before the first
   * paint; this section keeps it current afterwards. "atlas-motion" is
   * 'reduce' | 'full' (data-motion on <html>); without it the OS decides.
   * ========================================================= */

  const THEME_KEY = 'atlas-theme';
  const MOTION_KEY = 'atlas-motion';
  // Each theme's page colour for the browser chrome (the value of --bg)
  const THEME_COLORS = { light: '#f7f1e3', dark: '#101824' };
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function loadThemePref() {
    try {
      const pref = localStorage.getItem(THEME_KEY);
      if (pref === 'light' || pref === 'dark') return pref;
    } catch (e) { /* storage blocked - follow the system */ }
    return 'system';
  }

  // The theme a preference comes to right now: 'light' or 'dark'
  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return systemDark && systemDark.matches ? 'dark' : 'light';
  }

  // Paint the page in the preferred theme and bring the toggle in line
  function applyTheme() {
    const theme = resolveTheme(loadThemePref());
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);
    const toggle = document.getElementById('theme-toggle');
    toggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    toggle.setAttribute('aria-label',
      theme === 'dark' ? 'Switch to the Parchment theme' : 'Switch to the Night Chart theme');
    syncThemeControls();
  }

  // Mark the stored choice among Settings' theme tiles
  function syncThemeControls() {
    const pref = loadThemePref();
    document.querySelectorAll('[data-action="set-theme"]').forEach(tile => {
      const on = tile.dataset.value === pref;
      tile.setAttribute('aria-checked', String(on));
      tile.tabIndex = on ? 0 : -1;
    });
  }

  function setThemePref(pref) {
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch (e) { /* private mode or disabled storage - nothing to remember it in */ }
    applyTheme();
  }

  if (systemDark) {
    // Safari before 14 only has addListener
    if (systemDark.addEventListener) systemDark.addEventListener('change', applyTheme);
    else if (systemDark.addListener) systemDark.addListener(applyTheme);
  }

  // True when movement should be kept to a minimum
  function reducedMotion() {
    const set = document.documentElement.getAttribute('data-motion');
    if (set) return set === 'reduce';
    return !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Store the choice and apply it; from here on the OS setting no longer decides
  function setMotionPref(pref) {
    try {
      localStorage.setItem(MOTION_KEY, pref);
    } catch (e) { /* private mode or disabled storage - it lasts for this visit */ }
    document.documentElement.setAttribute('data-motion', pref);
    syncMotionControl();
  }

  // Bring Settings' switch in line with whether motion is reduced right now
  function syncMotionControl() {
    const control = document.querySelector('[data-action="toggle-motion"]');
    if (control) control.setAttribute('aria-checked', String(reducedMotion()));
  }

  // An icon from the sprite at the top of <body>
  function icon(name, extraClass) {
    return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  /* =========================================================
   * APP SHELL (views, navigation, screen switching)
   *
   * A view is a top-level page reached from the navigation: the top bar
   * on wide windows, the tab bar on phones. Each view has its own .screen
   * ('<screen>-screen') and its own address: '#<key>', or no hash for
   * Home. Adding a view is one entry here plus its screen in the markup.
   * The game and results screens are not views; they cover the
   * navigation while a round is on.
   * ========================================================= */

  const VIEWS = [
    { key: 'home', screen: 'menu', label: 'Home', icon: 'home', render: renderHome },
    { key: 'stats', screen: 'stats', label: 'Stats', icon: 'stats', render: renderStats },
    { key: 'settings', screen: 'settings', label: 'Settings', icon: 'settings', render: renderSettings }
  ];

  function viewByKey(key) {
    return VIEWS.find(view => view.key === key) || null;
  }

  // The view the address bar names ('#stats'); anything else is Home
  function viewFromHash() {
    const key = window.location.hash.replace(/^#/, '');
    return viewByKey(key) ? key : 'home';
  }

  function viewUrl(key) {
    return baseUrl() + (key === 'home' ? '' : '#' + key);
  }

  // One link per view, in the top bar and in the phone's tab bar
  function renderNav() {
    const links = VIEWS.map(view =>
      '<a href="' + (view.key === 'home' ? './' : '#' + view.key) + '" data-action="view" data-view="' + view.key + '">' +
        icon(view.icon) + '<span>' + view.label + '</span>' +
        (view.key === 'settings' ? '<span class="dot nav-dot" data-sync-dot hidden></span>' : '') +
      '</a>').join('');
    document.getElementById('topnav-links').innerHTML = links;
    document.getElementById('tabbar').innerHTML = links;
  }

  // Mark the current view in the navigation and bring the streak chip and
  // the sync light up to date
  function updateNav() {
    document.querySelectorAll('#topnav-links a, #tabbar a').forEach(link => {
      const on = link.dataset.view === state.view;
      link.classList.toggle('is-on', on);
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const streak = mastery.streak().current;
    const chip = document.getElementById('streak-chip');
    chip.hidden = streak < 1;
    chip.innerHTML = icon('flame') + '<span><b>' + streak + '</b><span class="streak-unit">-day streak</span></span>';
    chip.setAttribute('aria-label', streak + '-day streak');
    syncRefreshEntry();
  }

  // opts.keepAddress: leave the address bar as it is (see switchScreen)
  function showView(key, opts) {
    switchScreen((viewByKey(key) || VIEWS[0]).screen, opts);
  }

  // Redraw the view on screen after its data changed underneath it (a sync
  // pull, a reset). Does nothing visible while a round is on.
  function refreshView() {
    const view = viewByKey(state.view);
    if (view.render && document.body.dataset.screen === view.screen) view.render();
    updateNav();
  }

  // Show a screen: 'game', 'results', or a view's screen ('menu' is Home).
  // opts.keepAddress leaves the address bar alone: on load it may still
  // hold a ?play= link that has yet to be read.
  function switchScreen(name, opts) {
    const view = VIEWS.find(v => v.screen === name);
    closeLevelSheet({ keepFocus: true });
    closeDialog();
    if (view) {
      state.roundId++;   // whatever the round still had queued up no longer applies
      state.review = null;
      state.view = view.key;
      // Drawn on the way in, so bests and the daily card reflect the round just played
      if (view.render) view.render();
      if (!(opts && opts.keepAddress)) setAddressBar(viewUrl(view.key));
      updateNav();
    } else {
      hideNotice();   // it spoke about a view, and would sit over the game's controls
    }
    document.body.dataset.screen = name;
    const target = document.getElementById(name + '-screen');
    if (!target || target.classList.contains('active')) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    target.classList.add('active');
    if (view) playEntrance(target);
  }

  // One fade-up as a view comes in. Redraws while it is showing don't
  // repeat it: the animated element is the page, not what is drawn into it.
  function playEntrance(screen) {
    screen.classList.remove('is-entering');
    void screen.offsetWidth;
    screen.classList.add('is-entering');
  }

  // A hand-typed hash or the browser's back button names another view
  window.addEventListener('hashchange', () => showView(viewFromHash()));

  /* =========================================================
   * EVENT BINDINGS
   * ========================================================= */

  // Controls outside the game say what they do with data-action; one
  // listener serves them all, so redrawn markup needs no rewiring
  const ACTIONS = {
    'view': (el) => {
      // The tab already showing scrolls back to its top
      if (el.dataset.view === state.view && document.body.dataset.screen === viewByKey(state.view).screen) {
        document.getElementById(viewByKey(state.view).screen + '-screen').scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      } else {
        showView(el.dataset.view);
      }
    },
    'toggle-theme': () => setThemePref(resolveTheme(loadThemePref()) === 'dark' ? 'light' : 'dark'),
    'set-theme': (el) => setThemePref(el.dataset.value),
    'toggle-motion': () => setMotionPref(reducedMotion() ? 'full' : 'reduce'),
    'sync-create': () => syncCreateDialog(),
    'sync-create-go': (el) => syncCreate(el),
    'sync-link': () => syncLinkDialog(),
    'sync-link-go': (el) => syncLink(el),
    'sync-now': (el) => syncNow(el),
    'sync-toggle-code': () => syncToggleCode(),
    'sync-copy-code': () => copyText(syncGetToken(), 'Sync code copied.', 'Copy your sync code'),
    'sync-add-device': () => syncCodeDialog(),
    'sync-unlink': () => confirmUnlink(),
    'export-progress': () => downloadProgress(),
    'reset-progress': () => confirmReset(),
    'share-app': () => shareApp(),
    'dialog-close': () => closeDialog(),
    'dialog-confirm': () => {
      const confirmed = dialog.confirm;
      closeDialog();
      if (confirmed) confirmed();
    },
    'play-daily': () => startGame('daily-five'),
    'share-daily': () => shareDailyResultFromMenu(),
    'replay-daily': () => startDailyReplay(todayUtcKey()),
    'start-review': () => startReview(),
    'practice-weak': () => startWeakPractice(),
    'toggle-stats-group': (el) => toggleStatsGroup(el),
    'show-all-records': (el) => showAllRecords(el),
    'set-difficulty': (el) => chooseDifficulty(el.dataset.value),
    'set-map': (el) => chooseMapStyle(el.dataset.value),
    'jump': (el) => jumpToCollection(el.dataset.collection),
    'open-level': (el) => openLevelSheet(el.dataset.level, el),
    'sheet-close': () => closeLevelSheet(),
    'sheet-way': (el) => chooseSheetWay(el.dataset.value),
    'sheet-start': () => startFromSheet(),
    'sheet-learn-reset': () => startFromSheet({ learnFresh: true })
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el || !ACTIONS[el.dataset.action]) return;
    if (el.tagName === 'A') {
      // Leave "open in a new tab" and its relatives to the browser
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    ACTIONS[el.dataset.action](el, e);
  });

  document.getElementById('back-btn').addEventListener('click', () => switchScreen('menu'));
  document.getElementById('home-btn').addEventListener('click', () => switchScreen('menu'));
  // startArg (not currentContinent) so US and Cities levels restart the
  // same mode — their currentContinent is a display label, not a card id.
  document.getElementById('replay-btn').addEventListener('click', () => {
    if (state.lastWasLearn) startGame(state.startArg, { learn: true, learnFresh: true });
    else startGame(state.startArg);
  });
  document.getElementById('learn-ready-btn').addEventListener('click', beginLearnQuiz);
  document.getElementById('pin-btn').addEventListener('click', handlePinButton);
  document.getElementById('review-next-btn').addEventListener('click', startNextReview);
  document.getElementById('practice-btn').addEventListener('click', () => {
    startGame(state.startArg, { practice: state.roundNeedsWork });
  });

  // View Map (results → game screen in review mode) + back out of review mode.
  // Review mode hides the prompt panel, score readout, skip button, page hint,
  // and the regular Atlas back button so the map can be screenshotted clean.
  document.getElementById('view-map-btn').addEventListener('click', () => {
    document.getElementById('game-screen').classList.add('review-mode');
    switchScreen('game');
  });
  document.getElementById('review-back-btn').addEventListener('click', () => {
    document.getElementById('game-screen').classList.remove('review-mode');
    switchScreen('results');
  });
  document.getElementById('daily-practice-btn').addEventListener('click', () => {
    startDailyReplay(state.dailyDateKey || todayUtcKey());
  });
  document.getElementById('share-btn').addEventListener('click', shareResults);
  document.getElementById('skip-btn').addEventListener('click', handleSkip);

  // Zoom controls
  function zoomBy(factor) {
    if (!state.svg || !state.zoomBehavior) return;
    state.svg.transition().duration(280).call(state.zoomBehavior.scaleBy, factor);
  }
  function zoomReset() {
    if (!state.svg || !state.zoomBehavior) return;
    state.svg.transition().duration(380).call(state.zoomBehavior.transform, d3.zoomIdentity);
  }
  document.getElementById('zoom-in-btn').addEventListener('click', () => zoomBy(1.6));
  document.getElementById('zoom-out-btn').addEventListener('click', () => zoomBy(1 / 1.6));
  document.getElementById('zoom-reset-btn').addEventListener('click', zoomReset);
  document.getElementById('map-style-btn').addEventListener('click', toggleMapStyle);

  document.addEventListener('keydown', (e) => {
    const gameActive = document.getElementById('game-screen').classList.contains('active');
    if (!gameActive) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Enter' && state.learn && state.learn.phase === 'study') {
      e.preventDefault();
      beginLearnQuiz();
    } else if (e.key === 'Enter' && state.pin) {
      e.preventDefault();
      handlePinButton();
    } else if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      handleSkip();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.6);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(1 / 1.6);
    } else if (e.key === '0') {
      e.preventDefault();
      zoomReset();
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMapStyle();
    } else if (e.key === 'Escape') {
      switchScreen('menu');
    }
  });

  // Re-render map on resize (e.g. mobile orientation change).
  //
  // renderMap() wipes the SVG and rebuilds the country paths from scratch,
  // which drops the persistent .completed-correct / .completed-wrong classes
  // that mark green/red answered countries. We snapshot the per-feature class
  // state and the zoom transform first, then re-apply them after the rebuild
  // so the board still looks identical to the player after rotating their
  // phone landscape ↔ portrait mid-round.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const gameActive = document.getElementById('game-screen').classList.contains('active');
      if (!gameActive || !state.svg) return;

      // Snapshot persistent per-feature state by feature key (country paths)
      const svgEl = document.getElementById('world-map');
      const correctKeys = Array.from(
        svgEl.querySelectorAll('.country.completed-correct')
      ).map(el => el.getAttribute('data-fkey'));
      const wrongKeys = Array.from(
        svgEl.querySelectorAll('.country.completed-wrong')
      ).map(el => el.getAttribute('data-fkey'));
      const promptKeys = Array.from(
        svgEl.querySelectorAll('.country.prompt-highlight')
      ).map(el => el.getAttribute('data-fkey'));

      // Snapshot per-city state by data-city (us-city mode)
      const correctCities = Array.from(
        svgEl.querySelectorAll('.city-dot.completed-correct')
      ).map(el => el.getAttribute('data-city'));
      const wrongCities = Array.from(
        svgEl.querySelectorAll('.city-dot.completed-wrong')
      ).map(el => el.getAttribute('data-city'));

      const savedTransform = state.currentTransform || null;

      renderMap();

      // Re-apply classes to the newly-built paths/dots. Each feature has a
      // unique data-fkey and each city has a unique data-city, so this is a
      // simple lookup. We escape via CSS.escape since some keys contain
      // characters that would break the selector.
      const reapplyPath = (keys, cls) => {
        keys.forEach(k => {
          if (!k) return;
          state.mapG.selectAll('.country[data-fkey="' + CSS.escape(k) + '"]')
            .classed(cls, true);
        });
      };
      reapplyPath(correctKeys, 'completed-correct');
      reapplyPath(wrongKeys, 'completed-wrong');
      reapplyPath(promptKeys, 'prompt-highlight');
      if (state.learn && state.learn.phase === 'study') drawLearnStudy();

      const reapplyDot = (names, cls) => {
        names.forEach(n => {
          if (!n) return;
          state.mapG.selectAll('.city-dot[data-city="' + CSS.escape(n) + '"]')
            .classed(cls, true);
        });
      };
      reapplyDot(correctCities, 'completed-correct');
      reapplyDot(wrongCities, 'completed-wrong');

      // Restore zoom/pan so the player keeps the framing they had
      if (savedTransform && state.zoomBehavior) {
        state.svg.call(state.zoomBehavior.transform, savedTransform);
      }
    }, 200);
  });

  /* =========================================================
   * PROGRESS (everything a player has earned: snapshot, export, reset)
   *
   * The progress stores are atlas-records, atlas-focus, atlas-pin,
   * atlas-learn, atlas-daily-attempts and atlas-mastery. Preferences
   * (difficulty, map style) and the sync key are not progress.
   *
   * "atlas-reset-at" is when progress was last reset (ms; absent = never).
   * It travels in the sync payload, so a reset on one device reaches the
   * others instead of being undone by their copies (see syncApplyRemote).
   * ========================================================= */

  const RESET_KEY = 'atlas-reset-at';
  // Mastery keeps its own key and is reset through its own API
  const PROGRESS_KEYS = [RECORDS_KEY, FOCUS_KEY, PIN_KEY, LEARN_KEY, DAILY_KEY];

  function loadResetAt() {
    try {
      const at = Number(localStorage.getItem(RESET_KEY));
      return isFinite(at) && at > 0 ? at : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveResetAt(at) {
    try {
      if (at > 0) localStorage.setItem(RESET_KEY, String(at));
      else localStorage.removeItem(RESET_KEY);
    } catch (e) { /* storage blocked - ignore silently */ }
  }

  // Every progress store as plain data: what sync mirrors and an export holds
  function progressSnapshot() {
    return {
      records: loadAllRecords(),
      dailyAttempts: loadDailyAttempts(),
      focusLists: loadFocusLists(),
      pin: loadPinStore(),
      learn: loadLearnAll(),
      mastery: mastery.exportBlob(),
      resetAt: loadResetAt()
    };
  }

  // One JSON-serialisable object holding all of this device's progress,
  // for a download. The sync key is a credential and is left out.
  function exportProgress() {
    return Object.assign({
      app: 'cartographers-atlas',
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: { difficulty: state.difficulty, mapStyle: state.mapStyle }
    }, progressSnapshot());
  }

  // Empties every progress store on this device
  function eraseProgress() {
    PROGRESS_KEYS.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch (e) { /* storage blocked - ignore silently */ }
    });
    mastery.reset();
  }

  // Erase all progress, here and (through sync) on every linked device.
  // Resolves with the push result, or straight away when sync isn't set up.
  function resetProgress() {
    eraseProgress();
    // Later than any reset this device has seen, even if its clock runs slow
    saveResetAt(Math.max(Date.now(), loadResetAt() + 1));
    refreshView();
    return syncPush();
  }

  /* =========================================================
   * SYNC — cross-device progress sync via Cloudflare Pages Function
   *
   * Architecture:
   *   - localStorage is the source of truth. The API at /api/records
   *     mirrors a single user's data, keyed by a 32-char hex token.
   *   - The token is generated once and stored in localStorage. To link
   *     another device, paste the same token there (no accounts).
   *
   * Triggers:
   *   - On app load: if a token exists, pull from server and merge.
   *   - On round end: push to server (fire-and-forget).
   *   - Manual "Sync Now" button: pull + push.
   *
   * Payload: { version, username, lastUpdated } plus progressSnapshot():
   * records, dailyAttempts, focusLists, pin, learn, mastery, resetAt.
   * The server caps it at 256 KB; a refused push shows as a sync error.
   * ========================================================= */

  const SYNC_API = '/api/records';
  const SYNC_TOKEN_RE = /^[a-f0-9]{32}$/i;
  const SYNC_VERSION = 2;
  const SYNC_KEY_TOKEN = 'atlas-sync-token';
  const SYNC_KEY_USERNAME = 'atlas-sync-username';
  const SYNC_KEY_META = 'atlas-sync-meta';

  // ---- Storage helpers ----

  function syncGetToken() {
    try { return localStorage.getItem(SYNC_KEY_TOKEN) || null; } catch (e) { return null; }
  }
  function syncSetToken(token) {
    try { localStorage.setItem(SYNC_KEY_TOKEN, token); } catch (e) {}
  }
  function syncClearToken() {
    try {
      localStorage.removeItem(SYNC_KEY_TOKEN);
      localStorage.removeItem(SYNC_KEY_USERNAME);
      localStorage.removeItem(SYNC_KEY_META);
    } catch (e) {}
  }
  function syncGetUsername() {
    try { return localStorage.getItem(SYNC_KEY_USERNAME) || ''; } catch (e) { return ''; }
  }
  function syncSetUsername(name) {
    try { localStorage.setItem(SYNC_KEY_USERNAME, name || ''); } catch (e) {}
  }
  function syncGetMeta() {
    try {
      const raw = localStorage.getItem(SYNC_KEY_META);
      return raw ? JSON.parse(raw) : { lastSyncAt: 0, lastError: null };
    } catch (e) { return { lastSyncAt: 0, lastError: null }; }
  }
  function syncSetMeta(patch) {
    const next = Object.assign(syncGetMeta(), patch);
    try { localStorage.setItem(SYNC_KEY_META, JSON.stringify(next)); } catch (e) {}
    syncRefreshEntry();
    return next;
  }

  // ---- Token generation / normalization ----

  // 128-bit secret as 32 hex chars, from cryptographically-secure RNG
  function syncGenerateToken() {
    const arr = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Cleans pasted input (whitespace, dashes, casing) and validates shape
  function syncNormalizeToken(input) {
    if (!input) return null;
    const cleaned = String(input).trim().replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
    return SYNC_TOKEN_RE.test(cleaned) ? cleaned : null;
  }

  // ---- Sync payload shape (what we send/receive) ----

  function syncBuildPayload() {
    return Object.assign({
      version: SYNC_VERSION,
      username: syncGetUsername(),
      lastUpdated: Date.now()
    }, progressSnapshot());
  }

  // ---- Merge: blend remote data into localStorage ----

  // Returns false when the remote blob was set aside instead of merged:
  // it predates a reset made on this device, so what it holds is what was
  // erased (the caller pushes, which replaces it).
  // opts.linking: this device is joining the key, not syncing within it.
  function syncApplyRemote(remote, opts) {
    if (!remote || typeof remote !== 'object') return true;

    // A reset time that could not be stored and read back (1e999 parses to
    // Infinity) would look newer on every pull, and wipe this device each time
    const sentReset = Number(remote.resetAt);
    const remoteReset = isFinite(sentReset) && sentReset > 0 ? sentReset : 0;
    const localReset = loadResetAt();
    if (opts && opts.linking) {
      // A device joining a key was never part of that key's resets, nor
      // the key's devices of its own: everything merges, and the key's
      // reset time is taken as it stands
      saveResetAt(remoteReset);
    } else if (remoteReset < localReset) {
      return false;
    } else if (remoteReset > localReset) {
      // Progress was reset on another device after this one last synced:
      // the local copy is what that reset erased
      eraseProgress();
      saveResetAt(remoteReset);
    }

    if (remote.username && !syncGetUsername()) syncSetUsername(remote.username);

    saveAllRecords(syncMergeRecords(loadAllRecords(), remote.records || {}));

    // Daily attempts: union; entries already present locally win
    const mergedDaily = loadDailyAttempts();
    const remoteDaily = remote.dailyAttempts || {};
    for (const dateKey in remoteDaily) {
      if (!mergedDaily[dateKey]) mergedDaily[dateKey] = remoteDaily[dateKey];
    }
    saveDailyAttempts(mergedDaily);

    // Focus lists: per level, the most recent full game wins
    const focus = loadFocusLists();
    const remoteFocus = remote.focusLists || {};
    for (const key in remoteFocus) {
      const r = remoteFocus[key];
      if (r && Array.isArray(r.names) && (!focus[key] || (r.savedAt || 0) > (focus[key].savedAt || 0))) {
        focus[key] = r;
      }
    }
    saveFocusLists(focus);

    // Pin the City: games and per-city misses are unions keyed by time
    if (remote.pin && typeof remote.pin === 'object') savePinStore(mergePinStores(loadPinStore(), remote.pin));

    // Learn ladders: per round, whichever device saved last (a finished
    // ladder's marker included)
    const learn = loadLearnAll();
    const remoteLearn = remote.learn && typeof remote.learn === 'object' ? remote.learn : {};
    for (const key in remoteLearn) {
      const r = remoteLearn[key];
      if (r && typeof r === 'object' && (!learn[key] || (r.savedAt || 0) > (learn[key].savedAt || 0))) {
        learn[key] = r;
      }
    }
    saveLearnAll(learn);

    // Per-item history and the activity log (tolerates a blob without them)
    mastery.mergeBlob(remote.mastery);
    return true;
  }

  function syncMergeRecords(local, remote) {
    const out = Object.assign({}, local);
    for (const key in remote) {
      out[key] = out[key] ? syncMergeRecordEntry(out[key], remote[key]) : remote[key];
    }
    return out;
  }

  // Per-field merge — better/newer wins
  function syncMergeRecordEntry(a, b) {
    const out = Object.assign({}, a);
    if (b.bestScore && (!out.bestScore
        || b.bestScore.value > out.bestScore.value
        || (b.bestScore.value === out.bestScore.value && (b.bestScore.date || '') > (out.bestScore.date || '')))) {
      out.bestScore = b.bestScore;
    }
    if (b.bestTime && (!out.bestTime
        || b.bestTime.value < out.bestTime.value
        || (b.bestTime.value === out.bestTime.value && (b.bestTime.date || '') > (out.bestTime.date || '')))) {
      out.bestTime = b.bestTime;
    }
    if (b.bestAccuracy && (!out.bestAccuracy
        || b.bestAccuracy.pct > out.bestAccuracy.pct
        || (b.bestAccuracy.pct === out.bestAccuracy.pct && b.bestAccuracy.correct > out.bestAccuracy.correct))) {
      out.bestAccuracy = b.bestAccuracy;
    }
    out.gamesPlayed = Math.max(out.gamesPlayed || 0, b.gamesPlayed || 0);
    if ((b.lastPlayed || '') > (out.lastPlayed || '')) out.lastPlayed = b.lastPlayed;
    return out;
  }

  // ---- API client ----

  async function syncPush() {
    const token = syncGetToken();
    if (!token) return { ok: false, reason: 'no_token' };
    try {
      const res = await fetch(SYNC_API + '?token=' + encodeURIComponent(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBuildPayload())
      });
      if (!res.ok) {
        syncSetMeta({ lastError: 'push_' + res.status });
        return { ok: false, reason: 'push_' + res.status };
      }
      syncSetMeta({ lastSyncAt: Date.now(), lastError: null });
      return { ok: true };
    } catch (e) {
      syncSetMeta({ lastError: 'network' });
      return { ok: false, reason: 'network' };
    }
  }

  // opts.linking: see syncApplyRemote. `stale` in the result means the
  // server's copy predates a reset made here and still needs replacing.
  async function syncPull(opts) {
    const token = syncGetToken();
    if (!token) return { ok: false, reason: 'no_token' };
    try {
      const res = await fetch(SYNC_API + '?token=' + encodeURIComponent(token));
      if (!res.ok) {
        syncSetMeta({ lastError: 'pull_' + res.status });
        return { ok: false, reason: 'pull_' + res.status };
      }
      const data = await res.json();
      const merged = syncApplyRemote(data, opts);
      syncSetMeta({ lastSyncAt: Date.now(), lastError: null });
      return { ok: true, hadData: !!data, stale: !merged };
    } catch (e) {
      syncSetMeta({ lastError: 'network' });
      return { ok: false, reason: 'network' };
    }
  }

  // Pull then push — used for manual sync and post-import
  async function syncFullSync() {
    const pull = await syncPull();
    if (!pull.ok) return { ok: false, pull, push: null };
    const push = await syncPush();
    return { ok: push.ok, pull, push };
  }

  // Lifecycle hooks
  async function syncOnAppLoad() {
    if (!syncGetToken()) return;
    const result = await syncPull();
    if (!result.ok) return;
    refreshView();
    if (result.stale) syncPush().catch(() => {});
  }
  function syncAfterGameEnd() {
    if (!syncGetToken()) return;
    syncPush().catch(() => {});
  }

  // ---- Where sync stands: the Settings card and the navigation light ----

  // 'never' (no key yet), 'ok', or 'error' (the last push or pull failed)
  function syncEntryState() {
    if (!syncGetToken()) return 'never';
    return syncGetMeta().lastError ? 'error' : 'ok';
  }

  // What a failed sync means, in words. Reasons are 'network' or
  // '<push|pull>_<http status>'.
  function syncErrorText(reason) {
    if (!reason) return '';
    const safe = ' Everything is still saved on this device.';
    if (reason === 'network') return 'Couldn’t reach the sync server.' + safe;
    if (reason === 'push_413') {
      return 'Your progress has grown too large to sync, so other devices won’t see what’s new.' + safe;
    }
    const parts = String(reason).split('_');
    return (parts[0] === 'pull' ? 'Couldn’t fetch your synced progress' : 'Couldn’t save your progress to sync') +
      ' (error ' + parts[1] + ').' + safe;
  }

  // "just now", "5 minutes ago", "3 hours ago", "on 12 Nov"
  function timeAgo(ms) {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    return 'on ' + shortDate(new Date(ms));
  }

  // Sync's state in a line: the last failure, or when it last went through
  function syncStatusText() {
    const meta = syncGetMeta();
    if (meta.lastError) return syncErrorText(meta.lastError);
    return meta.lastSyncAt ? 'Up to date · last synced ' + timeAgo(meta.lastSyncAt) : 'Not synced yet';
  }

  // A sync code in groups of four; masked, only the last group shows
  function syncCodeMarkup(token, masked) {
    return token.match(/.{1,4}/g).map((part, i, all) =>
      '<span>' + (masked && i < all.length - 1 ? '••••' : part) + '</span>').join('');
  }

  function syncTitleMarkup(username) {
    return username ? 'Syncing as <em>' + escapeHtml(username) + '</em>' : 'Sync is on';
  }

  // Whether the Settings card shows the sync code in full
  let syncCodeShown = false;

  // The Sync card in Settings: the way in while sync is off, everything
  // about it once it is on
  function renderSettingsSync() {
    const card = document.getElementById('settings-sync');
    if (!card) return;
    const token = syncGetToken();
    if (!token) {
      syncCodeShown = false;
      card.innerHTML =
        '<div class="sync-setup">' +
          '<h3>Keep your atlas on every device</h3>' +
          '<p>Create a sync code here and enter it on your phone or laptop. No account, no password: the code is the key. The atlas keeps working offline either way.</p>' +
          '<div class="setting-actions">' +
            '<button type="button" class="btn btn--primary" data-action="sync-create">Create a sync code</button>' +
            '<button type="button" class="btn btn--secondary" data-action="sync-link">I have a code</button>' +
          '</div>' +
        '</div>';
      return;
    }
    // A field that is being typed in keeps its place; only the status moves
    if (card.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      syncRefreshEntry();
      return;
    }
    card.innerHTML =
      '<div class="setting">' +
        '<div class="sync-id">' +
          '<span class="sync-avatar">' + icon('cloud', 'icon--lg') + '</span>' +
          '<div><strong id="sync-title">' + syncTitleMarkup(syncGetUsername()) + '</strong>' +
            '<span class="sync-status" id="sync-status-line" role="status"></span></div>' +
        '</div>' +
        '<button type="button" class="btn btn--secondary" id="sync-now-btn" data-action="sync-now">Sync now</button>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><label for="sync-username-edit"><strong>Username</strong></label>' +
          '<span>A name for this set of devices. Optional.</span></div>' +
        '<input class="input" id="sync-username-edit" value="' + escapeHtml(syncGetUsername()) + '" placeholder="Cartographer" autocomplete="off" maxlength="40" />' +
      '</div>' +
      '<div class="setting setting--stack">' +
        '<div class="setting-text"><strong>Sync code</strong>' +
          '<span>Enter this on another device to link it. Anyone with the code can read and change your progress.</span></div>' +
        '<div class="setting-actions">' +
          '<span class="code" id="sync-key-display">' + syncCodeMarkup(token, !syncCodeShown) + '</span>' +
          '<button type="button" class="btn btn--ghost" id="sync-key-show" data-action="sync-toggle-code" aria-pressed="' + syncCodeShown + '">' +
            (syncCodeShown ? 'Hide' : 'Show') + '</button>' +
          '<button type="button" class="icon-btn" id="sync-key-copy" data-action="sync-copy-code" aria-label="Copy sync code">' + icon('copy') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><strong>Another device</strong>' +
          '<span>Open the atlas there, go to Settings, choose “I have a code” and enter your sync code.</span></div>' +
        '<button type="button" class="btn btn--secondary" data-action="sync-add-device">' + icon('device') + 'Link a device</button>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><strong>This device</strong><span>Stop syncing here. Your progress stays on this device.</span></div>' +
        '<button type="button" class="btn btn--ghost" id="sync-disconnect-btn" data-action="sync-unlink">Unlink</button>' +
      '</div>';
    syncRefreshEntry();
  }

  // Bring the status line and the navigation's sync light in line with
  // the latest status, so a failed push shows at once
  function syncRefreshEntry() {
    const entryState = syncEntryState();
    const failed = entryState === 'error';
    const line = document.getElementById('sync-status-line');
    if (line) {
      line.className = 'sync-status' + (failed ? ' is-error' : '');
      line.innerHTML = '<i class="dot' + (failed ? ' is-error' : '') + '"></i><span>' + escapeHtml(syncStatusText()) + '</span>';
      line.parentNode.parentNode.querySelector('.sync-avatar').classList.toggle('is-error', failed);
    }
    document.querySelectorAll('[data-sync-dot]').forEach(dot => {
      dot.hidden = entryState === 'never';
      dot.classList.toggle('is-error', failed);
    });
  }

  // ---- Sync actions and their dialogs ----

  function syncCreateDialog() {
    openDialog(dialogContent('Create a sync code',
      '<p>A sync code links your devices. This device makes one, and you enter it on the others. There is no account and no password, so keep the code to yourself.</p>' +
      '<label class="field-label" for="sync-username-new">Username <span>(optional)</span></label>' +
      '<input class="input" id="sync-username-new" placeholder="Cartographer" autocomplete="off" maxlength="40" data-autofocus />',
      '<button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button>' +
      '<button type="button" class="btn btn--primary" id="sync-create-btn" data-action="sync-create-go" data-submit>Create sync code</button>'));
  }

  async function syncCreate(button) {
    const username = document.getElementById('sync-username-new').value.trim();
    button.disabled = true;
    button.textContent = 'Creating…';
    syncSetToken(syncGenerateToken());
    if (username) syncSetUsername(username);
    const push = await syncPush();
    refreshView();
    syncCodeDialog(push.ok ? 'Your sync code is ready' : 'Your sync code is saved',
      push.ok ? '' : syncErrorText(push.reason) + ' It will be sent the next time sync gets through.');
  }

  // The code in full, with how to use it on another device
  function syncCodeDialog(title, note) {
    const token = syncGetToken();
    if (!token) return;
    openDialog(dialogContent(title || 'Link another device',
      (note ? '<p class="dialog-note is-error">' + escapeHtml(note) + '</p>' : '') +
      '<ol class="steps-list">' +
        '<li>Open Cartographer’s Atlas on the other device.</li>' +
        '<li>Go to Settings, find Sync and choose “I have a code”.</li>' +
        '<li>Enter this code. Spaces don’t matter.</li>' +
      '</ol>' +
      '<div class="code code--full" id="sync-code-full">' + syncCodeMarkup(token, false) + '</div>' +
      '<p class="dialog-fine">Anyone with the code can read and change your progress.</p>',
      '<button type="button" class="btn btn--secondary" data-action="sync-copy-code">' + icon('copy') + 'Copy code</button>' +
      '<button type="button" class="btn btn--primary" data-action="dialog-close" data-autofocus>Done</button>'));
  }

  function syncLinkDialog() {
    openDialog(dialogContent('Link this device',
      '<p>Enter the sync code from a device that already syncs. What this device has is kept and merged with it.</p>' +
      '<label class="field-label" for="sync-key-input">Sync code</label>' +
      '<input class="input input--code" id="sync-key-input" placeholder="32 letters and digits" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-autofocus />' +
      '<p class="dialog-note" id="sync-import-status" role="status"></p>',
      '<button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button>' +
      '<button type="button" class="btn btn--primary" id="sync-import-btn" data-action="sync-link-go" data-submit>Link device</button>'));
  }

  async function syncLink(button) {
    const input = document.getElementById('sync-key-input');
    const status = document.getElementById('sync-import-status');
    const say = (text) => {
      status.textContent = text;
      status.classList.toggle('is-error', !!text);
    };
    const candidate = syncNormalizeToken(input.value);
    if (!candidate) {
      say('That isn’t a sync code. A code is 32 characters: the digits 0 to 9 and the letters a to f.');
      input.focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Linking…';
    say('');
    syncSetToken(candidate);
    const pull = await syncPull({ linking: true });
    if (!pull.ok) {
      syncClearToken();
      syncRefreshEntry();
      // The dialog may have been closed while the request was out
      if (document.contains(button)) {
        say(syncErrorText(pull.reason) + ' Nothing was linked. Check the code and try again.');
        button.disabled = false;
        button.textContent = 'Link device';
      }
      return;
    }
    await syncPush();
    closeDialog();
    refreshView();
    showNotice(pull.hadData ? 'This device is linked. Your progress has been merged.'
      : 'This device is linked. Nothing was stored under that code yet.');
  }

  // Manual sync: pull, merge, push
  async function syncNow(button) {
    button.disabled = true;
    button.textContent = 'Syncing…';
    const result = await syncFullSync();
    if (result.ok) refreshView();
    button.disabled = false;
    button.textContent = 'Sync now';
    // A redraw replaced the button: put the focus on the one that took its place
    const current = document.getElementById('sync-now-btn');
    if (current && current !== button && document.activeElement === document.body) current.focus();
  }

  function syncToggleCode() {
    syncCodeShown = !syncCodeShown;
    document.getElementById('sync-key-display').innerHTML = syncCodeMarkup(syncGetToken(), !syncCodeShown);
    const button = document.getElementById('sync-key-show');
    button.textContent = syncCodeShown ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(syncCodeShown));
  }

  function confirmUnlink() {
    confirmDialog({
      title: 'Unlink this device?',
      body: '<p>Sync stops on this device. Your progress stays here, and your other devices keep theirs.</p>' +
        '<p>To link it again, enter the sync code from one of them. <b>If this is your only device, note the code down first</b>: it isn’t kept anywhere else.</p>',
      confirm: 'Unlink',
      danger: true,
      onConfirm: () => {
        syncClearToken();
        refreshView();
        showNotice('This device no longer syncs.');
      }
    });
  }

  // The username saves itself a moment after the typing stops
  let syncUsernameTimer;
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || input.id !== 'sync-username-edit') return;
    document.getElementById('sync-title').innerHTML = syncTitleMarkup(input.value.trim());
    clearTimeout(syncUsernameTimer);
    syncUsernameTimer = setTimeout(() => {
      syncSetUsername(input.value.trim());
      syncPush().catch(() => {});
    }, 600);
  });

  renderNav();
  applyTheme();
  showView(viewFromHash(), { keepAddress: true });

  // Read-mostly hook for automated checks; the game itself never reads it
  window.__atlas = {
    state, mastery, LEVELS, COLLECTIONS, VIEWS, startGame, levelByKey, showView, exportProgress, resetProgress,
    version: 2
  };

  init();

})();
