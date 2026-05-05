class CountryProfile {
  final String code;
  final String localeCode;
  final String languageCode;
  final String currencyCode;
  final String name;
  final List<String> supportedLanguages;

  const CountryProfile({
    required this.code,
    required this.localeCode,
    required this.languageCode,
    required this.currencyCode,
    required this.name,
    required this.supportedLanguages,
  });
}

class CountryProfiles {
  static const poland = CountryProfile(
    code: 'PL',
    localeCode: 'pl_PL',
    languageCode: 'pl',
    currencyCode: 'PLN',
    name: 'Poland',
    supportedLanguages: ['pl', 'en'],
  );

  static const germany = CountryProfile(
    code: 'DE',
    localeCode: 'de_DE',
    languageCode: 'de',
    currencyCode: 'EUR',
    name: 'Germany',
    supportedLanguages: ['de', 'en'],
  );

  static const france = CountryProfile(
    code: 'FR',
    localeCode: 'fr_FR',
    languageCode: 'fr',
    currencyCode: 'EUR',
    name: 'France',
    supportedLanguages: ['fr', 'en'],
  );

  static const netherlands = CountryProfile(
    code: 'NL',
    localeCode: 'nl_NL',
    languageCode: 'en',
    currencyCode: 'EUR',
    name: 'Netherlands',
    supportedLanguages: ['nl', 'en'],
  );

  static const all = [
    poland,
    germany,
    france,
    netherlands,
  ];

  static CountryProfile byCode(String code) {
    return all.firstWhere(
      (profile) => profile.code == code,
      orElse: () => poland,
    );
  }
}
