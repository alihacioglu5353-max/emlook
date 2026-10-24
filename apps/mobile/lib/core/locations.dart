import 'api_client.dart';
import '../widgets/search_picker.dart';

/// İl / ilçe / mahalle listeleri; uygulama açıkken bellekte tutulur.
class Locations {
  Locations(this._api);
  final ApiClient _api;

  List<PickerOption<String>>? _cities;
  final _districts = <String, List<PickerOption<int>>>{};
  final _neighbourhoods = <int, List<PickerOption<int>>>{};

  static int _byName(PickerOption a, PickerOption b) => compareTr(a.label, b.label);

  Future<List<PickerOption<String>>> cities() async => _cities ??= ((await _api
          .get<List<dynamic>>('/locations/cities'))
      .map((c) => PickerOption<String>(c['code'] as String, c['name'] as String))
      .toList()
    ..sort(_byName));

  Future<List<PickerOption<int>>> districts(String cityCode) async =>
      _districts[cityCode] ??= ((await _api.get<List<dynamic>>('/locations/cities/$cityCode/districts'))
          .map((d) => PickerOption<int>((d['id'] as num).toInt(), d['name'] as String))
          .toList()
        ..sort(_byName));

  Future<List<PickerOption<int>>> neighbourhoods(int districtId) async =>
      _neighbourhoods[districtId] ??=
          ((await _api.get<List<dynamic>>('/locations/districts/$districtId/neighbourhoods'))
              .map((n) => PickerOption<int>((n['id'] as num).toInt(), n['name'] as String))
              .toList()
            ..sort(_byName));
}
