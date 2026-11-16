// Capital, ISO 3166-1 alpha-2 code, and (optional) other capitals a quiz should accept.
// Keys are the canonical names in CONTINENTS. The first capital is the one to show and teach. The
// optional list holds other cities that are also a capital of that country (de facto, legislative,
// judicial, interim): count them as right, and never offer them as a wrong choice for that country.
// Never offer two cities together when one name contains the other (Nicosia / North Nicosia,
// Jerusalem / East Jerusalem, La Paz / Ciudad de la Paz): in a list of choices they read as one place.
// Somaliland and Northern Cyprus have no ISO code and no flag emoji. XS and XN are placeholders from
// ISO's private-use block: skip the flag for those two.
const WORLD_FACTS = {
  // Africa
  'Algeria': ['Algiers', 'DZ'],
  'Angola': ['Luanda', 'AO'],
  'Benin': ['Porto-Novo', 'BJ', ['Cotonou']], // Porto-Novo: official; Cotonou: de facto, seat of government
  'Botswana': ['Gaborone', 'BW'],
  'Burkina Faso': ['Ouagadougou', 'BF'],
  'Burundi': ['Gitega', 'BI', ['Bujumbura']], // Gitega: political capital since 2019; Bujumbura: economic capital
  'Cameroon': ['Yaoundé', 'CM'],
  'Cape Verde': ['Praia', 'CV'],
  'Central African Republic': ['Bangui', 'CF'],
  'Chad': ["N'Djamena", 'TD'],
  'Comoros': ['Moroni', 'KM'],
  'Democratic Republic of the Congo': ['Kinshasa', 'CD'],
  'Republic of the Congo': ['Brazzaville', 'CG'],
  'Djibouti': ['Djibouti', 'DJ'],
  'Egypt': ['Cairo', 'EG'],
  'Equatorial Guinea': ['Ciudad de la Paz', 'GQ', ['Malabo']], // capital by decree since January 2026; Malabo: capital until then
  'Eritrea': ['Asmara', 'ER'],
  'Eswatini': ['Mbabane', 'SZ', ['Lobamba']], // Mbabane: administrative; Lobamba: legislative
  'Ethiopia': ['Addis Ababa', 'ET'],
  'Gabon': ['Libreville', 'GA'],
  'Gambia': ['Banjul', 'GM'],
  'Ghana': ['Accra', 'GH'],
  'Guinea': ['Conakry', 'GN'],
  'Guinea-Bissau': ['Bissau', 'GW'],
  'Ivory Coast': ['Yamoussoukro', 'CI', ['Abidjan']], // Yamoussoukro: official; Abidjan: de facto, seat of government
  'Kenya': ['Nairobi', 'KE'],
  'Lesotho': ['Maseru', 'LS'],
  'Liberia': ['Monrovia', 'LR'],
  'Libya': ['Tripoli', 'LY'],
  'Madagascar': ['Antananarivo', 'MG'],
  'Malawi': ['Lilongwe', 'MW'],
  'Mali': ['Bamako', 'ML'],
  'Mauritania': ['Nouakchott', 'MR'],
  'Mauritius': ['Port Louis', 'MU'],
  'Morocco': ['Rabat', 'MA'],
  'Mozambique': ['Maputo', 'MZ'],
  'Namibia': ['Windhoek', 'NA'],
  'Niger': ['Niamey', 'NE'],
  'Nigeria': ['Abuja', 'NG'],
  'Rwanda': ['Kigali', 'RW'],
  'Senegal': ['Dakar', 'SN'],
  'Sierra Leone': ['Freetown', 'SL'],
  'Somalia': ['Mogadishu', 'SO'],
  'South Africa': ['Pretoria', 'ZA', ['Cape Town', 'Bloemfontein']], // executive; legislative; judicial
  'South Sudan': ['Juba', 'SS'],
  'Sudan': ['Khartoum', 'SD'],
  'Tanzania': ['Dodoma', 'TZ'], // Dar es Salaam is the former capital and largest city, not a capital
  'Togo': ['Lomé', 'TG'],
  'Tunisia': ['Tunis', 'TN'],
  'Uganda': ['Kampala', 'UG'],
  'Western Sahara': ['Laayoune', 'EH'],
  'Zambia': ['Lusaka', 'ZM'],
  'Zimbabwe': ['Harare', 'ZW'],
  'Somaliland': ['Hargeisa', 'XS'], // XS is a private-use placeholder: no ISO code, no flag emoji

  // Asia
  'Afghanistan': ['Kabul', 'AF'],
  'Armenia': ['Yerevan', 'AM'],
  'Azerbaijan': ['Baku', 'AZ'],
  'Bahrain': ['Manama', 'BH'],
  'Bangladesh': ['Dhaka', 'BD'],
  'Bhutan': ['Thimphu', 'BT'],
  'Brunei': ['Bandar Seri Begawan', 'BN'],
  'Cambodia': ['Phnom Penh', 'KH'],
  'China': ['Beijing', 'CN'],
  'Cyprus': ['Nicosia', 'CY'],
  'Georgia': ['Tbilisi', 'GE'],
  'India': ['New Delhi', 'IN'],
  'Indonesia': ['Jakarta', 'ID'],
  'Iran': ['Tehran', 'IR'],
  'Iraq': ['Baghdad', 'IQ'],
  'Israel': ['Jerusalem', 'IL'],
  'Japan': ['Tokyo', 'JP'],
  'Jordan': ['Amman', 'JO'],
  'Kazakhstan': ['Astana', 'KZ'],
  'Kuwait': ['Kuwait City', 'KW'],
  'Kyrgyzstan': ['Bishkek', 'KG'],
  'Laos': ['Vientiane', 'LA'],
  'Lebanon': ['Beirut', 'LB'],
  'Malaysia': ['Kuala Lumpur', 'MY'], // Putrajaya is the administrative centre, not a capital
  'Mongolia': ['Ulaanbaatar', 'MN'],
  'Myanmar': ['Naypyidaw', 'MM'],
  'Nepal': ['Kathmandu', 'NP'],
  'North Korea': ['Pyongyang', 'KP'],
  'Oman': ['Muscat', 'OM'],
  'Pakistan': ['Islamabad', 'PK'],
  'Palestine': ['Ramallah', 'PS', ['East Jerusalem', 'Jerusalem']], // Ramallah: seat of government; Jerusalem: declared capital
  'Philippines': ['Manila', 'PH'],
  'Qatar': ['Doha', 'QA'],
  'Saudi Arabia': ['Riyadh', 'SA'],
  'South Korea': ['Seoul', 'KR'],
  'Sri Lanka': ['Sri Jayawardenepura Kotte', 'LK', ['Colombo']], // Kotte: legislative; Colombo: executive and judicial
  'Syria': ['Damascus', 'SY'],
  'Taiwan': ['Taipei', 'TW'],
  'Tajikistan': ['Dushanbe', 'TJ'],
  'Thailand': ['Bangkok', 'TH'],
  'Timor-Leste': ['Dili', 'TL'],
  'Turkey': ['Ankara', 'TR'],
  'Turkmenistan': ['Ashgabat', 'TM'],
  'United Arab Emirates': ['Abu Dhabi', 'AE'],
  'Uzbekistan': ['Tashkent', 'UZ'],
  'Vietnam': ['Hanoi', 'VN'],
  'Yemen': ['Sanaa', 'YE', ['Aden']], // Sanaa: constitutional capital; Aden: interim capital of the recognised government
  'Northern Cyprus': ['North Nicosia', 'XN', ['Nicosia']], // the northern half of divided Nicosia; XN is a private-use placeholder: no ISO code, no flag emoji

  // Europe
  'Albania': ['Tirana', 'AL'],
  'Austria': ['Vienna', 'AT'],
  'Belarus': ['Minsk', 'BY'],
  'Belgium': ['Brussels', 'BE'],
  'Bosnia and Herzegovina': ['Sarajevo', 'BA'],
  'Bulgaria': ['Sofia', 'BG'],
  'Croatia': ['Zagreb', 'HR'],
  'Czech Republic': ['Prague', 'CZ'],
  'Denmark': ['Copenhagen', 'DK'],
  'Estonia': ['Tallinn', 'EE'],
  'Finland': ['Helsinki', 'FI'],
  'France': ['Paris', 'FR'],
  'Germany': ['Berlin', 'DE'],
  'Greece': ['Athens', 'GR'],
  'Hungary': ['Budapest', 'HU'],
  'Iceland': ['Reykjavík', 'IS'],
  'Ireland': ['Dublin', 'IE'],
  'Italy': ['Rome', 'IT'],
  'Kosovo': ['Pristina', 'XK'], // XK is user-assigned, not ISO, but has a flag emoji
  'Latvia': ['Riga', 'LV'],
  'Lithuania': ['Vilnius', 'LT'],
  'Luxembourg': ['Luxembourg', 'LU'],
  'Moldova': ['Chișinău', 'MD'],
  'Montenegro': ['Podgorica', 'ME'], // Cetinje's "Old Royal Capital" is an honorary title
  'Netherlands': ['Amsterdam', 'NL'], // The Hague is the seat of government, not a capital
  'North Macedonia': ['Skopje', 'MK'],
  'Norway': ['Oslo', 'NO'],
  'Poland': ['Warsaw', 'PL'],
  'Portugal': ['Lisbon', 'PT'],
  'Romania': ['Bucharest', 'RO'],
  'Russia': ['Moscow', 'RU'],
  'Serbia': ['Belgrade', 'RS'],
  'Slovakia': ['Bratislava', 'SK'],
  'Slovenia': ['Ljubljana', 'SI'],
  'Spain': ['Madrid', 'ES'],
  'Sweden': ['Stockholm', 'SE'],
  'Switzerland': ['Bern', 'CH'],
  'Ukraine': ['Kyiv', 'UA'],
  'United Kingdom': ['London', 'GB'],

  // North America
  'Antigua and Barbuda': ["Saint John's", 'AG'],
  'Bahamas': ['Nassau', 'BS'],
  'Barbados': ['Bridgetown', 'BB'],
  'Belize': ['Belmopan', 'BZ'],
  'Canada': ['Ottawa', 'CA'],
  'Costa Rica': ['San José', 'CR'],
  'Cuba': ['Havana', 'CU'],
  'Dominica': ['Roseau', 'DM'],
  'Dominican Republic': ['Santo Domingo', 'DO'],
  'El Salvador': ['San Salvador', 'SV'],
  'Grenada': ["Saint George's", 'GD'],
  'Guatemala': ['Guatemala City', 'GT'],
  'Haiti': ['Port-au-Prince', 'HT'],
  'Honduras': ['Tegucigalpa', 'HN'],
  'Jamaica': ['Kingston', 'JM'],
  'Mexico': ['Mexico City', 'MX'],
  'Nicaragua': ['Managua', 'NI'],
  'Panama': ['Panama City', 'PA'],
  'Saint Kitts and Nevis': ['Basseterre', 'KN'],
  'Saint Lucia': ['Castries', 'LC'],
  'Saint Vincent and the Grenadines': ['Kingstown', 'VC'],
  'Trinidad and Tobago': ['Port of Spain', 'TT'],
  'United States': ['Washington, D.C.', 'US'],

  // South America
  'Argentina': ['Buenos Aires', 'AR'],
  'Bolivia': ['Sucre', 'BO', ['La Paz']], // Sucre: constitutional and judicial; La Paz: seat of government
  'Brazil': ['Brasília', 'BR'],
  'Chile': ['Santiago', 'CL'],
  'Colombia': ['Bogotá', 'CO'],
  'Ecuador': ['Quito', 'EC'],
  'Falkland Islands': ['Stanley', 'FK'],
  'French Guiana': ['Cayenne', 'GF'],
  'Guyana': ['Georgetown', 'GY'],
  'Paraguay': ['Asunción', 'PY'],
  'Peru': ['Lima', 'PE'],
  'Suriname': ['Paramaribo', 'SR'],
  'Uruguay': ['Montevideo', 'UY'],
  'Venezuela': ['Caracas', 'VE'],

  // Oceania
  'Australia': ['Canberra', 'AU'],
  'Fiji': ['Suva', 'FJ'],
  'New Caledonia': ['Nouméa', 'NC'],
  'New Zealand': ['Wellington', 'NZ'],
  'Papua New Guinea': ['Port Moresby', 'PG'],
  'Solomon Islands': ['Honiara', 'SB'],
  'Vanuatu': ['Port Vila', 'VU']
};

