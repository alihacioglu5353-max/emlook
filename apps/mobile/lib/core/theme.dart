import 'package:flutter/material.dart';

/// Emlook kimliği: sıcak kırık beyaz zemin, koyu mürekkep, kırmızı vurgu.
class EmColors {
  static const paper = Color(0xFFF6F3EF);
  static const surface = Color(0xFFFFFDFB);
  static const ink = Color(0xFF16171C);
  static const inkSoft = Color(0xFF5B5D66);
  static const line = Color(0xFFE6E1DA);
  static const brand = Color(0xFFC8283F);
  static const brandTint = Color(0xFFFBE7EA);
  static const ok = Color(0xFF1F8A5B);
  static const okTint = Color(0xFFE3F4EC);
  static const warn = Color(0xFFA8670A);
  static const warnTint = Color(0xFFFDF1DC);
  static const verified = Color(0xFF2F7DE1);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: EmColors.brand,
    primary: EmColors.brand,
    surface: EmColors.surface,
    onSurface: EmColors.ink,
  );
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(14),
    borderSide: const BorderSide(color: EmColors.line),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: EmColors.paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: EmColors.paper,
      foregroundColor: EmColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    textTheme: const TextTheme(
      headlineMedium: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.6, color: EmColors.ink),
      titleLarge: TextStyle(fontWeight: FontWeight.w700, color: EmColors.ink),
      bodyMedium: TextStyle(color: EmColors.ink, height: 1.4),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: EmColors.surface,
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: EmColors.ink, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: EmColors.brand,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(52),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: EmColors.ink,
        minimumSize: const Size.fromHeight(48),
        shape: const StadiumBorder(),
        side: const BorderSide(color: EmColors.line),
      ),
    ),
    cardTheme: CardThemeData(
      color: EmColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: EmColors.line),
      ),
    ),
  );
}
