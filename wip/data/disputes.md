# World facts — independent check, disputes and uncertain entries

Checked 16 November 2026 against `world-facts.js` (the draft) by writing `blind.json` from memory first, then diffing (`verify/diff.js`, output in `verify/diff-output.txt`).

## Result
- **Primary capitals: 185 of 185 agree** (3 differ in spelling only).
- **ISO codes: 183 of 185 agree.** The other two are the places with no ISO code, where the draft has a placeholder and the blind list has nothing.
- **Alternates: 4 differ.** All four resolve in the draft's favour.
- **No capital or code in the draft needs to change.** One typed alias must go (`congo`) and one should go (`republic of china`); see the last section.

## Limits of this check
- **No page could be opened.** `WebFetch` failed for `en.wikipedia.org` and `www.africanews.com` (hosts outside the session's allowed network), so every source below is what a web search reported from that page, not the page read in full.
- **Wikipedia's "List of national capitals" was seen only through search summaries of the live page and dated mirrors.** The CIA World Factbook was seen only through third-party copies of older editions.
- **Real-time status is as recent as the newest article found:** Yemen 3 November 2026, South Korea October 2026, Equatorial Guinea September 2026, Indonesia May 2026.

## A. Disagreements between the draft and the blind list

| Country | Draft | Blind | Verified answer | Source |
|---|---|---|---|---|
| Tanzania | Dodoma, no alternate | Dodoma, alt Dar es Salaam | **Draft stands: Dodoma only.** Dodoma is the official capital (a Wikipedia talk-page note cites a 2018 act declaring it the only capital); parliament, the executive and the judiciary are reported to be there, and in January 2026 the government told institutions with finished offices in Dodoma to vacate Dar es Salaam. Dar es Salaam is the former capital and commercial hub. Britannica's Dodoma and Dar es Salaam entries and older Wikipedia mirrors still say "de facto capital" or "pending transfer"; that wording is stale, so a learner may have seen it. | https://www.britannica.com/place/Dodoma · https://en.wikipedia.org/wiki/List_of_countries_with_multiple_capitals · https://dailynews.co.tz/dodoma-is-a-hub-of-all-the-governments-operations-dr-nchemba-insists/ |
| Malaysia | Kuala Lumpur, no alternate | Kuala Lumpur, alt Putrajaya | **Draft stands.** Kuala Lumpur is the capital under the constitution, with Parliament and the King; Putrajaya is the federal administrative centre. Britannica: "administrative centre"; an old CIA Factbook edition: "administrative center not capital". | https://www.britannica.com/place/Putrajaya · https://en.wikipedia.org/wiki/List_of_capitals_in_Malaysia · https://user.iiasa.ac.at/~marek/fbook/05/fields/2057.html |
| Montenegro | Podgorica, no alternate | Podgorica, alt Cetinje | **Draft stands.** Constitution, Article 5: "The capital of Montenegro shall be Podgorica. The Old Royal Capital of Montenegro shall be Cetinje." The second is an honorary title. | https://www.constituteproject.org/constitution/Montenegro_2007 · https://www.britannica.com/facts/Montenegro |
| Netherlands | Amsterdam, no alternate | Amsterdam, alt The Hague | **Draft stands.** Article 32 of the constitution names "the capital city, Amsterdam". The Hague is the seat of government and is not styled a capital. | https://en.wikipedia.org/wiki/Capital_of_the_Netherlands |
| Somaliland | Hargeisa, `XS` | Hargeisa, no code | **No ISO 3166-1 code exists.** `XS` sits in ISO's user-assigned block (AA, QM–QZ, XA–XZ, ZZ), so it can never collide with a real code, and it has some informal use for Somaliland. It has no flag emoji. Draft is acceptable as long as the flag is skipped. | https://en.wikipedia.org/wiki/XK_(user_assigned_code) · https://www.iso.org/iso-3166-country-codes.html · https://www.change.org/p/state-of-israel-adopt-xs-as-a-user-defined-country-code-for-somaliland |
| Northern Cyprus | North Nicosia, `XN` | North Nicosia, no code | **No ISO 3166-1 code exists** (ISO lists only `CY`). `XN` is in the same user-assigned block. No flag emoji. Same condition as Somaliland. | https://en.wikipedia.org/wiki/XK_(user_assigned_code) · https://www.iso.org/iso-3166-country-codes.html |
| Iceland | Reykjavík | Reykjavik | **Same city; draft spelling is the reference one.** Britannica and Merriam-Webster head the entry "Reykjavík"; the unaccented form is an accepted variant. | https://www.britannica.com/place/Reykjavik |
| Antigua and Barbuda | Saint John's | St. John's | **Same city; both spellings are correct.** The UN gazetteer gives "St John's" in English; Britannica spells it out. The draft's form matches the game's "Saint Lucia". A typed matcher must take St, St. and Saint. | https://ungegn.un.org/dashboard/cities/details?id=221 |
| Grenada | Saint George's | St. George's | **Same city; both spellings are correct**, same convention as Saint John's. No separate source found for Grenada beyond a search summary of Wikivoyage. | https://en.wikipedia.org/wiki/List_of_national_capitals (not opened) |

## B. Entries either side marked less than certain

The draft and the blind list agree on every row here. "Draft" is the draft's value.

| Country | Draft | Verified answer | Source |
|---|---|---|---|
| Equatorial Guinea | Ciudad de la Paz, alt Malabo | **Correct.** Decree-Law 1/2026, signed 2 January 2026 and published 3 January, declares Ciudad de la Paz the capital; institutions have a year to move. A September 2026 report still calls the city nearly empty, so Malabo stays accepted. Re-check in early 2027. | https://www.africanews.com/2026/01/05/equatorial-guinea-relocates-capital/ · https://www.financialafrik.com/en/2026/01/06/equatorial-guinea-officially-changes-its-capital/ · https://afrique.le360.ma/politique/ciudad-de-la-paz-nouvelle-capitale-fantome-de-guinee-equatoriale_QEK4KZWZ3VC77LRFKPTUVZ4ZFE/ |
| Indonesia | Jakarta | **Correct.** The Constitutional Court ruled in May 2026 that Jakarta remains the capital until a presidential decree moves it; none has been issued. Nothing newer than May was found. | https://www.thejakartapost.com/indonesia/2026/05/15/court-ruling-raises-further-questions-over-nusantaras-future.html · https://theonlinecitizen.com/2026/05/15/indonesian-court-rules-jakarta-remains-capital-until-presidential-decree-issued |
| Egypt | Cairo | **Correct.** The government sits in the New Capital, but a February 2026 draft law would make it a special-status province "but not the capital of Egypt". Whether the law passed was not found. | https://english.ahram.org.eg/NewsContent/50/1201/562928/AlAhram-Weekly/Egypt/Special-status-for-the-New-Capital.aspx |
| Western Sahara | Laayoune | **Correct for the territory.** Laayoune is the claimed capital and largest city, under Moroccan administration; Tifariti is the Sahrawi republic's temporary capital. | https://www.worldatlas.com/articles/what-is-the-capital-of-western-sahara.html |
| Israel | Jerusalem | **Correct as Israel's designated capital**, with limited recognition: most resident embassies are in the Tel Aviv area. Tel Aviv is not a capital. | https://aa.com.tr/en/middle-east/factbox-which-countries-have-moved-their-embassies-to-jerusalem/3913409 |
| Palestine | Ramallah, alt East Jerusalem, Jerusalem | **Correct.** Basic Law, Article 3: "Jerusalem is the capital of Palestine"; Ramallah is the working seat of government. Either could be shown first; Ramallah is the usual quiz answer. | https://www.constituteproject.org/constitution/Palestine_2005 · https://al-shabaka.org/policy-memos/the-reification-of-ramallah-undermining-a-palestinian-capital-in-jerusalem |
| Benin | Porto-Novo, alt Cotonou | **Correct.** Britannica: Porto-Novo is the official capital and seat of the legislature; the president and most ministers are in Cotonou. | https://www.britannica.com/quiz/african-capitals-quiz |
| Ivory Coast | Yamoussoukro, alt Abidjan | **Correct.** Britannica: Yamoussoukro is the capital, Abidjan the de facto capital. | https://www.britannica.com/quiz/african-capitals-quiz |
| Eswatini | Mbabane, alt Lobamba | **Correct.** Britannica: Mbabane administrative and judicial, Lobamba legislative. | https://www.britannica.com/quiz/african-capitals-quiz |
| Burundi | Gitega, alt Bujumbura | **Correct.** A 2019 law made Gitega the political capital and kept Bujumbura as economic capital. | https://en.wikipedia.org/wiki/Gitega · https://www.theeastafrican.co.ke/tea/news/east-africa/burundi-names-gitega-as-new-capital-1409084 |
| South Africa | Pretoria, alt Cape Town, Bloemfontein | **Correct.** Executive, legislative, judicial. | https://www.worldatlas.com/articles/which-countries-have-two-or-more-capital-cities.html |
| Bolivia | Sucre, alt La Paz | **Correct.** Sucre is the constitutional capital and seat of the judiciary; La Paz is the seat of the executive and legislature. | https://en.wikipedia.org/wiki/List_of_national_capitals (via a mirror) |
| Sri Lanka | Sri Jayawardenepura Kotte, alt Colombo | **Correct.** Britannica: Kotte legislative, Colombo executive and judicial. Britannica spells it "Jayewardenepura". | https://www.britannica.com/place/Sri-Jayewardenepura-Kotte · https://en.wikipedia.org/wiki/Capital_of_Sri_Lanka |
| Yemen | Sanaa, alt Aden | **Correct, but volatile.** Aden was still the government's temporary capital on 3 November 2026, with Houthi forces advancing on it. Re-check before each release. | https://www.thenationalnews.com/news/mena/2026/11/03/yemen-reshuffles-cabinet-as-houthis-advance-towards-aden/ |
| Sudan | Khartoum | **Correct.** The government returned from Port Sudan on 11 January 2026. | https://allafrica.com/stories/202601130501.html |
| Kazakhstan | Astana | **Correct.** Constitutional law No. 299-VIII of 5 June 2026 on the status of the capital names Astana. | https://zakon.uchet.kz/eng/docs/Z2600000299 |
| Myanmar | Naypyidaw | **Correct.** The new parliament convened there in March 2026. | https://www.aljazeera.com/news/2026/3/16/myanmar-parliament-dominated-by-pro-military-party-convenes-after-5-years |
| South Korea | Seoul | **Correct.** Sejong as administrative capital is still a bill and a proposed constitutional amendment (October 2026). | https://www.khan.co.kr/en/article/202610021716007 |
| Iran | Tehran | **Correct.** Relocation to Makran is discussed; no decision. | https://en.wikipedia.org/wiki/Iranian_capital_relocation |
| Switzerland | Bern | **Correct as the de facto capital.** Swiss law names Bern only as the seat of the federal authorities ("federal city"). | https://houseofswitzerland.org/swissstories/science-education/why-switzerland-has-no-capital-and-other-questions-you-have-about |
| Honduras | Tegucigalpa | **Correct.** Article 8 says Tegucigalpa and Comayagüela "jointly, constitute the capital"; they are one municipality, and Britannica treats Tegucigalpa as the capital for all practical purposes. | https://www.constituteproject.org/constitution/Honduras_2013?lang=en · https://www.britannica.com/place/Honduras/additional-info |
| Chile | Santiago | **Correct.** Congress sits in Valparaíso; no source gives Valparaíso a formal capital title. | https://www.britannica.com/place/Valparaiso-Chile |
| Kosovo | Pristina, `XK` | **Correct.** `XK` is user-assigned, not ISO, and is the code in general use. | https://en.wikipedia.org/wiki/XK_(user_assigned_code) |

Also searched, because neither list would have caught a change: "countries that changed capital in 2026" returned only Equatorial Guinea, and Haiti's capital is still Port-au-Prince (https://ayibopost.com/?p=63828).

## C. Typed country aliases (`COUNTRY_TYPED_ALIASES`)

**Must change**
- **`congo` under Republic of the Congo: remove it.** "Congo" is ISO's short name for `CG`, but in ordinary use it means either country; Unicode's naming guidance tells the two apart with a qualifier ("Congo (DRC)", "Congo (Republic)"). It must be accepted for neither. The comment above that line needs to go with it. Sources: https://cldr.unicode.org/translation/displaynames/countryregion-territory-names · https://assets.publishing.service.gov.uk/media/671267969cd657734653d7f5/Congo_Toponymic_Factfile.pdf
- **The typed matcher must not fall back on `NAME_ALIASES` or `canonicalize()` in `index.html`.** That table maps `congo` to the Republic of the Congo because the map data names it that way; routing typed answers through it would bring the same problem back.

**Should change**
- **`republic of china` under Taiwan: remove it.** It is Taiwan's formal name, but it is one word away from `people's republic of china`, which is listed under China. A player who types it for China is told they named Taiwan.

**Checked and fine**
- **No spelling is listed under two countries**, and no alias equals another country's name.
- **`guinea`, `sudan`, `cyprus`, `niger`, `dominica`, `china`, `ireland`** resolve only to the country whose full name they are. **`korea`, `timor`, `papua`, `sahara`, `saint`, `the congo`, `roc`, `england`** are not accepted for anything.
- **Loose but unambiguous, keep:** `britain`, `great britain`, `holland`, `america`, `macedonia`, and the part-for-whole names `antigua`, `trinidad`, `bosnia`, `saint kitts`, `saint vincent`.

**Conditions on the matcher**
- **Match the whole folded string only, never a prefix, substring or near-miss.** `republic of korea` sits inside `democratic people's republic of korea`, `republic of congo` inside `democratic republic of congo`, `niger` inside `nigeria`. One edit apart: gambia/zambia, iran/iraq, iceland/ireland, drc/prc, ksa/usa/rsa.
- **13 listed aliases only repeat the canonical name with different punctuation** (`st. lucia`, `trinidad & tobago`, `guinea bissau`, …). They are harmless, and unnecessary if the matcher folds "&", hyphens, full stops and St/Saint.

## D. Notes for whoever uses the data
- **Nicosia and North Nicosia must never be offered as two options in one question**, and Jerusalem and East Jerusalem likewise. The alternates list covers Northern Cyprus and Palestine, but Cyprus has no alternate, so "North Nicosia" could still be drawn as a wrong answer for Cyprus.
- **`XS` and `XN` render as two boxed letters if turned into a flag emoji.** Skip the flag for both, and leave both out of any flag quiz.
- **The game's list is 176 UN members plus 9 others (counted from memory, not looked up)** (Kosovo, Taiwan, Palestine, Western Sahara, Somaliland, Northern Cyprus, Falkland Islands, French Guiana, New Caledonia). It has no entry for 17 UN members (Andorra, Liechtenstein, Malta, Monaco, San Marino, Singapore, Maldives, Seychelles, São Tomé and Príncipe, Kiribati, Marshall Islands, Micronesia, Nauru, Palau, Samoa, Tonga, Tuvalu) or Vatican City, so a capitals mode built on it cannot claim to cover every country.