// Extra spellings accepted when the player types a country's name (lower-case, no diacritics needed —
// the matcher folds case and accents). Only real alternative names, not misspellings. No spelling
// appears under two countries, so the lists also work as one typed-name lookup. Match the whole
// answer against these and the canonical names, never part of it ("republic of korea" sits inside
// North Korea's long name), and not through NAME_ALIASES, which sends "congo" to one country for the
// map data's sake. A bare "congo" could mean either Congo, so it is accepted for neither.
const COUNTRY_TYPED_ALIASES = {
  // Africa
  'Burkina Faso': ['burkina'],
  'Cape Verde': ['cabo verde'],
  'Central African Republic': ['car'],
  'Democratic Republic of the Congo': ['dr congo', 'drc', 'democratic republic of congo', 'congo-kinshasa', 'congo kinshasa'],
  'Republic of the Congo': ['republic of congo', 'congo-brazzaville', 'congo brazzaville'],
  'Eswatini': ['swaziland'],
  'Gambia': ['the gambia'],
  'Guinea-Bissau': ['guinea bissau'],
  'Ivory Coast': ["cote d'ivoire", 'cote divoire'],
  'South Africa': ['rsa'],

  // Asia
  'Brunei': ['brunei darussalam'],
  'China': ["people's republic of china", 'peoples republic of china', 'prc'],
  'Kyrgyzstan': ['kyrgyz republic'],
  'Laos': ['lao pdr'],
  'Myanmar': ['burma'],
  'North Korea': ['dprk', "democratic people's republic of korea", 'democratic peoples republic of korea'],
  'Palestine': ['state of palestine', 'palestinian territories'],
  'Philippines': ['the philippines'],
  'Saudi Arabia': ['ksa'],
  'South Korea': ['republic of korea', 'rok'],
  'Timor-Leste': ['east timor', 'timor leste'],
  'Turkey': ['turkiye'],
  'United Arab Emirates': ['uae', 'emirates'],
  'Vietnam': ['viet nam'],
  'Northern Cyprus': ['north cyprus', 'turkish republic of northern cyprus', 'trnc'],

  // Europe
  'Bosnia and Herzegovina': ['bosnia', 'bosnia-herzegovina', 'bosnia herzegovina', 'bosnia & herzegovina', 'bih'],
  'Czech Republic': ['czechia'],
  'Ireland': ['republic of ireland', 'eire'],
  'Netherlands': ['the netherlands', 'holland'],
  'North Macedonia': ['macedonia'],
  'Russia': ['russian federation'],
  'Slovakia': ['slovak republic'],
  'United Kingdom': ['uk', 'great britain', 'britain'],

  // North America
  'Antigua and Barbuda': ['antigua', 'antigua & barbuda'],
  'Bahamas': ['the bahamas'],
  'Saint Kitts and Nevis': ['st kitts and nevis', 'st. kitts and nevis', 'saint kitts & nevis', 'saint kitts', 'st kitts', 'st. kitts'],
  'Saint Lucia': ['st lucia', 'st. lucia'],
  'Saint Vincent and the Grenadines': ['st vincent and the grenadines', 'st. vincent and the grenadines', 'saint vincent & the grenadines', 'saint vincent', 'st vincent', 'st. vincent'],
  'Trinidad and Tobago': ['trinidad', 'trinidad & tobago'],
  'United States': ['usa', 'us', 'united states of america', 'america'],

  // South America
  'Falkland Islands': ['falklands', 'malvinas', 'islas malvinas'],
  'Suriname': ['surinam'],

  // Oceania
  'New Zealand': ['nz', 'aotearoa'],
  'Papua New Guinea': ['png'],
  'Solomon Islands': ['solomons']
};
