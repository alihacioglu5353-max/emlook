import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';
import '../session.dart';

/// API'deki hukuki metin (`GET /legal/:slug`). Metinler tek kaynaktan gelir.
class LegalDoc {
  LegalDoc({
    required this.slug,
    required this.title,
    required this.version,
    required this.draft,
    required this.body,
  });

  final String slug;
  final String title;
  final String version;
  final bool draft;
  final String body;

  factory LegalDoc.fromJson(Map<String, dynamic> j) => LegalDoc(
        slug: j['slug'] as String,
        title: j['title'] as String,
        version: j['version'] as String,
        draft: j['draft'] as bool? ?? false,
        body: j['body'] as String,
      );
}

const legalTitles = {
  'kvkk': 'KVKK Aydınlatma Metni',
  'kosullar': 'Kullanım Koşulları',
  'ticari-ileti': 'Ticari Elektronik İleti',
};

class LegalScreen extends StatefulWidget {
  const LegalScreen({super.key, required this.session, required this.slug});
  final Session session;
  final String slug;

  @override
  State<LegalScreen> createState() => _LegalScreenState();
}

class _LegalScreenState extends State<LegalScreen> {
  LegalDoc? _doc;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final res = await widget.session.api.get<Map<String, dynamic>>('/legal/${widget.slug}');
      if (mounted) setState(() => _doc = LegalDoc.fromJson(res));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final doc = _doc;
    return Scaffold(
      appBar: AppBar(title: Text(doc?.title ?? legalTitles[widget.slug] ?? 'Hukuki metin')),
      body: _error != null
          ? ListView(padding: const EdgeInsets.all(20), children: [
              Notice(text: _error!, tone: NoticeTone.error),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _load, child: const Text('Tekrar dene')),
            ])
          : doc == null
              ? const Center(child: CircularProgressIndicator())
              : SelectionArea(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                    children: [
                      Text('Sürüm ${doc.version}',
                          style: const TextStyle(color: EmColors.inkSoft, fontSize: 13)),
                      if (doc.draft) ...[
                        const SizedBox(height: 12),
                        const Notice(
                          tone: NoticeTone.warn,
                          text: 'Bu metin taslaktır; yayından önce hukuk danışmanı tarafından son hâli verilecektir.',
                        ),
                      ],
                      ...legalBlocks(doc.body),
                    ],
                  ),
                ),
    );
  }
}

/// `**kalın**` satır içi biçimi
List<TextSpan> legalInline(String text) {
  final spans = <TextSpan>[];
  final re = RegExp(r'\*\*([^*]+)\*\*');
  var last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) spans.add(TextSpan(text: text.substring(last, m.start)));
    spans.add(TextSpan(
      text: m.group(1),
      style: const TextStyle(fontWeight: FontWeight.w600, color: EmColors.ink),
    ));
    last = m.end;
  }
  if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
  return spans;
}

final _heading = RegExp(r'^(#{1,3})\s+(.*)$');
final _bullet = RegExp(r'^\s*-\s+');
final _numbered = RegExp(r'^\s*(\d+)\.\s+');

/// Sade markdown: #, ##, ###, -, 1., >, **kalın**, paragraf
List<Widget> legalBlocks(String md) {
  const body = TextStyle(fontSize: 15, height: 1.5, color: EmColors.inkSoft);
  Widget rich(String t, {TextStyle style = body}) => Text.rich(TextSpan(style: style, children: legalInline(t)));

  final out = <Widget>[];
  final lines = md.split('\n');
  var i = 0;
  bool isBlockStart(String l) =>
      _heading.hasMatch(l) || _bullet.hasMatch(l) || _numbered.hasMatch(l) || l.startsWith('>');

  while (i < lines.length) {
    final line = lines[i].trimRight();
    if (line.trim().isEmpty) {
      i++;
      continue;
    }
    final h = _heading.firstMatch(line);
    if (h != null) {
      final level = h.group(1)!.length;
      out.add(Padding(
        padding: EdgeInsets.only(top: level == 3 ? 16 : 24, bottom: 4),
        child: rich(h.group(2)!,
            style: TextStyle(
              fontSize: level == 1 ? 22 : (level == 2 ? 17 : 15),
              fontWeight: FontWeight.w700,
              color: EmColors.ink,
              height: 1.3,
            )),
      ));
      i++;
      continue;
    }
    if (_bullet.hasMatch(line) || _numbered.hasMatch(line)) {
      final numbered = _numbered.hasMatch(line);
      final re = numbered ? _numbered : _bullet;
      while (i < lines.length && re.hasMatch(lines[i])) {
        final l = lines[i];
        final marker = numbered ? '${re.firstMatch(l)!.group(1)}.' : '•';
        out.add(Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 22, child: Text(marker, style: body)),
            Expanded(child: rich(l.replaceFirst(re, ''))),
          ]),
        ));
        i++;
      }
      continue;
    }
    if (line.startsWith('>')) {
      final parts = <String>[];
      while (i < lines.length && lines[i].startsWith('>')) {
        parts.add(lines[i].replaceFirst(RegExp(r'^>\s?'), ''));
        i++;
      }
      out.add(Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: EmColors.warnTint,
            borderRadius: BorderRadius.circular(12),
          ),
          child: rich(parts.join(' '), style: const TextStyle(fontSize: 13, color: EmColors.warn)),
        ),
      ));
      continue;
    }
    final para = <String>[];
    while (i < lines.length && lines[i].trim().isNotEmpty && !isBlockStart(lines[i])) {
      para.add(lines[i].trim());
      i++;
    }
    out.add(Padding(padding: const EdgeInsets.only(top: 10), child: rich(para.join(' '))));
  }
  return out;
}
