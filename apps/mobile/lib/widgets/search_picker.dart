import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Türkçe karakterden bağımsız karşılaştırma için sadeleştirme.
String foldTr(String s) => s
    .toLowerCase()
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .replaceAll('i̇', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c');

class PickerOption<T> {
  const PickerOption(this.value, this.label);
  final T value;
  final String label;
}

/// Uzun listeler (il, ilçe, mahalle, danışman) için aramalı seçim alanı.
class SearchPickerField<T> extends StatelessWidget {
  const SearchPickerField({
    super.key,
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.allowClear = false,
  });

  final String label;
  final List<PickerOption<T>> options;
  final T? value;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  final bool allowClear;

  @override
  Widget build(BuildContext context) {
    final selected = options.where((o) => o.value == value).firstOrNull;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: !enabled
          ? null
          : () async {
              final picked = await showModalBottomSheet<PickerOption<T>>(
                context: context,
                isScrollControlled: true,
                builder: (_) => _PickerSheet<T>(title: label, options: options),
              );
              if (picked != null) onChanged(picked.value);
            },
      child: InputDecorator(
        isEmpty: selected == null,
        decoration: InputDecoration(
          labelText: label,
          enabled: enabled,
          suffixIcon: allowClear && selected != null
              ? IconButton(icon: const Icon(Icons.close), onPressed: () => onChanged(null))
              : const Icon(Icons.expand_more),
        ),
        child: Text(selected?.label ?? '',
            style: TextStyle(color: enabled ? EmColors.ink : EmColors.inkSoft, fontSize: 16)),
      ),
    );
  }
}

class _PickerSheet<T> extends StatefulWidget {
  const _PickerSheet({required this.title, required this.options});
  final String title;
  final List<PickerOption<T>> options;

  @override
  State<_PickerSheet<T>> createState() => _PickerSheetState<T>();
}

class _PickerSheetState<T> extends State<_PickerSheet<T>> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final q = foldTr(_q.trim());
    final items = q.isEmpty ? widget.options : widget.options.where((o) => foldTr(o.label).contains(q)).toList();
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: TextField(
              autofocus: widget.options.length > 12,
              decoration: InputDecoration(labelText: '${widget.title} ara', prefixIcon: const Icon(Icons.search)),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          Expanded(
            child: items.isEmpty
                ? const Center(child: Text('Sonuç yok', style: TextStyle(color: EmColors.inkSoft)))
                : ListView.builder(
                    itemCount: items.length,
                    itemBuilder: (_, i) => ListTile(
                      title: Text(items[i].label),
                      onTap: () => Navigator.pop(context, items[i]),
                    ),
                  ),
          ),
        ]),
      ),
    );
  }
}

const _trAlphabet = 'abcçdefgğhıijklmnoöprsştuüvwxyz';

/// Türkçe alfabe sırasıyla karşılaştırma (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde).
int compareTr(String a, String b) {
  String low(String s) => s.replaceAll('I', 'ı').replaceAll('İ', 'i').toLowerCase();
  final x = low(a), y = low(b);
  final n = x.length < y.length ? x.length : y.length;
  for (var i = 0; i < n; i++) {
    final ca = x[i], cb = y[i];
    if (ca == cb) continue;
    final ia = _trAlphabet.indexOf(ca), ib = _trAlphabet.indexOf(cb);
    if (ia >= 0 && ib >= 0) return ia - ib;
    return ca.compareTo(cb);
  }
  return x.length - y.length;
}
